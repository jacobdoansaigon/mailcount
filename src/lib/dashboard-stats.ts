import type { OutboundRecord, ReplyRecord } from "./types.js";
import { buildReportRows } from "./report.js";

export type DashboardTimelinePoint = {
  date: string;
  sent: number;
  replies: number;
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
};

const MS_DAY = 86400000;

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
  };
}
