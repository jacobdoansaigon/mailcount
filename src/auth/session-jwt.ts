import jwt from "jsonwebtoken";

export type SessionPayload = {
  sub: string;
  email: string;
};

const COOKIE = "mc_session";
const TTL = "30d";

export function getJwtSecret(): string {
  const s = process.env["JWT_SECRET"]?.trim();
  if (!s || s.length < 16) {
    throw new Error(
      "Thiếu JWT_SECRET (tối thiểu 16 ký tự) — cần cho đăng nhập magic link.",
    );
  }
  return s;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TTL });
}

export function verifySessionToken(
  token: string | undefined,
): SessionPayload | null {
  if (!token?.trim()) return null;
  try {
    const d = jwt.verify(token.trim(), getJwtSecret()) as jwt.JwtPayload;
    if (typeof d.sub !== "string" || typeof d.email !== "string") return null;
    return { sub: d.sub, email: d.email };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE;
