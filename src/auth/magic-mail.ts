import nodemailer from "nodemailer";
import { getMailConfig, refreshEnvFromDisk } from "../config.js";

const SUBJECT = "Đăng nhập Mail-count";

function magicBodies(linkUrl: string): { text: string; html: string } {
  return {
    text: `Chào,\n\nMở liên kết sau để đăng nhập (15 phút):\n\n${linkUrl}\n\nNếu không phải bạn, hãy bỏ qua.`,
    html: `<p>Chào,</p><p><a href="${linkUrl}">Đăng nhập Mail-count</a></p><p>Liên kết hiệu lực 15 phút.</p>`,
  };
}

/** Resend — ưu tiên trên PaaS vì không phụ thuộc SMTP tới smtp.office365.com (dễ treo / bị chặn từ IP lạ). */
async function sendMagicLinkViaResend(
  to: string,
  text: string,
  html: string,
): Promise<void> {
  refreshEnvFromDisk();
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  if (!apiKey) throw new Error("Thiếu RESEND_API_KEY.");
  const from =
    process.env["RESEND_FROM"]?.trim() ||
    "Mail-count <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: SUBJECT,
      text,
      html,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    name?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : `${res.status} ${res.statusText}`;
    throw new Error(`Không gửi được mail (Resend): ${msg}`);
  }
}

async function sendMagicLinkViaSmtp(
  to: string,
  text: string,
  html: string,
): Promise<void> {
  const cfg = getMailConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    requireTLS: !cfg.smtp.secure && cfg.smtp.port === 587,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 35_000,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
    tls: { minVersion: "TLSv1.2" as const },
  });
  try {
    await transporter.sendMail({
      envelope: { from: cfg.smtp.user, to },
      from: cfg.smtp.user,
      to,
      subject: SUBJECT,
      text,
      html,
    });
  } finally {
    transporter.close();
  }
}

/**
 * Gửi magic link — nếu có `RESEND_API_KEY` thì dùng Resend (khuyến nghị trên Railway);
 * không thì SMTP hệ thống trong .env (Office 365…).
 */
export async function sendMagicLinkEmail(
  to: string,
  linkUrl: string,
): Promise<void> {
  refreshEnvFromDisk();
  const { text, html } = magicBodies(linkUrl);
  if (process.env["RESEND_API_KEY"]?.trim()) {
    await sendMagicLinkViaResend(to, text, html);
    return;
  }
  await sendMagicLinkViaSmtp(to, text, html);
}
