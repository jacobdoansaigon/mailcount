import nodemailer from "nodemailer";
import { getMailConfig } from "../config.js";

/** Gửi magic link — dùng SMTP «hệ thống» trong .env / Railway (không phải mailbox từng user). */
export async function sendMagicLinkEmail(
  to: string,
  linkUrl: string,
): Promise<void> {
  const cfg = getMailConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
    socketTimeout: 60_000,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
  });
  await transporter.sendMail({
    from: cfg.smtp.user,
    to,
    subject: "Đăng nhập Mail-count",
    text: `Chào,\n\nMở liên kết sau để đăng nhập (15 phút):\n\n${linkUrl}\n\nNếu không phải bạn, hãy bỏ qua.`,
    html: `<p>Chào,</p><p><a href="${linkUrl}">Đăng nhập Mail-count</a></p><p>Liên kết hiệu lực 15 phút.</p>`,
  });
}
