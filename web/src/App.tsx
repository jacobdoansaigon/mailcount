import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountSetup, SavedRecipientsBlock } from "./SetupSection";

type ApiStatus = {
  configured?: boolean;
  envSamplePath?: string;
  smtp: { host: string; port: number; secure: boolean; userMasked: string };
  imap: { host: string; port: number; tls: boolean; userMasked: string };
  paths: {
    outboundLogPath: string;
    repliesDir: string;
    repliesIndexPath: string;
  };
  attachmentCountDisk: number;
  sendDelayMs: number;
};

type OutboundRow = {
  recipientEmail: string;
  recipientName?: string;
  surveyCode: string;
  messageId: string;
  sentAt: string;
  subject: string;
};

type ReplyRow = {
  inboundMessageId?: string;
  matchedSurveyCode?: string;
  matchedRecipientEmail?: string;
  correlation: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  attachmentPaths?: string[];
};

async function fetchJson<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? r.statusText);
  return data as T;
}

function Toast({
  msg,
  kind,
}: {
  msg: string | null;
  kind: "ok" | "err";
}) {
  if (!msg) return null;
  const cls =
    kind === "ok"
      ? "border-accent/35 bg-accent/11 text-accent"
      : "border-red-400/35 bg-red-950/55 text-red-300";
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 max-w-lg rounded-xl border px-4 py-3 text-sm shadow-soft ${cls}`}
    >
      {msg}
    </div>
  );
}

export function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [outbound, setOutbound] = useState<OutboundRow[]>([]);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [pending, setPending] = useState(0);
  const [replied, setReplied] = useState(0);
  const [sent, setSent] = useState(0);

  const [qOut, setQOut] = useState("");
  const [qRep, setQRep] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(
    null,
  );

  const [subject, setSubject] = useState("Khảo sát hợp tác [{{code}}]");
  const [body, setBody] = useState(
    "Chào {{greetingOrName}},\n\nVui lòng trả lời trực tiếp email này (có đính kèm nếu cần).\n\nTrân trọng,",
  );
  const [dryRun, setDryRun] = useState(false);
  const [limit, setLimit] = useState("3");
  const [pollSince, setPollSince] = useState("");
  const [delayUi, setDelayUi] = useState("");
  const [useSavedRecipients, setUseSavedRecipients] = useState(false);

  const showToast = useCallback((msg: string, kind: "ok" | "err") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5200);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [s, o, rp, summ] = await Promise.all([
        fetchJson<
          {
            configured?: boolean;
            envSamplePath?: string;
          } & Partial<ApiStatus>
        >("/api/status"),
        fetchJson<{ rows: OutboundRow[] }>("/api/outbound"),
        fetchJson<{ rows: ReplyRow[] }>("/api/replies"),
        fetchJson<{
          ok: boolean;
          totals: {
            sent: number;
            repliesMatchedOnCampaign: number;
            pending: number;
          };
        }>("/api/summary"),
      ]);
      const st = {
        configured: s.configured ?? false,
        envSamplePath: s.envSamplePath,
        smtp: s.smtp!,
        imap: s.imap!,
        paths: s.paths!,
        attachmentCountDisk: s.attachmentCountDisk ?? 0,
        sendDelayMs: s.sendDelayMs ?? 0,
      };
      setStatus(st);
      setOutbound(o.rows ?? []);
      setReplies(rp.rows ?? []);
      if (summ.totals) {
        setSent(summ.totals.sent);
        setReplied(summ.totals.repliesMatchedOnCampaign);
        setPending(summ.totals.pending);
      }
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    }
  }, [showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredOut = useMemo(() => {
    const t = qOut.trim().toLowerCase();
    if (!t) return outbound;
    return outbound.filter(
      (r) =>
        r.recipientEmail.toLowerCase().includes(t) ||
        r.subject.toLowerCase().includes(t) ||
        r.surveyCode.toLowerCase().includes(t),
    );
  }, [outbound, qOut]);

  const filteredRep = useMemo(() => {
    const t = qRep.trim().toLowerCase();
    if (!t) return replies;
    return replies.filter(
      (r) =>
        r.fromAddress.toLowerCase().includes(t) ||
        r.subject.toLowerCase().includes(t) ||
        (r.matchedSurveyCode ?? "").toLowerCase().includes(t),
    );
  }, [replies, qRep]);

  const onPoll = async () => {
    setBusy(true);
    try {
      const bodyJson: { since?: string } = {};
      if (pollSince.trim()) bodyJson.since = pollSince.trim();
      const r = await fetchJson<{ newMessagesImported: number }>("/api/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyJson),
      });
      showToast(`Đã đọc ${r.newMessagesImported} mail mới từ Inbox.`, "ok");
      await loadAll();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  const onExport = () => {
    window.open("/api/report.csv", "_blank");
  };

  const onSend = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    fd.set("subjectTemplate", subject);
    fd.set("bodyText", body);
    fd.set("dryRun", dryRun ? "1" : "");
    fd.set("useSavedRecipients", useSavedRecipients ? "1" : "");
    fd.set("limit", limit.trim());
    if (delayUi.trim()) fd.set("delayMs", delayUi.trim());
    setBusy(true);
    try {
      const r = await fetch("/api/send", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      if (dryRun) {
        const n = (data.preview as { email: string }[] | undefined)?.length ?? 0;
        showToast(`Dry-run: ${n} người, đính kèm gộp ${data.attachmentCountCombined ?? 0} file.`, "ok");
      } else {
        showToast(`Đã gửi ${data.recipientCount ?? 0} mail.`, "ok");
      }
      await loadAll();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-ink-950 via-[#111823] to-ink-950">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-8 px-5 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Mail-count
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Gửi khảo sát & đối chiếu phản hồi
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Giao diện cho workflow SMTP + IMAP: gửi từng người, đọc Inbox, xuất CSV.
              Chạy kèm <code className="rounded bg-panel px-1.5 py-0.5 text-xs">npm run dev:ui</code>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={busy}
              className="rounded-xl border border-stroke bg-panel px-4 py-2 text-sm font-medium text-ink-900 shadow-sm transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
            >
              Làm mới dữ liệu
            </button>
            <button
              type="button"
              onClick={onExport}
              className="rounded-xl border border-accent/40 bg-accent/16 px-4 py-2 text-sm font-semibold text-accent shadow-sm transition hover:bg-accent/24"
            >
              Tải report.csv
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <AccountSetup onSaved={loadAll} showToast={showToast} />
          <SavedRecipientsBlock onSaved={loadAll} showToast={showToast} />
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Đã gửi (log)" value={String(sent)} hint="outbound-log" />
          <Stat label="Đã khớp phản hồi" value={String(replied)} hint="theo chiến dịch" />
          <Stat label="Chưa phản hồi" value={String(pending)} hint="ước lượng" />
          <Stat
            label="Mail Inbox đã import"
            value={String(replies.length)}
            hint="replies-index"
          />
        </section>

        {status?.configured === false && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Chưa cấu hình đủ SMTP trong <strong>.env</strong>. Anh làm đầy mục{" "}
            <strong>Cấu hình SMTP / IMAP</strong> phía trên rồi nhấn Lưu — sau đó mới gửi mail / poll được.
          </div>
        )}

        {status && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-stroke bg-panel/80 p-5 shadow-soft backdrop-blur">
              <h2 className="text-sm font-semibold text-ink-900">SMTP · gửi</h2>
              <dl className="mt-3 space-y-2 text-sm text-muted">
                <div className="flex justify-between gap-4">
                  <dt>Host</dt>
                  <dd className="font-mono text-ink-900">
                    {status.smtp.host}:{status.smtp.port}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Tài khoản</dt>
                  <dd className="text-ink-900">{status.smtp.userMasked}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Đính kèm trên đĩa</dt>
                  <dd className="text-ink-900">{status.attachmentCountDisk} file</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Delay mặc định</dt>
                  <dd className="text-ink-900">{status.sendDelayMs} ms</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-stroke bg-panel/80 p-5 shadow-soft backdrop-blur">
              <h2 className="text-sm font-semibold text-ink-900">IMAP · đọc phản hồi</h2>
              <dl className="mt-3 space-y-2 text-sm text-muted">
                <div className="flex justify-between gap-4">
                  <dt>Host</dt>
                  <dd className="font-mono text-ink-900">
                    {status.imap.host}:{status.imap.port}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Tài khoản</dt>
                  <dd className="text-ink-900">{status.imap.userMasked}</dd>
                </div>
                <div className="mt-3 rounded-lg border border-stroke/80 bg-ink-950/40 p-3 text-xs text-muted">
                  <p className="font-medium text-ink-900">Đường dẫn</p>
                  <p className="mt-1 break-all opacity-90">{status.paths.outboundLogPath}</p>
                  <p className="mt-1 break-all opacity-90">{status.paths.repliesIndexPath}</p>
                </div>
              </dl>
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-5">
          <form
            onSubmit={onSend}
            className="lg:col-span-2 rounded-2xl border border-stroke bg-panel/90 p-6 shadow-soft"
          >
            <h2 className="text-lg font-semibold text-ink-900">Gửi chiến dịch</h2>
            <p className="mt-1 text-xs text-muted">
              {useSavedRecipients ? (
                <>
                  Đang dùng file đã lưu (mục Danh sách email); có thể thêm cột{" "}
                  <code className="text-ink-900">greeting</code> cho mẫu{" "}
                  <code className="text-ink-900">{"{{greetingOrName}}"}</code>. Đính kèm upload thêm
                  vẫn gộp với <code className="text-ink-900">data/attachments</code>.
                </>
              ) : (
                <>
                  CSV cột <code className="text-ink-900">email</code> bắt buộc; cột{" "}
                  <code className="text-ink-900">greeting</code> (vd Anh Minh, Chị Lan) để mẫu mail
                  dùng <code className="text-ink-900">{"{{greetingOrName}}"}</code>. File upload thêm
                  gộp với{" "}
                  <code className="text-ink-900">data/attachments</code>.
                </>
              )}
            </p>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={useSavedRecipients}
                onChange={(e) => setUseSavedRecipients(e.target.checked)}
                className="rounded border-stroke bg-ink-950 text-accent"
              />
              Dùng danh sách đã lưu trên máy (data/campaign-recipients.csv)
            </label>

            <label className="mt-4 block text-xs font-medium text-muted">
              Tiêu đề
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stroke bg-ink-950/50 px-3 py-2 text-sm text-ink-900 outline-none ring-0 focus:border-accent"
              />
            </label>

            <label className="mt-3 block text-xs font-medium text-muted">
              Nội dung (text)
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                className="mt-1 w-full resize-y rounded-xl border border-stroke bg-ink-950/50 px-3 py-2 font-mono text-xs text-ink-900 outline-none focus:border-accent"
              />
              <span className="mt-1 block text-[11px] leading-relaxed text-muted">
                Mẫu: <code className="text-ink-900">{"{{greeting}}"}</code>,{" "}
                <code className="text-ink-900">{"{{greetingOrName}}"}</code>,{" "}
                <code className="text-ink-900">{"{{name}}"}</code>,{" "}
                <code className="text-ink-900">{"{{email}}"}</code>,{" "}
                <code className="text-ink-900">{"{{code}}"}</code> — áp dụng cả tiêu đề và nội dung.
              </span>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted">
                File CSV {!useSavedRecipients ? "(bắt buộc)" : "(bỏ qua)"}
                <input
                  name="csv"
                  type="file"
                  accept=".csv,text/csv"
                  required={!useSavedRecipients}
                  disabled={useSavedRecipients}
                  className="mt-1 w-full text-xs text-ink-900 file:mr-3 file:rounded-lg file:border-0 file:bg-accent/20 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                Đính kèm thêm (tuỳ chọn)
                <input
                  name="attachments"
                  type="file"
                  multiple
                  className="mt-1 w-full text-xs text-ink-900 file:mr-3 file:rounded-lg file:border-0 file:bg-accent2/18 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent2"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="rounded border-stroke bg-ink-950 text-accent focus:ring-accent"
                />
                Dry-run (không gửi)
              </label>
              <label className="inline-flex items-center gap-2">
                Giới hạn
                <input
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-20 rounded-lg border border-stroke bg-ink-950/50 px-2 py-1 text-ink-900"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                Delay ms
                <input
                  value={delayUi}
                  onChange={(e) => setDelayUi(e.target.value)}
                  placeholder="mặc định .env"
                  className="w-28 rounded-lg border border-stroke bg-ink-950/50 px-2 py-1 text-ink-900"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-accent to-accent2 py-2.5 text-sm font-semibold text-ink-950 shadow-soft transition hover:opacity-95 disabled:opacity-40"
            >
              {dryRun ? "Chạy dry-run" : "Gửi mail"}
            </button>
          </form>

          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="rounded-2xl border border-stroke bg-panel/90 p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-ink-900">Đọc Inbox (IMAP)</h2>
                  <p className="text-xs text-muted">
                    Nhập ngày tùy chọn (ISO), để trống dùng mặc định 7 ngày gần đây.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={pollSince}
                    onChange={(e) => setPollSince(e.target.value)}
                    placeholder="2026-05-01"
                    className="rounded-xl border border-stroke bg-ink-950/50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => void onPoll()}
                    disabled={busy}
                    className="rounded-xl border border-accent2/40 bg-accent2/15 px-4 py-2 text-sm font-semibold text-accent2 transition hover:bg-accent2/25 disabled:opacity-40"
                  >
                    Poll Inbox
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-[320px] flex-1 flex-col gap-4 rounded-2xl border border-stroke bg-panel/90 p-5 shadow-soft">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-ink-900">Đã gửi</h2>
                <input
                  value={qOut}
                  onChange={(e) => setQOut(e.target.value)}
                  placeholder="Lọc email / mã / tiêu đề…"
                  className="w-full rounded-xl border border-stroke bg-ink-950/50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-accent sm:max-w-xs"
                />
              </div>
              <div className="soft-scroll max-h-72 overflow-auto rounded-xl border border-stroke/80">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-ink-950/95 text-[10px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Mã</th>
                      <th className="px-3 py-2">Gửi lúc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke/60 text-ink-900">
                    {filteredOut.slice(0, 200).map((r) => (
                      <tr key={r.messageId} className="hover:bg-accent/9">
                        <td className="px-3 py-2 font-mono text-[11px]">{r.recipientEmail}</td>
                        <td className="px-3 py-2 text-accent">{r.surveyCode}</td>
                        <td className="px-3 py-2 text-muted">{r.sentAt.slice(0, 19)}</td>
                      </tr>
                    ))}
                    {filteredOut.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-muted">
                          Chưa có log outbound.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex min-h-[280px] flex-col gap-4 rounded-2xl border border-stroke bg-panel/90 p-5 shadow-soft">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-ink-900">Phản hồi đã import</h2>
                <input
                  value={qRep}
                  onChange={(e) => setQRep(e.target.value)}
                  placeholder="Lọc From / CODE / chủ đề…"
                  className="w-full rounded-xl border border-stroke bg-ink-950/50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-accent2 sm:max-w-xs"
                />
              </div>
              <div className="soft-scroll max-h-64 overflow-auto rounded-xl border border-stroke/80">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-ink-950/95 text-[10px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">Khớp</th>
                      <th className="px-3 py-2">Nhận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke/60 text-ink-900">
                    {filteredRep.slice(-200).reverse().map((r, i) => (
                      <tr key={`${r.inboundMessageId ?? r.subject}-${i}`} className="hover:bg-accent2/9">
                        <td className="px-3 py-2 font-mono text-[11px]">{r.fromAddress || "—"}</td>
                        <td className="px-3 py-2 text-accent2">{r.correlation}</td>
                        <td className="px-3 py-2 text-muted">{r.receivedAt.slice(0, 19)}</td>
                      </tr>
                    ))}
                    {filteredRep.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-muted">
                          Chưa có phản hồi trong index.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-stroke/60 pt-6 text-center text-[11px] text-muted">
          Chỉ lắng nghe <code>127.0.0.1</code> — an toàn cho máy anh. Production:{" "}
          <code className="text-ink-900">npm run build:all && NODE_ENV=production npm run start:ui</code>
        </footer>
      </div>
      <Toast msg={toast?.msg ?? null} kind={toast?.kind ?? "ok"} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-stroke bg-gradient-to-br from-panel to-ink-950/40 p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-[10px] text-muted/80">{hint}</p>
    </div>
  );
}
