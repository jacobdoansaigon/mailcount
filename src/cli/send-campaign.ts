#!/usr/bin/env node
/**
 * Gửi từng mail riêng qua SMTP, log Message-ID để ghép phản hồi sau.
 *
 * Usage:
 *   npm run send -- --csv ./data/recipients.csv --subject-template "Đánh giá [{{code}}]" --text ./data/body.txt
 *
 * placeholders: {{code}}, {{name}}, {{email}}
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ensureDir, getMailConfig } from "../config.js";
import { runSendCampaign } from "../lib/run-campaign.js";

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function usage(): never {
  console.error(`
Usage:
  npm run send -- --csv <file.csv> --subject-template "<tiêu đề>" --text <body.txt> [--html <body.html>]
Options:
  --dry-run           Không gửi, chỉ in kế hoạch
  --limit N           Chỉ gửi N mail đầu (thử)
  --delay-ms MS       Override SEND_DELAY_MS
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) usage();

  const csvPathRaw = argValue(argv, "--csv");
  const subjectTpl = argValue(argv, "--subject-template");
  const textPath = argValue(argv, "--text");
  const htmlPath = argValue(argv, "--html");
  const dry = hasFlag(argv, "--dry-run");
  const limitRaw = argValue(argv, "--limit");
  const delayMsRaw = argValue(argv, "--delay-ms");

  if (!csvPathRaw || !subjectTpl || !textPath) usage();

  const csvPath = path.resolve(csvPathRaw);
  const bodyTextPath = path.resolve(textPath);

  let htmlBody: string | undefined;
  if (htmlPath) {
    htmlBody = await fs.promises.readFile(path.resolve(htmlPath), "utf8");
  }

  const textBody = await fs.promises.readFile(bodyTextPath, "utf8");

  let limit: number | undefined;
  if (limitRaw !== undefined) {
    const n = parseInt(limitRaw, 10);
    limit = Number.isFinite(n) ? n : undefined;
  }

  try {
    const cfg = getMailConfig();

    const delayMs =
      delayMsRaw !== undefined
        ? Math.max(0, parseInt(delayMsRaw, 10))
        : cfg.sendDelayMs;

    ensureDir(cfg.attachmentsDir);

    console.log(
      `[send] SMTP ${cfg.smtp.host}:${cfg.smtp.port}, delay ${delayMs}ms`,
    );

    const result = await runSendCampaign({
      csvPath,
      subjectTemplate: subjectTpl,
      textBody,
      htmlBody,
      dryRun: dry,
      limit,
      delayMs,
      smtp: {
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        user: cfg.smtp.user,
        pass: cfg.smtp.pass,
      },
      attachmentsDir: cfg.attachmentsDir,
      outboundLogPath: cfg.outboundLogPath,
      onSent: ({ index, total, record }) => {
        console.log(
          `[${index}/${total}] sent ${record.recipientEmail} mid=${record.messageId}`,
        );
      },
    });

    console.log(
      `[send] recipients=${result.recipientCount}, đính kèm cố định=${result.attachmentCount} file`,
    );

    if (dry) {
      console.log("[dry-run] Không gửi thật.");
      const prev = result.dryRunRecipients ?? [];
      for (const r of prev.slice(0, 10)) {
        console.log(`  → ${r.email} code=${r.surveyCode} name=${r.name ?? ""}`);
      }
      if (prev.length > 10)
        console.log(`  … và ${prev.length - 10} người nữa`);
      return;
    }

    console.log(`Done. Log: ${cfg.outboundLogPath}`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
