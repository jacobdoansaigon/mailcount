import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { OutboundRecord, ReplyRecord } from "./types.js";
import { readOutboundLog, readJsonlLines } from "./outbound-log.js";

export const REPORT_HEADERS = [
  "recipient_email",
  "recipient_name",
  "survey_code",
  "sent_at",
  "outbound_subject",
  "reply_received",
  "reply_latest_at",
  "reply_correlation",
  "reply_attachment_count",
  "reply_folder",
  "reply_from_address",
] as const;

export type ReportRow = Record<(typeof REPORT_HEADERS)[number], string>;

export function pickRepliesForOutbound(
  o: OutboundRecord,
  replies: ReplyRecord[],
): ReplyRecord[] {
  const email = o.recipientEmail.toLowerCase().trim();
  return replies.filter((r) => {
    const byCode =
      r.matchedSurveyCode &&
      r.matchedSurveyCode.toUpperCase() === o.surveyCode.toUpperCase();
    const byFrom =
      r.fromAddress.toLowerCase().trim() === email && email.length > 0;
    return Boolean(byCode || byFrom);
  });
}

export function buildReportRows(
  outbound: OutboundRecord[],
  replies: ReplyRecord[],
  cwd: string = process.cwd(),
): ReportRow[] {
  const rows: ReportRow[] = [];

  for (const o of outbound) {
    const hits = pickRepliesForOutbound(o, replies);
    hits.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
    const best = hits[0];
    const dirHint =
      best?.bodyTextPath ??
      best?.bodyHtmlPath ??
      best?.attachmentPaths?.[0];
    const folderRel =
      best && dirHint
        ? path.relative(cwd, path.dirname(dirHint))
        : "";
    rows.push({
      recipient_email: o.recipientEmail,
      recipient_name: o.recipientName ?? "",
      survey_code: o.surveyCode,
      sent_at: o.sentAt,
      outbound_subject: o.subject,
      reply_received: best ? "yes" : "no",
      reply_latest_at: best?.receivedAt ?? "",
      reply_correlation: best?.correlation ?? "",
      reply_attachment_count: best
        ? String(best.attachmentPaths?.length ?? 0)
        : "0",
      reply_folder: folderRel.replace(/\\/g, "/"),
      reply_from_address: best?.fromAddress ?? "",
    });
  }

  return rows;
}

export function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function rowsToCsvString(rows: ReportRow[]): string {
  const lines = [REPORT_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      REPORT_HEADERS.map((h) => csvCell(r[h] ?? "")).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export async function generateReportCsv(
  outboundLogPath: string,
  repliesIndexPath: string,
): Promise<string> {
  const outbound = await readOutboundLog(outboundLogPath);
  const replies = await readJsonlLines<ReplyRecord>(repliesIndexPath);
  const rows = buildReportRows(outbound, replies);
  return rowsToCsvString(rows);
}

export async function writeReportCsv(
  outboundLogPath: string,
  repliesIndexPath: string,
  outPath: string,
): Promise<void> {
  const body = await generateReportCsv(outboundLogPath, repliesIndexPath);
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, body, "utf8");
}
