/**
 * Cấu hình mail chuẩn trong code — end user chỉ nhập email + mật khẩu (Microsoft 365).
 * Admin vẫn có thể override qua biến môi trường nếu cần.
 */
export const PRESET_MICROSOFT_365 = {
  id: "microsoft365",
  label: "Microsoft 365",
  tagline: "Outlook / email công ty — máy chủ đã cài sẵn, không cần biết SMTP hay IMAP.",
  smtpHost: "smtp.office365.com",
  smtpPort: 587,
  smtpSecure: false,
  imapHost: "outlook.office365.com",
  imapPort: 993,
  imapTls: true,
  defaultSendDelayMs: 3500,
} as const;

/**
 * Thứ tự: `MICROSOFT365_SMTP_HOST` (Railway / server) → host lưu trong Mongo user → mặc định.
 * Dùng khi `smtp.office365.com` từ một số mạng cloud có vấn đề DNS/IPv6.
 */
export function resolveMicrosoft365SmtpHost(
  userMailboxHost?: string | null,
): string {
  const env = process.env["MICROSOFT365_SMTP_HOST"]?.trim();
  if (env) return env;
  const fromUser = userMailboxHost?.trim();
  if (fromUser) return fromUser;
  return PRESET_MICROSOFT_365.smtpHost;
}

export function resolveMicrosoft365ImapHost(
  userMailboxHost?: string | null,
): string {
  const env = process.env["MICROSOFT365_IMAP_HOST"]?.trim();
  if (env) return env;
  const fromUser = userMailboxHost?.trim();
  if (fromUser) return fromUser;
  return PRESET_MICROSOFT_365.imapHost;
}

export type WorkAccountEnvUpdates = Record<string, string | null | undefined>;

/** Ghi đè .env với preset M365 + mailbox công việc; IMAP dùng chung SMTP_USER / SMTP_PASS */
export function buildMicrosoft365EnvForAccount(
  workEmail: string,
  password: string | undefined,
  opts?: { sendDelayMs?: number },
): WorkAccountEnvUpdates {
  const d = opts?.sendDelayMs ?? PRESET_MICROSOFT_365.defaultSendDelayMs;
  const updates: WorkAccountEnvUpdates = {
    SMTP_HOST: PRESET_MICROSOFT_365.smtpHost,
    SMTP_PORT: String(PRESET_MICROSOFT_365.smtpPort),
    SMTP_SECURE: PRESET_MICROSOFT_365.smtpSecure ? "true" : "false",
    SMTP_USER: workEmail.trim(),
    IMAP_HOST: PRESET_MICROSOFT_365.imapHost,
    IMAP_PORT: String(PRESET_MICROSOFT_365.imapPort),
    IMAP_TLS: PRESET_MICROSOFT_365.imapTls ? "true" : "false",
    IMAP_USER: null,
    IMAP_PASS: null,
    SEND_DELAY_MS: String(d),
  };
  if (password !== undefined && password.length > 0) {
    updates.SMTP_PASS = password;
  }
  return updates;
}
