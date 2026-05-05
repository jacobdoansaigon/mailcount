import nodemailer from "nodemailer";
import { PRESET_MICROSOFT_365 } from "./mail-presets.js";

const VERIFY_DEADLINE_MS = 40_000;

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

  const p = PRESET_MICROSOFT_365;
  const transporter = nodemailer.createTransport({
    host: p.smtpHost,
    port: p.smtpPort,
    secure: p.smtpSecure,
    requireTLS: !p.smtpSecure && p.smtpPort === 587,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 35_000,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" as const },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(
      () =>
        rej(
          new Error(
            "TIMEOUT: Không nhận phản hồi từ smtp.office365.com trong 40 giây (mạng / firewall / IP bị chặn).",
          ),
        ),
      VERIFY_DEADLINE_MS,
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
    return `${tag}Không kết nối được tới Microsoft (${raw.slice(0, 220)})`;
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
