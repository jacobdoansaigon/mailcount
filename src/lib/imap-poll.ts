import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadImapAuth } from "../config.js";
import {
  messageIdLookup,
  normalizeMessageId,
  readOutboundLog,
  appendJsonl,
  readJsonlLines,
} from "../lib/outbound-log.js";
import type { OutboundRecord, ReplyRecord } from "../lib/types.js";

const CODE_IN_SUBJECT = /\[CODE:\s*([A-Z0-9_-]+)\]/i;

function extractCodesFromSubject(subject: string): string[] {
  const m = subject.match(CODE_IN_SUBJECT);
  if (m?.[1]) return [m[1].toUpperCase()];
  return [];
}

function collectReferencedIds(parsed: ParsedMail): string[] {
  const ids: string[] = [];
  if (parsed.inReplyTo) ids.push(parsed.inReplyTo);
  if (parsed.references) {
    if (Array.isArray(parsed.references)) ids.push(...parsed.references);
    else ids.push(parsed.references);
  }
  return ids.map((s) => s.trim()).filter(Boolean);
}

function findOutboundByRefs(
  lookup: Map<string, OutboundRecord>,
  refs: string[],
): OutboundRecord | undefined {
  for (const r of refs) {
    const hit = lookup.get(normalizeMessageId(r));
    if (hit) return hit;
  }
  return undefined;
}

function findOutboundByCode(
  outbound: OutboundRecord[],
  code: string,
): OutboundRecord | undefined {
  const u = code.toUpperCase();
  return outbound.find((o) => o.surveyCode.toUpperCase() === u);
}

export type PollOptions = {
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  outboundLogPath: string;
  repliesDir: string;
  repliesIndexPath: string;
  /** ISO date — chỉ xét mail từ ngày này (mặc định: 7 ngày trước) */
  since?: Date;
  /** Inbox only */
  mailbox?: string;
};

function extractParsedMessageId(parsed: ParsedMail): string | undefined {
  const mid = parsed.messageId;
  if (!mid) return undefined;
  if (Array.isArray(mid)) return mid[0]?.trim();
  return String(mid).trim();
}

function inboundDedupeKey(
  parsed: ParsedMail,
  uid: number,
  mailbox: string,
): string {
  const a = extractParsedMessageId(parsed);
  const b = a ? normalizeMessageId(a) : "";
  if (b) return `mid:${b}`;
  return `uid:${mailbox}:${uid}`;
}

export async function pollRepliesToFolder(opts: PollOptions): Promise<ReplyRecord[]> {
  const auth = loadImapAuth();
  const outbound = await readOutboundLog(opts.outboundLogPath);
  const lookup = messageIdLookup(outbound);
  const mb = opts.mailbox ?? "INBOX";

  const prevRows = await readJsonlLines<ReplyRecord>(opts.repliesIndexPath);
  const seenKeys = new Set(
    prevRows
      .map((r) => r.inboundMessageId)
      .filter((x): x is string => Boolean(x?.trim())),
  );

  const client = new ImapFlow({
    host: opts.imapHost,
    port: opts.imapPort,
    secure: opts.imapTls,
    auth: { user: auth.user, pass: auth.pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(mb);
  const results: ReplyRecord[] = [];

  try {
    const since = opts.since ?? new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const searched = await client.search({ since });
    const uids = searched === false ? [] : searched;
    if (!uids.length) return [];

    for await (const msg of client.fetch(uids, {
      uid: true,
      envelope: true,
      source: true,
    })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const dedupeKey = inboundDedupeKey(parsed, msg.uid, mb);
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const fromAddr =
        parsed.from?.value?.[0]?.address?.toLowerCase().trim() ?? "";
      const subject = parsed.subject ?? "";
      const refs = collectReferencedIds(parsed);

      let correlation: ReplyRecord["correlation"] = "manual-unknown";
      let matchedOutbound: OutboundRecord | undefined;
      matchedOutbound = findOutboundByRefs(lookup, refs);
      if (matchedOutbound) correlation = "message-id";
      else {
        const codes = extractCodesFromSubject(subject);
        for (const c of codes) {
          matchedOutbound = findOutboundByCode(outbound, c);
          if (matchedOutbound) {
            correlation = "subject-code";
            break;
          }
        }
      }

      const id = randomUUID();
      const safeSlug = sanitizePathSegment(
        matchedOutbound?.surveyCode ??
          `${fromAddr || "unknown"}-${msg.uid}-${id.slice(0, 8)}`,
      );
      const dir = path.join(opts.repliesDir, safeSlug);
      fs.mkdirSync(dir, { recursive: true });

      const attachPaths: string[] = [];
      let idx = 0;
      if (parsed.attachments?.length) {
        for (const a of parsed.attachments) {
          idx += 1;
          const fname =
            sanitizeFilename(a.filename || `attachment-${idx}`) ||
            `attachment-${idx}`;
          const dest = uniquePath(dir, fname);
          await fs.promises.writeFile(dest, a.content);
          attachPaths.push(dest);
        }
      }

      let bodyTextPath: string | undefined;
      let bodyHtmlPath: string | undefined;
      if (parsed.text) {
        bodyTextPath = path.join(dir, "body.txt");
        await fs.promises.writeFile(bodyTextPath, parsed.text, "utf8");
      }
      const htmlRaw = parsed.html;
      const htmlBody =
        htmlRaw !== false &&
        htmlRaw !== undefined &&
        htmlRaw !== null
          ? typeof htmlRaw === "string"
            ? htmlRaw
            : Buffer.isBuffer(htmlRaw as Buffer)
              ? (htmlRaw as Buffer).toString("utf8")
              : ""
          : "";
      if (htmlBody) {
        bodyHtmlPath = path.join(dir, "body.html");
        await fs.promises.writeFile(bodyHtmlPath, htmlBody, "utf8");
      }

      const rec: ReplyRecord = {
        id,
        inboundMessageId: dedupeKey,
        matchedOutboundMessageId: matchedOutbound?.messageId,
        matchedSurveyCode: matchedOutbound?.surveyCode,
        matchedRecipientEmail: matchedOutbound?.recipientEmail ?? fromAddr,
        correlation,
        fromAddress: fromAddr,
        subject,
        receivedAt: (parsed.date ?? new Date()).toISOString(),
        bodyTextPath,
        bodyHtmlPath,
        attachmentPaths: attachPaths,
        uid: msg.uid,
      };
      await appendJsonl(opts.repliesIndexPath, rec);
      results.push(rec);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return results;
}

function sanitizePathSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._@-]+/g, "_").slice(0, 120) || "reply";
}

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^\w.-]+/g, "_").slice(0, 180);
}

function uniquePath(dir: string, fname: string): string {
  let dest = path.join(dir, fname);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(fname);
  const base = path.basename(fname, ext);
  for (let i = 2; i < 1000; i++) {
    dest = path.join(dir, `${base}-${i}${ext}`);
    if (!fs.existsSync(dest)) return dest;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}
