import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

export const ENV_FILE_PATH = path.resolve(process.cwd(), ".env");

/** Gọi lại sau khi ghi .env từ UI */
export function refreshEnvFromDisk(): void {
  dotenv.config({ path: ENV_FILE_PATH, override: true });
}

refreshEnvFromDisk();

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
    throw new Error(
      "Chưa cấu hình SMTP: tạo file .env hoặc dùng mục Setup trên web.",
    );
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
    smtpHost: opt("SMTP_HOST", "smtp.office365.com"),
    smtpPort: num("SMTP_PORT", 587),
    smtpSecure: bool("SMTP_SECURE", false),
    smtpUser: opt("SMTP_USER", "").trim(),
    smtpPass: opt("SMTP_PASS", "").trim(),
    imapHost: opt("IMAP_HOST", "outlook.office365.com"),
    imapPort: num("IMAP_PORT", 993),
    imapTls: bool("IMAP_TLS", true),
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
  if (!user) throw new Error("SMTP_USER hoặc IMAP_USER không được để trống");
  if (!pass) throw new Error("SMTP_PASS hoặc IMAP_PASS không được để trống");
  return { user, pass };
}
