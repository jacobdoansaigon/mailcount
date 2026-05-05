import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export type RecipientRow = {
  email: string;
  name?: string;
  /** Xưng hô mở đầu mail, vd "Anh Minh", "Chị Lan" — placeholder {{greeting}} / {{greetingOrName}} */
  greeting?: string;
  surveyCode?: string;
};

const EMAIL_COLS = ["email", "mail", "e-mail", "email_address"];
const NAME_COLS = ["name", "fullname", "ho_ten", "ten"];
const CODE_COLS = ["survey_code", "code", "ma", "surveycode"];
const GREETING_COLS = [
  "greeting",
  "salutation",
  "xung_ho",
  "loi_chao",
  "chao",
];

function pickCol(
  record: Record<string, string>,
  candidates: string[],
): string | undefined {
  const map = new Map(
    Object.entries(record).map(([k, v]) => [k.toLowerCase().trim(), v]),
  );
  for (const c of candidates) {
    const v = map.get(c)?.trim();
    if (v) return v;
  }
  return undefined;
}

export function loadRecipientsCsv(filePath: string): RecipientRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const out: RecipientRow[] = [];
  for (const record of rows) {
    const email = pickCol(record, EMAIL_COLS);
    if (!email) continue;
    const name = pickCol(record, NAME_COLS);
    const greeting = pickCol(record, GREETING_COLS);
    const surveyCode = pickCol(record, CODE_COLS);
    out.push({
      email,
      name: name || undefined,
      greeting: greeting || undefined,
      surveyCode,
    });
  }
  return out;
}

export function collectAttachmentPaths(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir);
  const paths: string[] = [];
  for (const n of names) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (!st.isFile()) continue;
    if (n === ".gitkeep" || n.startsWith(".")) continue;
    paths.push(p);
  }
  return paths.sort();
}

export function collectAttachmentPathsMany(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    for (const p of collectAttachmentPaths(dir)) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out.sort();
}
