#!/usr/bin/env node
/**
 * Đọc Inbox qua IMAP, lưu phản hồi + đính kèm, ghi index.
 * (SMTP chỉ gửi; đọc hộp thư cần IMAP — cùng tài khoản Microsoft 365.)
 */
import path from "node:path";
import process from "node:process";
import { ensureDir, getMailConfig } from "../config.js";
import { pollRepliesToFolder } from "../lib/imap-poll.js";

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
  npm run poll -- [--since YYYY-MM-DD] [--mailbox INBOX]

.env: IMAP_HOST, IMAP_PORT, IMAP_TLS, SMTP_USER/SMTP_PASS hoặc IMAP_USER/IMAP_PASS
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) usage();

  const sinceRaw = argValue(argv, "--since");
  const mailbox = argValue(argv, "--mailbox") ?? "INBOX";

  let since: Date | undefined;
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (Number.isNaN(d.getTime())) {
      console.error(`Ngày không hợp lệ: ${sinceRaw}`);
      process.exit(1);
    }
    since = d;
  }

  const cfg = getMailConfig();

  ensureDir(cfg.repliesDir);
  ensureDir(path.dirname(cfg.repliesIndexPath));

  const rows = await pollRepliesToFolder({
    imapHost: cfg.imap.host,
    imapPort: cfg.imap.port,
    imapTls: cfg.imap.tls,
    outboundLogPath: cfg.outboundLogPath,
    repliesDir: cfg.repliesDir,
    repliesIndexPath: cfg.repliesIndexPath,
    since,
    mailbox,
  });

  console.log(`Đã xử lý ${rows.length} mail mới. Index: ${cfg.repliesIndexPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
