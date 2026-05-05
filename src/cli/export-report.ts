#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { getStoragePaths } from "../config.js";
import { writeReportCsv } from "../lib/report.js";

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  return undefined;
}

function usage(): never {
  console.error(`
Usage:
  npm run export -- [--out ./data/report.csv]
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) usage();

  const outPath = path.resolve(
    argValue(argv, "--out") ?? path.join(process.cwd(), "data", "report.csv"),
  );

  const paths = getStoragePaths();
  await writeReportCsv(paths.outboundLogPath, paths.repliesIndexPath, outPath);
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
