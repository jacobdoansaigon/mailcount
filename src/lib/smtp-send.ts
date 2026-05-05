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
  /** Xưng hô cá nhân (vd từ CSV): "Anh Minh", "Chị Lan" — dùng trong mẫu {{greeting}} / {{greetingOrName}} */
  greeting?: string;
  /** Chức vụ — {{title}} */
  title?: string;
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

export type MailTemplateContext = {
  surveyCode: string;
  name?: string;
  email: string;
  greeting?: string;
  title?: string;
};

/** Thay placeholder trong tiêu đề / nội dung text / HTML. */
export function renderMailTemplate(
  template: string,
  ctx: MailTemplateContext,
): string {
  const name = (ctx.name ?? "").trim();
  const greeting = (ctx.greeting ?? "").trim();
  const greetingOrName = greeting || name;
  const title = (ctx.title ?? "").trim();
  return template
    .replaceAll("{{greetingOrName}}", greetingOrName)
    .replaceAll("{{greeting}}", greeting)
    .replaceAll("{{code}}", ctx.surveyCode)
    .replaceAll("{{name}}", name)
    .replaceAll("{{email}}", ctx.email)
    .replaceAll("{{title}}", title);
}

export function renderSubject(
  template: string,
  ctx: MailTemplateContext,
): string {
  return renderMailTemplate(template, ctx);
}

export async function sendOneMail(opts: SendMailInput): Promise<OutboundRecord> {
  const domain = domainFromEmail(opts.smtpUser);
  const messageId = `<${nanoid(16)}.${Date.now()}@${domain}>`;
  const tplCtx: MailTemplateContext = {
    surveyCode: opts.surveyCode,
    name: opts.toName,
    email: opts.to,
    greeting: opts.greeting,
    title: opts.title,
  };
  let subject = renderMailTemplate(opts.subjectTemplate, tplCtx);
  if (!/\[CODE:/i.test(subject)) {
    subject = `${subject.trimEnd()} [CODE: ${opts.surveyCode}]`;
  }

  const textBody = renderMailTemplate(opts.textBody, tplCtx);
  const htmlBody = opts.htmlBody
    ? renderMailTemplate(opts.htmlBody, tplCtx)
    : undefined;

  const attachments = opts.attachmentPaths.map((p) => ({
    filename: path.basename(p),
    content: fs.createReadStream(p),
    contentType: mimeFor(p),
  }));

  const displayName =
    (opts.toName?.trim() || opts.greeting?.trim()) ?? undefined;

  const transporter = nodemailer.createTransport({
    host: opts.smtpHost,
    port: opts.smtpPort,
    secure: opts.smtpSecure,
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
    socketTimeout: 120_000,
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
    from: displayName
      ? `"${displayName.replace(/"/g, "")}" <${opts.smtpUser}>`
      : opts.smtpUser,
    to: displayName
      ? `"${displayName.replace(/"/g, "")}" <${opts.to}>`
      : opts.to,
    subject,
    text: textBody,
    html: htmlBody,
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
    recipientName: opts.toName ?? displayName,
    surveyCode: opts.surveyCode,
    messageId: actualMid,
    sentAt: new Date().toISOString(),
    subject,
  };

  await appendOutboundRecord(opts.outboundLogPath, record);
  return record;
}
