import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  ENV_FILE_PATH,
  ensureDir,
  getMailConfig,
  getMailPartial,
  getStoragePaths,
  isMailConfigComplete,
  loadImapAuth,
  refreshEnvFromDisk,
} from "../config.js";
import { collectAttachmentPaths, loadRecipientsCsv } from "../lib/csv-recipients.js";
import { readEnvFile, mergeIntoEnvFile } from "../lib/env-file.js";
import { pollRepliesToFolder } from "../lib/imap-poll.js";
import { readOutboundLog, readJsonlLines } from "../lib/outbound-log.js";
import { buildReportRows, generateReportCsv } from "../lib/report.js";
import { runSendCampaign } from "../lib/run-campaign.js";
import type { ReplyRecord } from "../lib/types.js";

const UI_SEND_ROOT = path.join(process.cwd(), "data", ".ui-send");
const UI_RECIPIENTS_CSV = path.join(UI_SEND_ROOT, "recipients.csv");
const UI_ATTACH_SUBDIR = path.join(UI_SEND_ROOT, "attachments");
/** Danh sách đã \"lưu trên máy\" qua Setup / nút Lưu */
const RECIPIENTS_SAVED_PATH = path.join(
  process.cwd(),
  "data",
  "campaign-recipients.csv",
);
const WEB_DIST = path.join(process.cwd(), "web", "dist");
/** Railway & nhiều PaaS đặt PORT; local dev dùng UI_PORT */
const PORT = Number(process.env["PORT"] ?? process.env["UI_PORT"] ?? "3781");
/** Public cloud cần 0.0.0.0; local mặc định 127.0.0.1 (trừ khi PORT đã set = PaaS) */
const LISTEN_HOST =
  process.env["LISTEN_HOST"] ?? (process.env["PORT"] ? "0.0.0.0" : "127.0.0.1");

function maskEmail(addr: string): string {
  const s = addr.trim();
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  const user = s.slice(0, at);
  const dom = s.slice(at);
  if (user.length <= 3) return `**${dom}`;
  return `${user.slice(0, 2)}…${user.slice(-1)}${dom}`;
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function wipeUiSend(): Promise<void> {
  await fs.rm(UI_SEND_ROOT, { recursive: true, force: true });
  await fs.mkdir(UI_ATTACH_SUBDIR, { recursive: true });
}

function parseBool(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "string")
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
  return false;
}

function nz(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

async function bootstrap(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "512kb" }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 36 * 1024 * 1024 },
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  /** Trạng thái SMTP/IMAP để hiển thị form setup (đọc từ .env hoặc mặc định) */
  app.get("/api/setup", async (_req, res) => {
    try {
      refreshEnvFromDisk();
      const disk = await readEnvFile(ENV_FILE_PATH);
      const m = getMailPartial();
      res.json({
        ok: true,
        envPath: ENV_FILE_PATH,
        smtp_host: disk.SMTP_HOST ?? m.smtpHost,
        smtp_port: String(disk.SMTP_PORT ?? m.smtpPort),
        smtp_secure: disk.SMTP_SECURE ?? (m.smtpSecure ? "true" : "false"),
        smtp_user: disk.SMTP_USER ?? m.smtpUser,
        smtp_pass_set: Boolean((disk.SMTP_PASS ?? "").trim().length),

        imap_host: disk.IMAP_HOST ?? m.imapHost,
        imap_port: String(disk.IMAP_PORT ?? m.imapPort),
        imap_tls: disk.IMAP_TLS ?? (m.imapTls ? "true" : "false"),
        imap_user: disk.IMAP_USER ?? "",
        imap_pass_set: Boolean((disk.IMAP_PASS ?? "").trim().length),
        /** true nếu không có key IMAP riêng (dùng chung SMTP) */
        use_shared_imap:
          !(disk.IMAP_USER ?? "").trim() && !(disk.IMAP_PASS ?? "").trim(),
        send_delay_ms: String(disk.SEND_DELAY_MS ?? getStoragePaths().sendDelayMs),
        configured: isMailConfigComplete(),
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  /** Lưu cấu hình vào .env (localhost only). Mật khẩu để trống = giữ nguyên trong file. */
  app.post("/api/setup", async (req, res) => {
    try {
      const b = req.body as Record<string, unknown>;
      const updates: Record<string, string | null | undefined> = {};

      updates.SMTP_HOST = nz(b.smtp_host) || "smtp.office365.com";

      const sp = parseInt(String(b.smtp_port ?? "587"), 10);
      updates.SMTP_PORT = Number.isFinite(sp) ? String(sp) : "587";

      updates.SMTP_SECURE = parseBool(b.smtp_secure) ? "true" : "false";

      const su = nz(b.smtp_user);
      if (!su)
        return res.status(400).json({ ok: false, error: "SMTP_USER bắt buộc" });
      updates.SMTP_USER = su;

      const smtpPass = nz(b.smtp_pass);
      if (smtpPass) updates.SMTP_PASS = smtpPass;

      updates.IMAP_HOST = nz(b.imap_host) || "outlook.office365.com";
      const ip = parseInt(String(b.imap_port ?? "993"), 10);
      updates.IMAP_PORT = Number.isFinite(ip) ? String(ip) : "993";
      updates.IMAP_TLS = parseBool(b.imap_tls ?? true) ? "true" : "false";

      const sharedImap = parseBool(b.use_shared_imap);
      if (sharedImap) {
        updates.IMAP_USER = null;
        updates.IMAP_PASS = null;
      } else {
        const iu = nz(b.imap_user) || su;
        updates.IMAP_USER = iu;
        const ipas = nz(b.imap_pass);
        if (ipas) updates.IMAP_PASS = ipas;
      }

      const dm = nz(b.send_delay_ms);
      if (dm) {
        const n = parseInt(dm, 10);
        if (Number.isFinite(n) && n >= 0)
          updates.SEND_DELAY_MS = String(n);
      }

      await mergeIntoEnvFile(ENV_FILE_PATH, updates);
      refreshEnvFromDisk();

      res.json({ ok: true, configured: isMailConfigComplete() });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  /** Thông tin file danh sách đã lưu cố định */
  app.get("/api/recipients/saved", async (_req, res) => {
    try {
      if (!(await pathExists(RECIPIENTS_SAVED_PATH))) {
        res.json({
          ok: true,
          exists: false,
          path: RECIPIENTS_SAVED_PATH,
          rowCount: 0,
          sampleEmails: [],
        });
        return;
      }
      const rows = loadRecipientsCsv(RECIPIENTS_SAVED_PATH);
      res.json({
        ok: true,
        exists: true,
        path: RECIPIENTS_SAVED_PATH,
        rowCount: rows.length,
        sampleEmails: rows.slice(0, 8).map((r) => r.email),
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  /** Lưu CSV danh sách vào máy (để gửi nhiều lần mà không cần chọn file) */
  app.post(
    "/api/recipients/saved",
    upload.single("csv"),
    async (req, res) => {
      try {
        const buf = req.file?.buffer;
        if (!buf?.length) {
          res.status(400).json({ ok: false, error: "Thiếu file CSV" });
          return;
        }
        await fs.mkdir(path.dirname(RECIPIENTS_SAVED_PATH), { recursive: true });
        await fs.writeFile(RECIPIENTS_SAVED_PATH, buf);
        const rows = loadRecipientsCsv(RECIPIENTS_SAVED_PATH);
        res.json({
          ok: true,
          rowCount: rows.length,
          path: RECIPIENTS_SAVED_PATH,
        });
      } catch (e) {
        res.status(500).json({
          ok: false,
          error: String(e instanceof Error ? e.message : e),
        });
      }
    },
  );

  app.get("/api/status", (_req, res) => {
    refreshEnvFromDisk();
    const paths = getStoragePaths();
    const m = getMailPartial();
    const complete = isMailConfigComplete();

    let imapUser = "?";
    try {
      if (complete) imapUser = maskEmail(loadImapAuth().user);
    } catch {
      imapUser = "(thiếu)";
    }

    let smtpUser = "?";
    if (m.smtpUser) smtpUser = maskEmail(m.smtpUser);

    const attachmentCountDisk = collectAttachmentPaths(
      paths.attachmentsDir,
    ).length;

    res.json({
      configured: complete,
      smtp: {
        host: m.smtpHost,
        port: m.smtpPort,
        secure: m.smtpSecure,
        userMasked: smtpUser || "(thiếu)",
      },
      imap: {
        host: m.imapHost,
        port: m.imapPort,
        tls: m.imapTls,
        userMasked: imapUser,
      },
      paths: {
        outboundLogPath: paths.outboundLogPath,
        repliesDir: paths.repliesDir,
        repliesIndexPath: paths.repliesIndexPath,
      },
      attachmentCountDisk,
      sendDelayMs: paths.sendDelayMs,
      envSamplePath: RECIPIENTS_SAVED_PATH,
    });
  });

  app.get("/api/outbound", async (_req, res) => {
    try {
      const paths = getStoragePaths();
      const rows = await readOutboundLog(paths.outboundLogPath);
      res.json({ ok: true, rows });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/replies", async (_req, res) => {
    try {
      const paths = getStoragePaths();
      const rows = await readJsonlLines<ReplyRecord>(
        paths.repliesIndexPath,
      );
      res.json({ ok: true, rows });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/summary", async (_req, res) => {
    try {
      const paths = getStoragePaths();
      const outbound = await readOutboundLog(paths.outboundLogPath);
      const replies = await readJsonlLines<ReplyRecord>(
        paths.repliesIndexPath,
      );
      const report = buildReportRows(outbound, replies);
      const replied = report.filter((r) => r.reply_received === "yes").length;
      const pending =
        outbound.length > 0 ? Math.max(outbound.length - replied, 0) : 0;
      res.json({
        ok: true,
        totals: {
          sent: outbound.length,
          polledMessages: replies.length,
          repliesMatchedOnCampaign: replied,
          pending,
        },
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/report.csv", async (_req, res) => {
    try {
      const paths = getStoragePaths();
      const body = await generateReportCsv(
        paths.outboundLogPath,
        paths.repliesIndexPath,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="report.csv"',
      );
      res.send(body);
    } catch (e) {
      res.status(500).send(String(e instanceof Error ? e.message : e));
    }
  });

  app.post("/api/poll", async (req, res) => {
    try {
      const cfg = getMailConfig();

      const sinceRaw = req.body?.since as string | undefined;
      let since: Date | undefined;
      if (sinceRaw) {
        const d = new Date(sinceRaw);
        if (!Number.isNaN(d.getTime())) since = d;
      }

      ensureDir(cfg.repliesDir);
      ensureDir(path.dirname(cfg.repliesIndexPath));

      const processed = await pollRepliesToFolder({
        imapHost: cfg.imap.host,
        imapPort: cfg.imap.port,
        imapTls: cfg.imap.tls,
        outboundLogPath: cfg.outboundLogPath,
        repliesDir: cfg.repliesDir,
        repliesIndexPath: cfg.repliesIndexPath,
        since,
      });

      res.json({
        ok: true,
        newMessagesImported: processed.length,
      });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const code = msg.includes("Chưa cấu hình SMTP") ? 400 : 500;
      res.status(code).json({ ok: false, error: msg });
    }
  });

  app.post(
    "/api/send",
    upload.fields([
      { name: "csv", maxCount: 1 },
      { name: "attachments", maxCount: 40 },
    ]),
    async (req, res) => {
      try {
        const cfg = getMailConfig();

        const useSaved = parseBool(req.body?.useSavedRecipients);

        await wipeUiSend();

        let csvPathResolved: string;

        if (useSaved) {
          if (!(await pathExists(RECIPIENTS_SAVED_PATH))) {
            res.status(400).json({
              ok: false,
              error:
                'Chưa có file đã lưu. Hãy upload CSV ở mục "Danh sách email" và bấm Lưu, hoặc bỏ chọn "Dùng danh sách đã lưu".',
            });
            return;
          }
          csvPathResolved = RECIPIENTS_SAVED_PATH;
        } else {
          type FilesMapCsv = Record<string, Express.Multer.File[]> | undefined;
          const fm = req.files as FilesMapCsv;
          const csvFile = fm?.csv?.[0];
          if (!csvFile?.buffer?.length) {
            res.status(400).json({
              ok: false,
              error: "Thiếu file CSV recipients",
            });
            return;
          }
          await fs.writeFile(UI_RECIPIENTS_CSV, csvFile.buffer);
          csvPathResolved = UI_RECIPIENTS_CSV;
        }

        type FilesMapAtt = Record<string, Express.Multer.File[]> | undefined;
        const fmAtt = req.files as FilesMapAtt;
        const others = fmAtt?.attachments ?? [];
        for (const f of others) {
          const name = path.basename(f.originalname || "file.bin").replace(
            /[^\w.-]+/g,
            "_",
          );
          const dest = path.join(UI_ATTACH_SUBDIR, name || "file.bin");
          await fs.writeFile(dest, f.buffer);
        }

        const subjectTemplate = nz(req.body?.subjectTemplate);
        const bodyText = nz(req.body?.bodyText);
        if (!subjectTemplate || !bodyText) {
          res.status(400).json({
            ok: false,
            error: "Tiêu đề và nội dung không được để trống",
          });
          return;
        }

        const dryRun = parseBool(req.body?.dryRun);
        const delayRaw =
          typeof req.body?.delayMs === "string" ||
          typeof req.body?.delayMs === "number"
            ? Number(req.body.delayMs)
            : undefined;
        const delayMs = Number.isFinite(delayRaw!)
          ? Math.max(0, delayRaw!)
          : cfg.sendDelayMs;

        let limitRaw: number | undefined;
        if (
          typeof req.body?.limit === "string" &&
          req.body.limit.trim().length > 0
        ) {
          const n = parseInt(req.body.limit, 10);
          if (!Number.isNaN(n) && n >= 0) limitRaw = n;
        } else if (typeof req.body?.limit === "number") limitRaw = req.body.limit;

        const result = await runSendCampaign({
          csvPath: csvPathResolved,
          subjectTemplate,
          textBody: bodyText,
          dryRun,
          limit: limitRaw,
          delayMs,
          extraAttachmentDirs: [UI_ATTACH_SUBDIR],
          smtp: {
            host: cfg.smtp.host,
            port: cfg.smtp.port,
            secure: cfg.smtp.secure,
            user: cfg.smtp.user,
            pass: cfg.smtp.pass,
          },
          attachmentsDir: cfg.attachmentsDir,
          outboundLogPath: cfg.outboundLogPath,
        });

        res.json({
          ok: true,
          attachmentCountCombined: result.attachmentCount,
          recipientCount: result.recipientCount,
          records: dryRun ? [] : result.records,
          preview: dryRun ? result.dryRunRecipients ?? [] : undefined,
        });
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        const code = msg.includes("Chưa cấu hình SMTP") ? 400 : 500;
        res.status(code).json({ ok: false, error: msg });
      }
    },
  );

  if (
    process.env["NODE_ENV"] === "production" &&
    (await pathExists(path.join(WEB_DIST, "index.html")))
  ) {
    app.use(express.static(WEB_DIST));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.method !== "GET") return next();
      res.sendFile(path.join(WEB_DIST, "index.html"));
    });
  }

  await new Promise<void>((resolve) => {
    app.listen(PORT, LISTEN_HOST, () => {
      resolve();
      const mode =
        process.env["NODE_ENV"] === "production"
          ? "production"
          : "development";
      const publicUrl = process.env["RAILWAY_PUBLIC_DOMAIN"];
      console.error(
        `[mail-count] ${mode} listening ${LISTEN_HOST}:${PORT}${publicUrl ? `  public https://${publicUrl}` : ""}`,
      );
    });
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
