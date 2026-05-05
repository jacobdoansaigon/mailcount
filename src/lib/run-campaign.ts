import path from "node:path";
import { nanoid } from "nanoid";
import { ensureDir } from "../config.js";
import {
  collectAttachmentPathsMany,
  loadRecipientsCsv,
} from "./csv-recipients.js";
import { sendOneMail } from "./smtp-send.js";
import type { OutboundRecord } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type RunSendCampaignParams = {
  csvPath: string;
  subjectTemplate: string;
  textBody: string;
  htmlBody?: string;
  dryRun: boolean;
  limit?: number;
  delayMs: number;
  /** Thư mục thêm (vd upload từ UI), ghép với attachmentsDir mặc định */
  extraAttachmentDirs?: string[];
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  attachmentsDir: string;
  outboundLogPath: string;
  onSent?: (args: {
    index: number;
    total: number;
    record: OutboundRecord;
  }) => void;
};

export type DryRunRecipient = {
  email: string;
  name?: string;
  greeting?: string;
  title?: string;
  surveyCode: string;
};

export type RunSendCampaignResult = {
  dryRunRecipients?: DryRunRecipient[];
  records: OutboundRecord[];
  attachmentCount: number;
  recipientCount: number;
};

export async function runSendCampaign(
  p: RunSendCampaignParams,
): Promise<RunSendCampaignResult> {
  const recipients = loadRecipientsCsv(path.resolve(p.csvPath));
  if (!recipients.length) {
    throw new Error(
      "Không có dòng recipient hợp lệ trong CSV (cần cột email).",
    );
  }

  ensureDir(path.dirname(p.outboundLogPath));
  ensureDir(p.attachmentsDir);

  const dirs = [p.attachmentsDir, ...(p.extraAttachmentDirs ?? [])].filter(
    (d) => d.trim().length > 0,
  );
  const attachPaths = collectAttachmentPathsMany(dirs);

  let limit =
    p.limit !== undefined ? Math.max(0, parseInt(String(p.limit), 10)) : Infinity;
  if (!Number.isFinite(limit)) limit = Infinity;

  const toSend = recipients.slice(
    0,
    Number.isFinite(limit) ? Math.min(limit, recipients.length) : recipients.length,
  );

  if (p.dryRun) {
    const dryRunRecipients: DryRunRecipient[] = toSend.map((r) => ({
      email: r.email,
      name: r.name,
      greeting: r.greeting,
      title: r.title,
      surveyCode:
        r.surveyCode?.trim() ||
        nanoid(10).replace(/-/g, "").slice(0, 10).toUpperCase(),
    }));
    return {
      dryRunRecipients,
      records: [],
      attachmentCount: attachPaths.length,
      recipientCount: toSend.length,
    };
  }

  const records: OutboundRecord[] = [];
  let n = 0;
  for (const r of toSend) {
    const surveyCode =
      r.surveyCode?.trim() ||
      nanoid(10).replace(/-/g, "").slice(0, 10).toUpperCase();

    const record = await sendOneMail({
      smtpHost: p.smtp.host,
      smtpPort: p.smtp.port,
      smtpSecure: p.smtp.secure,
      smtpUser: p.smtp.user,
      smtpPass: p.smtp.pass,
      to: r.email,
      toName: r.name,
      greeting: r.greeting,
      title: r.title,
      subjectTemplate: p.subjectTemplate,
      textBody: p.textBody,
      htmlBody: p.htmlBody,
      attachmentPaths: attachPaths,
      surveyCode,
      outboundLogPath: p.outboundLogPath,
    });

    n += 1;
    records.push(record);
    p.onSent?.({ index: n, total: toSend.length, record });

    if (n < toSend.length && p.delayMs > 0) await sleep(p.delayMs);
  }

  return {
    records,
    attachmentCount: attachPaths.length,
    recipientCount: toSend.length,
  };
}
