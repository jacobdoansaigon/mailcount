import crypto from "node:crypto";

const IV_LEN = 16;
const TAG_LEN = 16;

function keyFromSecret(secret: string): Buffer {
  return crypto.scryptSync(secret, "mail-count-v1", 32);
}

export function encryptSecret(plain: string, secret: string): string {
  const key = keyFromSecret(secret);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string, secret: string): string {
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = raw.subarray(IV_LEN + TAG_LEN);
  const key = keyFromSecret(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
