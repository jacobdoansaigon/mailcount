import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type multer from "multer";

type MulterFile = Express.Multer.File;
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { nanoid } from "nanoid";
import { parse } from "csv-parse/sync";
import { sendMagicLinkEmail } from "../auth/magic-mail.js";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
  getJwtSecret,
} from "../auth/session-jwt.js";
import { isMagicLinkMailConfigured } from "../config.js";
import { buildDashboardPayload } from "../lib/dashboard-stats.js";
import { collectAttachmentPaths } from "../lib/csv-recipients.js";
import { pollRepliesToFolder } from "../lib/imap-poll.js";
import { ensureDir } from "../config.js";
import { readOutboundLog, readJsonlLines } from "../lib/outbound-log.js";
import { buildReportRows, generateReportCsv } from "../lib/report.js";
import { runSendCampaign } from "../lib/run-campaign.js";
import type { ReplyRecord } from "../lib/types.js";
import { encryptSecret } from "../lib/secret-crypto.js";
import { MagicLinkTokenModel } from "../models/MagicLinkToken.js";
import { RecipientModel } from "../models/Recipient.js";
import { UserModel } from "../models/User.js";
import { PRESET_MICROSOFT_365 } from "../lib/mail-presets.js";
import {
  getUserMailConfig,
  userWorkspacePaths,
} from "../services/mongo-user-mail.js";

type AuthedRequest = Request & { userId: string; userEmail: string };

function nz(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function parseBool(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "string")
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
  return false;
}

function maskEmail(addr: string): string {
  const s = addr.trim();
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  const user = s.slice(0, at);
  const dom = s.slice(at);
  if (user.length <= 3) return `**${dom}`;
  return `${user.slice(0, 2)}…${user.slice(-1)}${dom}`;
}

function publicAppBase(): string {
  let b = process.env["PUBLIC_APP_URL"]?.trim();
  if (!b && process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim()) {
    b = `https://${process.env["RAILWAY_PUBLIC_DOMAIN"].trim()}`;
  }
  if (!b) b = "http://localhost:5173";
  return b.replace(/\/$/, "");
}

const magicLastByEmail = new Map<string, number>();
const MAGIC_COOLDOWN_MS = 45_000;

function requireUser(req: Request, res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    SESSION_COOKIE_NAME
  ];
  const s = verifySessionToken(token);
  if (!s) {
    res.status(401).json({ ok: false, error: "Cần đăng nhập." });
    return;
  }
  (req as AuthedRequest).userId = s.sub;
  (req as AuthedRequest).userEmail = s.email;
  next();
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function escapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function userUiSendRoot(userId: string): string {
  return path.join(userWorkspacePaths(userId).root, ".ui-send");
}

async function wipeUserUiSend(userId: string): Promise<void> {
  const root = userUiSendRoot(userId);
  const att = path.join(root, "attachments");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(att, { recursive: true });
}

async function writeCampaignCsvFromMongo(
  userId: string,
  outPath: string,
): Promise<number> {
  const rows = await RecipientModel.find({ userId })
    .sort({ createdAt: 1 })
    .lean();
  const lines = ["email,name,greeting,title,survey_code"];
  for (const r of rows) {
    lines.push(
      [r.email, r.name ?? "", r.greeting ?? "", r.title ?? "", r.surveyCode ?? ""]
        .map(escapeCell)
        .join(","),
    );
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join("\n") + "\n", "utf8");
  return rows.length;
}

export function registerMongoMultiuserApi(
  app: Express,
  upload: multer.Multer,
): void {
  app.use(cookieParser());

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      ok: true,
      multiUser: true,
      publicUrl: publicAppBase(),
      systemMailConfigured: isMagicLinkMailConfigured(),
    });
  });

  app.post("/api/auth/magic-link", async (req, res) => {
    try {
      if (!isMagicLinkMailConfigured()) {
        res.status(503).json({
          ok: false,
          error:
            "Server chưa cấu hình gửi magic link. Admin đặt RESEND_API_KEY (+ RESEND_FROM) hoặc SMTP_USER và SMTP_PASS trên server.",
        });
        return;
      }
      const email = nz((req.body as { email?: string })?.email).toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ ok: false, error: "Email không hợp lệ." });
        return;
      }
      const now = Date.now();
      const last = magicLastByEmail.get(email) ?? 0;
      if (now - last < MAGIC_COOLDOWN_MS) {
        res.status(429).json({ ok: false, error: "Thử lại sau vài chục giây." });
        return;
      }
      magicLastByEmail.set(email, now);

      const raw = nanoid(48);
      const tokenHash = sha256(raw);
      await MagicLinkTokenModel.create({
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: false,
      });

      const link = `${publicAppBase()}/api/auth/verify?token=${encodeURIComponent(raw)}`;
      await sendMagicLinkEmail(email, link);

      res.json({ ok: true, message: "Đã gửi liên kết tới email của anh/chị." });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/auth/verify", async (req, res) => {
    try {
      const token = nz(req.query["token"] as string);
      if (!token) {
        res.status(400).send("Thiếu token.");
        return;
      }
      const tokenHash = sha256(token);
      const doc = await MagicLinkTokenModel.findOne({
        tokenHash,
        used: false,
        expiresAt: { $gt: new Date() },
      });
      if (!doc) {
        res.status(400).send("Liên kết không hợp lệ hoặc đã hết hạn.");
        return;
      }
      doc.used = true;
      await doc.save();

      let user = await UserModel.findOne({ email: doc.email });
      if (!user) {
        user = await UserModel.create({ email: doc.email });
      }

      const jwt = signSessionToken({
        sub: user._id.toString(),
        email: user.email,
      });
      const maxAge = 30 * 24 * 3600 * 1000;
      const secure = process.env["NODE_ENV"] === "production";
      res.cookie(SESSION_COOKIE_NAME, jwt, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        maxAge,
        path: "/",
      });
      res.redirect(302, `${publicAppBase()}/`);
    } catch (e) {
      res.status(500).send(String(e instanceof Error ? e.message : e));
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/me", requireUser, async (req, res) => {
    try {
      const user = await UserModel.findById((req as AuthedRequest).userId).lean();
      if (!user) {
        res.status(404).json({ ok: false, error: "Không tìm thấy user." });
        return;
      }
      const mb = user.mailbox;
      const configured = Boolean(mb?.smtpUser?.trim() && mb?.smtpPassEnc?.trim());
      res.json({
        ok: true,
        email: user.email,
        mailboxConfigured: configured,
        emailMasked: maskEmail(user.email),
        workEmail: mb?.smtpUser ?? "",
        preset: PRESET_MICROSOFT_365.label,
        tagline: PRESET_MICROSOFT_365.tagline,
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.post("/api/me/mailbox", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const b = req.body as Record<string, unknown>;
      const workEmail = nz(b.email);
      const password =
        typeof b.password === "string" ? b.password.trim() : nz(b.password);
      if (!workEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
        res.status(400).json({ ok: false, error: "Email mailbox không hợp lệ." });
        return;
      }
      const user = await UserModel.findById(uid);
      if (!user) {
        res.status(404).json({ ok: false, error: "User không tồn tại." });
        return;
      }
      const existingEnc = user.mailbox?.smtpPassEnc?.trim() ?? "";
      if (!password.length && !existingEnc.length) {
        res.status(400).json({
          ok: false,
          error: "Nhập mật khẩu hoặc mã ứng dụng Microsoft (lần đầu bắt buộc).",
        });
        return;
      }
      const secret = getJwtSecret();
      const passEnc =
        password.length > 0 ? encryptSecret(password, secret) : existingEnc;
      user.mailbox = user.mailbox ?? {};
      user.mailbox.smtpUser = workEmail;
      user.mailbox.smtpPassEnc = passEnc;
      user.mailbox.smtpHost = PRESET_MICROSOFT_365.smtpHost;
      user.mailbox.smtpPort = PRESET_MICROSOFT_365.smtpPort;
      user.mailbox.smtpSecure = PRESET_MICROSOFT_365.smtpSecure;
      user.mailbox.imapHost = PRESET_MICROSOFT_365.imapHost;
      user.mailbox.imapPort = PRESET_MICROSOFT_365.imapPort;
      user.mailbox.imapTls = PRESET_MICROSOFT_365.imapTls;
      await user.save();
      res.json({
        ok: true,
        mailboxConfigured: true,
        emailMasked: maskEmail(workEmail),
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/recipients/saved", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10) || 20),
      );
      const skip = (page - 1) * limit;
      const filter = { userId: uid };
      const [total, list] = await Promise.all([
        RecipientModel.countDocuments(filter),
        RecipientModel.find(filter)
          .sort({ email: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);
      res.json({
        ok: true,
        exists: total > 0,
        path: "(MongoDB)",
        total,
        page,
        pageSize: limit,
        rowCount: total,
        rows: list.map((s) => ({
          email: s.email,
          name: s.name ?? "",
          greeting: s.greeting ?? "",
          title: (s as { title?: string }).title ?? "",
          surveyCode: s.surveyCode ?? "",
        })),
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.post("/api/recipients/manual", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const b = req.body as Record<string, unknown>;
      const email = nz(b.email).toLowerCase();
      const name = nz(b.name);
      const greeting = nz(b.greeting);
      const title = nz(b.title);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ ok: false, error: "Email không hợp lệ." });
        return;
      }
      await RecipientModel.findOneAndUpdate(
        { userId: uid, email },
        {
          $set: {
            userId: uid,
            email,
            name: name || "",
            greeting: greeting || "",
            title: title || "",
          },
        },
        { upsert: true, new: true },
      );
      const rowCount = await RecipientModel.countDocuments({ userId: uid });
      res.json({ ok: true, rowCount, path: "(MongoDB)" });
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.post(
    "/api/recipients/saved",
    requireUser,
    upload.single("csv"),
    async (req, res) => {
      try {
        const uid = (req as AuthedRequest).userId;
        const buf = req.file?.buffer;
        if (!buf?.length) {
          res.status(400).json({ ok: false, error: "Thiếu file CSV" });
          return;
        }
        const raw = buf.toString("utf8");
        const rows = parse(raw, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
        }) as Record<string, string>[];
        const EMAIL_COLS = ["email", "mail", "e-mail", "email_address"];
        const NAME_COLS = ["name", "fullname", "ho_ten", "ten"];
        const GREETING_COLS = [
          "greeting",
          "salutation",
          "xung_ho",
          "loi_chao",
          "chao",
        ];
        const CODE_COLS = ["survey_code", "code", "ma", "surveycode"];
        const TITLE_COLS = [
          "title",
          "job_title",
          "position",
          "chuc_vu",
          "chức vụ",
          "role",
        ];
        function pick(
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
        const oid = new mongoose.Types.ObjectId(uid);
        const docs: {
          userId: mongoose.Types.ObjectId;
          email: string;
          name: string;
          greeting: string;
          title: string;
          surveyCode: string;
        }[] = [];
        for (const record of rows) {
          const email = pick(record, EMAIL_COLS);
          if (!email) continue;
          docs.push({
            userId: oid,
            email: email.trim(),
            name: pick(record, NAME_COLS) ?? "",
            greeting: pick(record, GREETING_COLS) ?? "",
            title: pick(record, TITLE_COLS) ?? "",
            surveyCode: pick(record, CODE_COLS) ?? "",
          });
        }
        await RecipientModel.deleteMany({ userId: oid });
        if (docs.length) await RecipientModel.insertMany(docs);
        res.json({ ok: true, rowCount: docs.length, path: "(MongoDB)" });
      } catch (e) {
        res.status(500).json({
          ok: false,
          error: String(e instanceof Error ? e.message : e),
        });
      }
    },
  );

  app.get("/api/account", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const user = await UserModel.findById(uid).lean();
      const mb = user?.mailbox;
      const configured = Boolean(mb?.smtpUser?.trim() && mb?.smtpPassEnc?.trim());
      res.json({
        ok: true,
        configured,
        preset: PRESET_MICROSOFT_365.label,
        presetId: PRESET_MICROSOFT_365.id,
        tagline: PRESET_MICROSOFT_365.tagline,
        emailMasked: mb?.smtpUser ? maskEmail(mb.smtpUser) : "",
        workEmail: mb?.smtpUser ?? "",
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.post("/api/account", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const b = req.body as Record<string, unknown>;
      const email = nz(b.email);
      const password =
        typeof b.password === "string" ? b.password.trim() : nz(b.password);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ ok: false, error: "Email không hợp lệ." });
        return;
      }
      const user = await UserModel.findById(uid);
      if (!user) {
        res.status(404).json({ ok: false, error: "User không tồn tại." });
        return;
      }
      const existingEnc = user.mailbox?.smtpPassEnc?.trim() ?? "";
      if (!password.length && !existingEnc.length) {
        res.status(400).json({
          ok: false,
          error: "Nhập mật khẩu hoặc mã ứng dụng (lần đầu bắt buộc).",
        });
        return;
      }
      const secret = getJwtSecret();
      const passEnc =
        password.length > 0 ? encryptSecret(password, secret) : existingEnc;
      user.mailbox = user.mailbox ?? {};
      user.mailbox.smtpUser = email;
      user.mailbox.smtpPassEnc = passEnc;
      user.mailbox.smtpHost = PRESET_MICROSOFT_365.smtpHost;
      user.mailbox.smtpPort = PRESET_MICROSOFT_365.smtpPort;
      user.mailbox.smtpSecure = PRESET_MICROSOFT_365.smtpSecure;
      user.mailbox.imapHost = PRESET_MICROSOFT_365.imapHost;
      user.mailbox.imapPort = PRESET_MICROSOFT_365.imapPort;
      user.mailbox.imapTls = PRESET_MICROSOFT_365.imapTls;
      await user.save();
      res.json({
        ok: true,
        configured: true,
        preset: PRESET_MICROSOFT_365.label,
        emailMasked: maskEmail(email),
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/status", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      let cfg;
      try {
        cfg = await getUserMailConfig(uid);
      } catch {
        const m = PRESET_MICROSOFT_365;
        res.json({
          configured: false,
          smtp: {
            host: m.smtpHost,
            port: m.smtpPort,
            secure: m.smtpSecure,
            userMasked: "(chưa kết nối)",
          },
          imap: {
            host: m.imapHost,
            port: m.imapPort,
            tls: m.imapTls,
            userMasked: "(chưa kết nối)",
          },
          paths: userWorkspacePaths(uid),
          attachmentCountDisk: 0,
          sendDelayMs: 3500,
          envSamplePath: "(MongoDB)",
        });
        return;
      }
      const n = collectAttachmentPaths(cfg.attachmentsDir).length;
      res.json({
        configured: true,
        smtp: {
          host: cfg.smtp.host,
          port: cfg.smtp.port,
          secure: cfg.smtp.secure,
          userMasked: maskEmail(cfg.smtp.user),
        },
        imap: {
          host: cfg.imap.host,
          port: cfg.imap.port,
          tls: cfg.imap.tls,
          userMasked: maskEmail(cfg.smtp.user),
        },
        paths: {
          outboundLogPath: cfg.outboundLogPath,
          repliesDir: cfg.repliesDir,
          repliesIndexPath: cfg.repliesIndexPath,
        },
        attachmentCountDisk: n,
        sendDelayMs: cfg.sendDelayMs,
        envSamplePath: "(MongoDB)",
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/outbound", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const p = userWorkspacePaths(uid);
      const rows = await readOutboundLog(p.outboundLogPath);
      res.json({ ok: true, rows });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/replies", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const p = userWorkspacePaths(uid);
      const rows = await readJsonlLines<ReplyRecord>(p.repliesIndexPath);
      res.json({ ok: true, rows });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/summary", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const p = userWorkspacePaths(uid);
      const outbound = await readOutboundLog(p.outboundLogPath);
      const replies = await readJsonlLines<ReplyRecord>(p.repliesIndexPath);
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

  app.get("/api/dashboard", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const p = userWorkspacePaths(uid);
      const outbound = await readOutboundLog(p.outboundLogPath);
      const replies = await readJsonlLines<ReplyRecord>(p.repliesIndexPath);
      const dash = buildDashboardPayload(outbound, replies);
      res.json({ ok: true, ...dash });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  });

  app.get("/api/report.csv", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const p = userWorkspacePaths(uid);
      const body = await generateReportCsv(p.outboundLogPath, p.repliesIndexPath);
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

  app.post("/api/poll", requireUser, async (req, res) => {
    try {
      const uid = (req as AuthedRequest).userId;
      const cfg = await getUserMailConfig(uid);
      const sinceRaw = req.body?.since as string | undefined;
      let since: Date | undefined;
      if (sinceRaw) {
        const d = new Date(sinceRaw);
        if (!Number.isNaN(d.getTime())) since = d;
      }
      ensureDir(cfg.repliesDir);
      ensureDir(path.dirname(cfg.repliesIndexPath));
      const imapAuth = { user: cfg.smtp.user, pass: cfg.smtp.pass };
      const processed = await pollRepliesToFolder({
        imapHost: cfg.imap.host,
        imapPort: cfg.imap.port,
        imapTls: cfg.imap.tls,
        imapAuth,
        outboundLogPath: cfg.outboundLogPath,
        repliesDir: cfg.repliesDir,
        repliesIndexPath: cfg.repliesIndexPath,
        since,
      });
      res.json({ ok: true, newMessagesImported: processed.length });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const code =
        msg.includes("Chưa kết nối") || msg.includes("Chưa cấu hình SMTP")
          ? 400
          : 500;
      res.status(code).json({ ok: false, error: msg });
    }
  });

  app.post(
    "/api/send",
    requireUser,
    upload.fields([
      { name: "csv", maxCount: 1 },
      { name: "attachments", maxCount: 40 },
    ]),
    async (req, res) => {
      try {
        const uid = (req as AuthedRequest).userId;
        const cfg = await getUserMailConfig(uid);
        const useSaved = parseBool(
          (req.body as { useSavedRecipients?: string })?.useSavedRecipients,
        );
        await wipeUserUiSend(uid);
        const uiRoot = userUiSendRoot(uid);
        const uiCsv = path.join(uiRoot, "recipients.csv");
        const uiAtt = path.join(uiRoot, "attachments");
        await fs.mkdir(uiAtt, { recursive: true });

        let csvPathResolved: string;
        if (useSaved) {
          const p = userWorkspacePaths(uid).campaignCsv;
          const n = await writeCampaignCsvFromMongo(uid, p);
          if (n === 0) {
            res.status(400).json({
              ok: false,
              error:
                "Chưa có người nhận trong danh sách. Thêm tay hoặc tải CSV ở Bước 2.",
            });
            return;
          }
          csvPathResolved = p;
        } else {
          type FilesMapCsv = Record<string, MulterFile[]> | undefined;
          const fm = req.files as FilesMapCsv;
          const csvFile = fm?.csv?.[0];
          if (!csvFile?.buffer?.length) {
            res.status(400).json({
              ok: false,
              error: "Thiếu file CSV hoặc tick «Dùng danh sách đã lưu».",
            });
            return;
          }
          await fs.writeFile(uiCsv, csvFile.buffer);
          csvPathResolved = uiCsv;
        }

        type FilesMapAtt = Record<string, MulterFile[]> | undefined;
        const fmAtt = req.files as FilesMapAtt;
        const others = fmAtt?.attachments ?? [];
        for (const f of others) {
          const name = path.basename(f.originalname || "file.bin").replace(
            /[^\w.-]+/g,
            "_",
          );
          const dest = path.join(uiAtt, name || "file.bin");
          await fs.writeFile(dest, f.buffer);
        }

        const subjectTemplate = nz(
          (req.body as { subjectTemplate?: string })?.subjectTemplate,
        );
        const bodyText = nz((req.body as { bodyText?: string })?.bodyText);
        if (!subjectTemplate || !bodyText) {
          res.status(400).json({
            ok: false,
            error: "Tiêu đề và nội dung không được để trống",
          });
          return;
        }

        const dryRun = parseBool((req.body as { dryRun?: string })?.dryRun);
        const delayRaw =
          typeof (req.body as { delayMs?: string | number }).delayMs ===
            "string" ||
          typeof (req.body as { delayMs?: string | number }).delayMs ===
            "number"
            ? Number((req.body as { delayMs?: string | number }).delayMs)
            : undefined;
        const delayMs = Number.isFinite(delayRaw!)
          ? Math.max(0, delayRaw!)
          : cfg.sendDelayMs;

        let limitRaw: number | undefined;
        const lim = (req.body as { limit?: string | number }).limit;
        if (typeof lim === "string" && lim.trim().length > 0) {
          const n = parseInt(lim, 10);
          if (!Number.isNaN(n) && n >= 0) limitRaw = n;
        } else if (typeof lim === "number") limitRaw = lim;

        const result = await runSendCampaign({
          csvPath: csvPathResolved,
          subjectTemplate,
          textBody: bodyText,
          dryRun,
          limit: limitRaw,
          delayMs,
          extraAttachmentDirs: [uiAtt],
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
        const code =
          msg.includes("Chưa kết nối") ||
          msg.includes("Chưa cấu hình SMTP") ||
          msg.includes("Microsoft 365")
            ? 400
            : 500;
        res.status(code).json({ ok: false, error: msg });
      }
    },
  );

}
