import fs from "node:fs/promises";
import path from "node:path";
import { getJwtSecret } from "../auth/session-jwt.js";
import type { MailConfig } from "../config.js";
import { decryptSecret } from "../lib/secret-crypto.js";
import {
  PRESET_MICROSOFT_365,
  resolveMicrosoft365ImapHost,
  resolveMicrosoft365SmtpHost,
} from "../lib/mail-presets.js";
import { UserModel } from "../models/User.js";

export function userWorkspacePaths(userId: string) {
  const root = path.join(process.cwd(), "data", "mongo-users", userId);
  return {
    root,
    attachmentsDir: path.join(root, "attachments"),
    repliesDir: path.join(root, "replies"),
    outboundLogPath: path.join(root, "outbound-log.jsonl"),
    repliesIndexPath: path.join(root, "replies-index.jsonl"),
    campaignCsv: path.join(root, "campaign.csv"),
  };
}

export async function getUserMailConfig(userId: string): Promise<MailConfig> {
  const u = await UserModel.findById(userId).lean();
  if (!u?.mailbox?.smtpUser?.trim()) {
    throw new Error(
      "Chưa kết nối email Microsoft 365: nhập email công việc và mật khẩu ở Bước 1.",
    );
  }
  const enc = u.mailbox.smtpPassEnc?.trim();
  if (!enc) {
    throw new Error(
      "Chưa kết nối email Microsoft 365: cần mật khẩu hoặc mã ứng dụng mailbox.",
    );
  }
  const pass = decryptSecret(enc, getJwtSecret());
  const p = userWorkspacePaths(userId);
  await fs.mkdir(p.attachmentsDir, { recursive: true });
  await fs.mkdir(p.repliesDir, { recursive: true });
  await fs.mkdir(path.dirname(p.outboundLogPath), { recursive: true });

  const smtpHost = resolveMicrosoft365SmtpHost(u.mailbox.smtpHost);
  const smtpPort = u.mailbox.smtpPort || PRESET_MICROSOFT_365.smtpPort;
  const smtpSecure =
    u.mailbox.smtpSecure ?? PRESET_MICROSOFT_365.smtpSecure;
  const imapHost = resolveMicrosoft365ImapHost(u.mailbox.imapHost);
  const imapPort = u.mailbox.imapPort || PRESET_MICROSOFT_365.imapPort;
  const imapTls = u.mailbox.imapTls ?? PRESET_MICROSOFT_365.imapTls;
  const delay = Number.isFinite(u.sendDelayMs) ? u.sendDelayMs! : 3500;

  return {
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: u.mailbox.smtpUser.trim(),
      pass,
    },
    imap: {
      host: imapHost,
      port: imapPort,
      tls: imapTls,
    },
    attachmentsDir: p.attachmentsDir,
    repliesDir: p.repliesDir,
    sendDelayMs: delay,
    outboundLogPath: p.outboundLogPath,
    repliesIndexPath: p.repliesIndexPath,
  };
}

export async function getUserImapCredentials(
  userId: string,
): Promise<{ user: string; pass: string }> {
  const cfg = await getUserMailConfig(userId);
  return { user: cfg.smtp.user, pass: cfg.smtp.pass };
}
