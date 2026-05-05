import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { OutboundRecord } from "./types.js";
import { appendOutboundRecord } from "./outbound-log.js";

export type SendMailInput = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  to: string;
  toName?: string;
  subjectTemplate: string;
  textBody: string;
  htmlBody?: string;
  attachmentPaths: string[];
  surveyCode: string;
  outboundLogPath: string;
};

function mimeFor(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".zip": "application/zip",
    ".csv": "text/csv",
  };
  return map[ext];
}

/** domain cho phần @ trong Message-ID (RFC không bắt buộc FQDN thật) */
function domainFromEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at < 0) return "localhost";
  return addr.slice(at + 1) || "localhost";
}

export function renderSubject(template: string, ctx: RecipientContext): string {
  return template
    .replaceAll("{{code}}", ctx.surveyCode)
    .replaceAll("{{name}}", ctx.name ?? "")
    .replaceAll("{{email}}", ctx.email);
}

type RecipientContext = { surveyCode: string; name?: string; email: string };

export async function sendOneMail(opts: SendMailInput): Promise<OutboundRecord> {
  const domain = domainFromEmail(opts.smtpUser);
  const messageId = `<${nanoid(16)}.${Date.now()}@${domain}>`;
  let subject = renderSubject(opts.subjectTemplate, {
    surveyCode: opts.surveyCode,
    name: opts.toName,
    email: opts.to,
  });
  if (!/\[CODE:/i.test(subject)) {
    subject = `${subject.trimEnd()} [CODE: ${opts.surveyCode}]`;
  }

  const attachments = opts.attachmentPaths.map((p) => ({
    filename: path.basename(p),
    content: fs.createReadStream(p),
    contentType: mimeFor(p),
  }));

  const transporter = nodemailer.createTransport({
    host: opts.smtpHost,
    port: opts.smtpPort,
    secure: opts.smtpSecure,
    auth: {
      user: opts.smtpUser,
      pass: opts.smtpPass,
    },
  });

  const info = await transporter.sendMail({
    envelope: {
      from: opts.smtpUser,
      to: opts.to,
    },
    from: opts.toName
      ? `"${opts.toName.replace(/"/g, "")}" <${opts.smtpUser}>`
      : opts.smtpUser,
    to: opts.toName
      ? `"${opts.toName.replace(/"/g, "")}" <${opts.to}>`
      : opts.to,
    subject,
    text: opts.textBody,
    html: opts.htmlBody,
    messageId,
    headers: {
      "X-Survey-Code": opts.surveyCode,
    },
    attachments,
  });

  const actualMid =
    typeof info.messageId === "string" && info.messageId.trim()
      ? info.messageId.trim()
      : messageId;

  const record: OutboundRecord = {
    recipientEmail: opts.to,
    recipientName: opts.toName,
    surveyCode: opts.surveyCode,
    messageId: actualMid,
    sentAt: new Date().toISOString(),
    subject,
  };

  await appendOutboundRecord(opts.outboundLogPath, record);
  return record;
}
