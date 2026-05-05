import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PRESET_MICROSOFT_365 } from "./lib/mail-presets.js";

export const ENV_FILE_PATH = path.resolve(process.cwd(), ".env");

/**
 * Đọc `.env` nhưng **không** ghi đè biến đã có (vd. SMTP_USER / SMTP_PASS do Railway inject).
 * Tránh file `.env` mẫu hoặc dòng trống làm mất cấu hình trên PaaS.
 */
export function refreshEnvFromDisk(): void {
  dotenv.config({ path: ENV_FILE_PATH, override: false });
}

/** Gọi ngay sau khi API ghi `.env` từ form — cần đọc lại giá trị mới từ file. */
export function reloadEnvFromFileAfterSave(): void {
  dotenv.config({ path: ENV_FILE_PATH, override: true });
}

refreshEnvFromDisk();

/** Thông báo thống nhất khi thiếu mailbox (UI + API + Railway). */
export const ERR_MAILBOX_NOT_LINKED =
  "Chưa kết nối email Microsoft 365: nhập email công ty và mật khẩu (hoặc mã ứng dụng) ở «Bước 1 · Kết nối email công việc» trên web. Trên Railway / server cloud: thêm Variables SMTP_USER và SMTP_PASS (máy chủ smtp.office365.com đã cấu hình sẵn trong app).";

function opt(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export type MailConfig = {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  imap: {
    host: string;
    port: number;
    tls: boolean;
  };
  attachmentsDir: string;
  repliesDir: string;
  sendDelayMs: number;
  outboundLogPath: string;
  repliesIndexPath: string;
};

export function isMailConfigComplete(): boolean {
  refreshEnvFromDisk();
  const user = opt("SMTP_USER", "");
  const pass = opt("SMTP_PASS", "");
  return Boolean(user.trim() && pass.trim());
}

/** Gửi magic link qua Resend (HTTP) — không phụ thuộc SMTP tới Office365 từ IP cloud. */
export function isResendApiConfigured(): boolean {
  refreshEnvFromDisk();
  return Boolean(process.env["RESEND_API_KEY"]?.trim());
}

/** Đủ điều kiện gửi magic link: SMTP hệ thống hoặc Resend. */
export function isMagicLinkMailConfigured(): boolean {
  return isMailConfigComplete() || isResendApiConfigured();
}

export function getStoragePaths(): {
  attachmentsDir: string;
  repliesDir: string;
  sendDelayMs: number;
  outboundLogPath: string;
  repliesIndexPath: string;
} {
  refreshEnvFromDisk();
  return {
    attachmentsDir: path.resolve(opt("ATTACHMENTS_DIR", "./data/attachments")),
    repliesDir: path.resolve(opt("REPLIES_DIR", "./data/replies")),
    sendDelayMs: num("SEND_DELAY_MS", 3500),
    outboundLogPath: path.resolve("./data/outbound-log.jsonl"),
    repliesIndexPath: path.resolve("./data/replies-index.jsonl"),
  };
}

export function getMailConfig(): MailConfig {
  const mail = partialMailFromEnv();
  const smtpUser = mail.smtpUser;
  const smtpPass = mail.smtpPass;
  if (!smtpUser || !smtpPass) {
    throw new Error(ERR_MAILBOX_NOT_LINKED);
  }
  const p = getStoragePaths();
  return {
    smtp: {
      host: mail.smtpHost,
      port: mail.smtpPort,
      secure: mail.smtpSecure,
      user: smtpUser,
      pass: smtpPass,
    },
    imap: {
      host: mail.imapHost,
      port: mail.imapPort,
      tls: mail.imapTls,
    },
    ...p,
  };
}

function partialMailFromEnv() {
  return {
    smtpHost: opt("SMTP_HOST", PRESET_MICROSOFT_365.smtpHost),
    smtpPort: num("SMTP_PORT", PRESET_MICROSOFT_365.smtpPort),
    smtpSecure: bool("SMTP_SECURE", PRESET_MICROSOFT_365.smtpSecure),
    smtpUser: opt("SMTP_USER", "").trim(),
    smtpPass: opt("SMTP_PASS", "").trim(),
    imapHost: opt("IMAP_HOST", PRESET_MICROSOFT_365.imapHost),
    imapPort: num("IMAP_PORT", PRESET_MICROSOFT_365.imapPort),
    imapTls: bool("IMAP_TLS", PRESET_MICROSOFT_365.imapTls),
  };
}

export type MailPartial = ReturnType<typeof partialMailFromEnv>;

export function getMailPartial(): MailPartial {
  refreshEnvFromDisk();
  return partialMailFromEnv();
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function loadImapAuth(): { user: string; pass: string } {
  refreshEnvFromDisk();
  const user = opt("IMAP_USER", process.env["SMTP_USER"] ?? "").trim();
  const imapPass = process.env["IMAP_PASS"]?.trim();
  const pass =
    imapPass && imapPass.length > 0
      ? imapPass
      : opt("SMTP_PASS", "").trim();
  if (!user || !pass) throw new Error(ERR_MAILBOX_NOT_LINKED);
  return { user, pass };
}
