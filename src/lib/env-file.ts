import fs from "node:fs/promises";
import path from "node:path";

export type EnvMap = Record<string, string>;

function parseLine(line: string): { key: string; value: string } | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = line.indexOf("=");
  if (eq <= 0) return null;
  const key = line.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = line.slice(eq + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value: value.replace(/\r$/, "") };
}

export async function readEnvFile(filePath: string): Promise<EnvMap> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const map: EnvMap = {};
    for (const line of raw.split("\n")) {
      const p = parseLine(line);
      if (p) map[p.key] = p.value;
    }
    return map;
  } catch {
    return {};
  }
}

function escValue(v: string): string {
  if (/[#\s"']/.test(v))
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return v;
}

export async function mergeIntoEnvFile(
  filePath: string,
  updates: Record<string, string | null | undefined>,
): Promise<void> {
  const setKv: Record<string, string> = {};
  const removeKeys = new Set<string>();
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    if (v === null) removeKeys.add(k);
    else setKv[k] = v;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    raw = "";
  }

  const lines = raw.split("\n");
  const next: string[] = [];

  for (const line of lines) {
    const p = parseLine(line);
    if (p) {
      if (removeKeys.has(p.key)) continue;
      if (Object.prototype.hasOwnProperty.call(setKv, p.key)) {
        next.push(`${p.key}=${escValue(setKv[p.key])}`);
        delete setKv[p.key];
        continue;
      }
    }
    next.push(line);
  }

  const tailKeys = Object.keys(setKv);
  if (tailKeys.length) {
    if (next.length && next[next.length - 1]?.trim()) next.push("");
    for (const k of tailKeys) next.push(`${k}=${escValue(setKv[k])}`);
  }

  await fs.writeFile(filePath, next.join("\n") + "\n", "utf8");
}
