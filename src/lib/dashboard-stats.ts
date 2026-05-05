import fs from "node:fs";
import type { OutboundRecord, ReplyRecord } from "./types.js";
import { buildReportRows, pickRepliesForOutbound } from "./report.js";

export type DashboardTimelinePoint = {
  date: string;
  sent: number;
  replies: number;
};

export type LeaderboardEntry = {
  email: string;
  name: string;
  /** Hiển thị ngắn: thời gian phản hồi hoặc điểm nội dung */
  label: string;
};

export type DashboardPayload = {
  totals: {
    sent: number;
    repliesMatchedOnCampaign: number;
    pending: number;
    polledMessages: number;
    responseRatePct: number;
  };
  timeline: DashboardTimelinePoint[];
  correlation: Record<string, number>;
  repliesWithAttachments: number;
  lastSentAt: string | null;
  lastReplyAt: string | null;
  /** Phản hồi nhanh nhất (so với lúc gửi) — tối đa 2 */
  fastestReplies: LeaderboardEntry[];
  /** Phản hồi có nhiều nội dung nhất (dung lượng + đính kèm) — tối đa 2 */
  richestReplies: LeaderboardEntry[];
};

const MS_DAY = 86400000;

function formatDurationShort(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 120) return `${s}s`;
  const m = Math.round(ms / 60000);
  if (m < 120) return `${m}p`;
  const h = Math.floor(ms / 3600000);
  const rm = Math.round((ms % 3600000) / 60000);
  return `${h}g${rm}p`;
}

function replyInfoScore(r: ReplyRecord): number {
  let score = (r.attachmentPaths?.length ?? 0) * 8000;
  for (const p of [r.bodyTextPath, r.bodyHtmlPath]) {
    if (!p) continue;
    try {
      score += fs.statSync(p).size;
    } catch {
      /* missing */
    }
  }
  score += (r.subject?.length ?? 0) * 3;
  return score;
}

function computeLeaderboards(
  outbound: OutboundRecord[],
  replies: ReplyRecord[],
): {
  fastestReplies: LeaderboardEntry[];
  richestReplies: LeaderboardEntry[];
} {
  type Fast = { email: string; name: string; deltaMs: number };
  const fastList: Fast[] = [];
  for (const o of outbound) {
    const hits = pickRepliesForOutbound(o, replies);
    if (!hits.length) continue;
    const sorted = [...hits].sort(
      (a, b) =>
        new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    );
    const first = sorted[0]!;
    const delta =
      new Date(first.receivedAt).getTime() - new Date(o.sentAt).getTime();
    if (!Number.isFinite(delta) || delta < 0) continue;
    fastList.push({
      email: o.recipientEmail,
      name: (o.recipientName ?? "").trim(),
      deltaMs: delta,
    });
  }
  fastList.sort((a, b) => a.deltaMs - b.deltaMs);
  const seenFast = new Set<string>();
  const fastestReplies: LeaderboardEntry[] = [];
  for (const x of fastList) {
    const k = x.email.toLowerCase();
    if (seenFast.has(k)) continue;
    seenFast.add(k);
    fastestReplies.push({
      email: x.email,
      name: x.name,
      label: `${formatDurationShort(x.deltaMs)}${x.name ? ` · ${x.name}` : ""}`,
    });
    if (fastestReplies.length >= 2) break;
  }

  type Rich = { email: string; name: string; score: number };
  const richList: Rich[] = [];
  for (const o of outbound) {
    const hits = pickRepliesForOutbound(o, replies);
    if (!hits.length) continue;
    let best = hits[0]!;
    let bestScore = replyInfoScore(best);
    for (const h of hits.slice(1)) {
      const sc = replyInfoScore(h);
      if (sc > bestScore) {
        bestScore = sc;
        best = h;
      }
    }
    if (bestScore <= 0) continue;
    richList.push({
      email: o.recipientEmail,
      name: (o.recipientName ?? "").trim(),
      score: bestScore,
    });
  }
  richList.sort((a, b) => b.score - a.score);
  const seenRich = new Set<string>();
  const richestReplies: LeaderboardEntry[] = [];
  for (const x of richList) {
    const k = x.email.toLowerCase();
    if (seenRich.has(k)) continue;
    seenRich.add(k);
    const kb = Math.round(x.score / 1024);
    richestReplies.push({
      email: x.email,
      name: x.name,
      label: `${kb >= 1 ? `~${kb} KB` : `${x.score} B`}${x.name ? ` · ${x.name}` : ""}`,
    });
    if (richestReplies.length >= 2) break;
  }

  return { fastestReplies, richestReplies };
}

export function buildDashboardPayload(
  outbound: OutboundRecord[],
  replies: ReplyRecord[],
  timelineDays = 14,
): DashboardPayload {
  const report = buildReportRows(outbound, replies);
  const replied = report.filter((r) => r.reply_received === "yes").length;
  const sent = outbound.length;
  const pending = sent > 0 ? Math.max(sent - replied, 0) : 0;
  const responseRatePct =
    sent > 0 ? Math.min(100, Math.round((100 * replied) / sent)) : 0;

  const correlation: Record<string, number> = {};
  for (const r of replies) {
    const c = r.correlation ?? "unknown";
    correlation[c] = (correlation[c] ?? 0) + 1;
  }

  const repliesWithAttachments = replies.filter(
    (r) => (r.attachmentPaths?.length ?? 0) > 0,
  ).length;

  let lastSentAt: string | null = null;
  for (const o of outbound) {
    if (!lastSentAt || o.sentAt > lastSentAt) lastSentAt = o.sentAt;
  }
  let lastReplyAt: string | null = null;
  for (const r of replies) {
    if (!lastReplyAt || r.receivedAt > lastReplyAt) lastReplyAt = r.receivedAt;
  }

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, { sent: number; replies: number }>();
  for (let i = timelineDays - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * MS_DAY);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { sent: 0, replies: 0 });
  }
  for (const o of outbound) {
    const day = o.sentAt.slice(0, 10);
    const b = buckets.get(day);
    if (b) b.sent += 1;
  }
  for (const r of replies) {
    const day = r.receivedAt.slice(0, 10);
    const b = buckets.get(day);
    if (b) b.replies += 1;
  }
  const timeline = [...buckets.entries()].map(([date, v]) => ({
    date,
    sent: v.sent,
    replies: v.replies,
  }));

  const { fastestReplies, richestReplies } = computeLeaderboards(
    outbound,
    replies,
  );

  return {
    totals: {
      sent,
      repliesMatchedOnCampaign: replied,
      pending,
      polledMessages: replies.length,
      responseRatePct,
    },
    timeline,
    correlation,
    repliesWithAttachments,
    lastSentAt,
    lastReplyAt,
    fastestReplies,
    richestReplies,
  };
}
