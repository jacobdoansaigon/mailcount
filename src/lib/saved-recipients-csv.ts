import fs from "node:fs/promises";
import path from "node:path";
import type { RecipientRow } from "./csv-recipients.js";
import { loadRecipientsCsv } from "./csv-recipients.js";

const HEADER = "email,name,greeting,survey_code";

function escapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function rowToLine(r: RecipientRow): string {
  return [
    r.email,
    r.name ?? "",
    r.greeting ?? "",
    r.surveyCode ?? "",
  ]
    .map(escapeCell)
    .join(",");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeAll(filePath: string, rows: RecipientRow[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = [HEADER, ...rows.map(rowToLine)].join("\n") + "\n";
  await fs.writeFile(filePath, body, "utf8");
}

/**
 * Thêm hoặc cập nhật một người (trùng email = ghi đè tên / greeting, giữ survey_code cũ nếu có).
 */
export async function upsertManualSavedRecipient(
  filePath: string,
  entry: { email: string; name?: string; greeting?: string },
): Promise<RecipientRow[]> {
  const emailRaw = entry.email.trim();
  const lower = emailRaw.toLowerCase();
  if (!lower || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    throw new Error("Email không hợp lệ.");
  }

  let rows: RecipientRow[] = [];
  if (await fileExists(filePath)) {
    rows = loadRecipientsCsv(filePath);
  }

  const name = entry.name?.trim() || undefined;
  const greeting = entry.greeting?.trim() || undefined;
  const next: RecipientRow = {
    email: emailRaw,
    name,
    greeting,
  };

  const idx = rows.findIndex((r) => r.email.toLowerCase().trim() === lower);
  if (idx >= 0) {
    const prev = rows[idx]!;
    rows[idx] = {
      ...next,
      surveyCode: prev.surveyCode?.trim() || next.surveyCode,
    };
  } else {
    rows.push(next);
  }

  await writeAll(filePath, rows);
  return rows;
}
