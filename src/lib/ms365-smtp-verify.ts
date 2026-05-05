import nodemailer from "nodemailer";
import {
  microsoft365SmtpConnectTimeoutMs,
  resolveMicrosoft365SmtpHost,
  resolveMicrosoft365SmtpPort,
  resolveMicrosoft365SmtpSecureForPort,
} from "./mail-presets.js";

/**
 * Kiểm tra email + mật khẩu mailbox với **smtp.office365.com** (Microsoft client submission),
 * không gửi mail — gọi `transporter.verify()` như tài liệu Nodemailer.
 */
export async function verifyMicrosoft365Smtp(params: {
  mailboxEmail: string;
  mailboxPassword: string;
}): Promise<void> {
  const user = params.mailboxEmail.trim().toLowerCase();
  const pass = params.mailboxPassword;
  if (!user || !pass) {
    throw new Error("Thiếu email hoặc mật khẩu mailbox để kiểm tra với Microsoft.");
  }

  const host = resolveMicrosoft365SmtpHost(null);
  const port = resolveMicrosoft365SmtpPort(null);
  const secure = resolveMicrosoft365SmtpSecureForPort(port, null);
  const connMs = microsoft365SmtpConnectTimeoutMs();
  const verifyDeadlineMs = Math.min(95_000, Math.max(45_000, connMs * 2 + 10_000));

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    connectionTimeout: connMs,
    greetingTimeout: connMs,
    socketTimeout: connMs + 25_000,
    auth: { user, pass },
    tls: {
      minVersion: "TLSv1.2" as const,
      servername: host,
    },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(
      () =>
        rej(
          new Error(
            `TIMEOUT: Không nhận phản hồi từ ${host}:${port} trong ${Math.round(verifyDeadlineMs / 1000)}s (firewall / cổng bị chặn?).`,
          ),
        ),
      verifyDeadlineMs,
    );
  });

  try {
    await Promise.race([transporter.verify(), deadline]);
  } catch (e) {
    const raw = String(e instanceof Error ? e.message : e);
    throw new Error(formatMicrosoftSmtpError(raw));
  } finally {
    if (timer) clearTimeout(timer);
    transporter.close();
  }
}

/** Dùng cho verify + gửi mail (nodemailer) — gom lỗi Microsoft thành tiếng Việt ngắn. */
export function formatMicrosoftSmtpError(raw: string): string {
  const low = raw.toLowerCase();
  if (
    low.includes("chưa kết nối") ||
    low.includes("chưa cấu hình") ||
    low.includes("thiếu file csv") ||
    low.includes("không có dòng recipient")
  ) {
    return raw.slice(0, 500);
  }
  const tag = "[Microsoft 365 SMTP] ";

  if (
    low.includes("invalid login") ||
    low.includes("authentication unsuccessful") ||
    low.includes("535 5.7.3") ||
    low.includes("535 5.7.139") ||
    low.includes("535 5.7.8")
  ) {
    return (
      tag +
      "Đăng nhập SMTP bị từ chối. Kiểm tra đúng email mailbox và mật khẩu; nếu bật MFA phải dùng mật khẩu ứng dụng (App password) trong tài khoản Microsoft."
    );
  }
  if (
    low.includes("534") ||
    low.includes("basic authentication is disabled") ||
    low.includes("smtp client authentication is disabled")
  ) {
    return (
      tag +
      "SMTP AUTH (đăng nhập cơ bản) có thể bị tắt cho tenant hoặc mailbox. Admin Microsoft cần bật «Authenticated SMTP» / SMTP AUTH (client submission) cho user này (Exchange admin / per-mailbox)."
    );
  }
  if (low.includes("eauthnotsupported") || low.includes("504 5.7.4")) {
    return (
      tag +
      "Máy chủ không chấp nhận cách xác thực hiện tại — thường do sai cổng/TLS; app đã dùng smtp.office365.com:587 + STARTTLS."
    );
  }
  if (
    low.includes("etimedout") ||
    low.includes("enotfound") ||
    low.includes("econnrefused") ||
    low.includes("timeout") ||
    low.includes("getaddrinfo")
  ) {
    return (
      `${tag}Không kết nối được tới máy chủ SMTP (${raw.slice(0, 200)}). ` +
      "Trên Railway thử lần lượt: (1) MICROSOFT365_SMTP_PORT=465 và MICROSOFT365_SMTP_SECURE=true nếu cổng 587 bị chặn; " +
      "(2) MICROSOFT365_SMTP_HOST=smtp-mail.outlook.com cho Outlook cá nhân; " +
      "(3) MICROSOFT365_SMTP_CONNECT_TIMEOUT_MS=60000 nếu mạng chậm; " +
      "(4) admin Microsoft / firewall datacenter."
    );
  }
  if (
    low.includes("550 5.7.1") ||
    low.includes("550 5.7.0") ||
    low.includes("550 5.7.520") ||
    low.includes("access denied") ||
    low.includes("not authorized to send")
  ) {
    return (
      tag +
      "Microsoft từ chối gửi tới người nhận này (chính sách / relay / giới hạn tenant). Admin cần kiểm tra quyền gửi ra ngoài (Outbound spam) và license mailbox."
    );
  }
  if (low.includes("552") || low.includes("quota") || low.includes("mailbox full")) {
    return tag + "Hộp thư gửi đầy hoặc vượt hạn mức — kiểm tra dung lượng mailbox Microsoft.";
  }
  return tag + raw.slice(0, 480);
}
