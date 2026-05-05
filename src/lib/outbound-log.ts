import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import type { OutboundRecord } from "./types.js";

export async function appendOutboundRecord(
  filePath: string,
  row: OutboundRecord,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(row) + "\n";
  await fs.promises.appendFile(filePath, line, "utf8");
}

export async function readOutboundLog(filePath: string): Promise<OutboundRecord[]> {
  let raw = "";
  try {
    raw = await fs.promises.readFile(filePath, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: OutboundRecord[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as OutboundRecord);
    } catch {
      // skip corrupted line
    }
  }
  return out;
}

/** Message-ID không phân biệt hoa thường, bỏ < > để so khớp */
export function normalizeMessageId(mid: string): string {
  return mid.replace(/^<|>$/g, "").trim().toLowerCase();
}

export function messageIdLookup(
  outbound: OutboundRecord[],
): Map<string, OutboundRecord> {
  const m = new Map<string, OutboundRecord>();
  for (const r of outbound) {
    m.set(normalizeMessageId(r.messageId), r);
  }
  return m;
}

export async function appendJsonl(filePath: string, obj: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(obj) + "\n";
  await fs.promises.appendFile(filePath, line, "utf8");
}

export async function readJsonlLines<T>(filePath: string): Promise<T[]> {
  if (!fs.existsSync(filePath)) return [];
  const lines: T[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      lines.push(JSON.parse(t) as T);
    } catch {
      /* skip */
    }
  }
  return lines;
}
