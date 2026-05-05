import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardTab } from "./DashboardTab";
import { SavedRecipientsBlock } from "./SetupSection";
import { SimpleAccount } from "./SimpleAccount";

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
      className={`fixed bottom-6 right-6 z-50 max-w-lg rounded-2xl border px-5 py-3.5 text-sm shadow-2xl ${cls}`}
    >
      {msg}
    </div>
  );
}

type TabId = "campaign" | "dashboard";

export function App() {
  const [tab, setTab] = useState<TabId>("campaign");
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [outbound, setOutbound] = useState<OutboundRow[]>([]);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [dashRefresh, setDashRefresh] = useState(0);

  const [qOut, setQOut] = useState("");
  const [qRep, setQRep] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(
    null,
  );
  const [showMore, setShowMore] = useState(false);

  const [subject, setSubject] = useState("Khảo sát hợp tác [{{code}}]");
  const [body, setBody] = useState(
    "Chào {{greetingOrName}},\n\nVui lòng trả lời trực tiếp email này (có đính kèm nếu cần).\n\nTrân trọng,",
  );
  const [limit, setLimit] = useState("");
  const [pollSince, setPollSince] = useState("");
  const [useSavedRecipients, setUseSavedRecipients] = useState(true);

  const showToast = useCallback((msg: string, kind: "ok" | "err") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5200);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [s, o, rp] = await Promise.all([
        fetchJson<
          {
            configured?: boolean;
            envSamplePath?: string;
          } & Partial<ApiStatus>
        >("/api/status"),
        fetchJson<{ rows: OutboundRow[] }>("/api/outbound"),
        fetchJson<{ rows: ReplyRow[] }>("/api/replies"),
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
      setDashRefresh((k) => k + 1);
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
      showToast(`Đã nhận ${r.newMessagesImported} thư mới từ hộp thư.`, "ok");
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
    fd.set("dryRun", "");
    fd.set("useSavedRecipients", useSavedRecipients ? "1" : "");
    fd.set("limit", limit.trim());
    setBusy(true);
    try {
      const r = await fetch("/api/send", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      showToast(`Đã gửi ${data.recipientCount ?? 0} email.`, "ok");
      await loadAll();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(status?.configured);

  return (
    <div className="mesh-bg min-h-full">
      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-accent">
              Mail-count
            </p>
            <h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Khảo sát qua email,
              <span className="block bg-gradient-to-r from-accent via-teal-200 to-accent2 bg-clip-text text-transparent">
                theo dõi phản hồi dễ như chơi game
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              HR và đội MSA chỉ cần vài bước: kết nối mailbox công ty → tải danh sách → gửi → xem số
              liệu. Không cần biết SMTP hay IMAP.
            </p>
          </div>
          <nav className="flex shrink-0 gap-2 rounded-2xl border border-white/[0.08] bg-ink-950/60 p-1.5 shadow-inner backdrop-blur">
            {(
              [
                ["campaign", "Gửi & thu"],
                ["dashboard", "Số liệu"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                  tab === id
                    ? "bg-gradient-to-r from-accent/90 to-teal-400 text-ink-950 shadow-lg shadow-accent/20"
                    : "text-muted hover:text-ink-900"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        {tab === "dashboard" ? (
          <DashboardTab showToast={showToast} refreshKey={dashRefresh} />
        ) : (
          <>
            <SimpleAccount onSaved={loadAll} showToast={showToast} />

            <div className="grid gap-6 lg:grid-cols-2">
              <SavedRecipientsBlock onSaved={loadAll} showToast={showToast} />
              {!ready && (
                <div className="flex items-center rounded-3xl border border-amber-400/25 bg-amber-500/10 p-6 text-sm text-amber-50">
                  Kết nối email ở bước 1 và lưu danh sách ở bước 2 — sau đó mới gửi được nhé.
                </div>
              )}
            </div>

            <section className="grid gap-8 lg:grid-cols-5">
              <form
                onSubmit={onSend}
                className="lg:col-span-2 flex flex-col rounded-3xl border border-white/[0.07] bg-panel/88 p-6 shadow-soft backdrop-blur sm:p-8"
              >
                <h2 className="font-display text-xl font-bold text-white">Gửi khảo sát</h2>
                <p className="mt-2 text-sm text-muted">
                  {useSavedRecipients
                    ? "Dùng danh sách đã lưu ở bước 2. Có thể đính kèm thêm tài liệu bên dưới."
                    : "Chọn file CSV trong một lần gửi (cột email bắt buộc)."}
                </p>

                <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-ink-900">
                  <input
                    type="checkbox"
                    checked={useSavedRecipients}
                    onChange={(e) => setUseSavedRecipients(e.target.checked)}
                    className="h-4 w-4 rounded border-stroke bg-ink-950 text-accent"
                  />
                  Dùng danh sách đã lưu
                </label>

                <label className="mt-5 block">
                  <span className="text-xs font-semibold text-muted">Tiêu đề email</span>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/70 px-4 py-3 text-sm text-white outline-none focus:border-accent/50"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-xs font-semibold text-muted">Nội dung</span>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    className="mt-2 w-full resize-y rounded-2xl border border-stroke/90 bg-ink-950/70 px-4 py-3 font-mono text-xs leading-relaxed text-white outline-none focus:border-accent/50"
                  />
                  <span className="mt-2 block text-[11px] text-muted/90">
                    Có thể dùng: {"{{greetingOrName}}"}, {"{{name}}"}, {"{{email}}"}, {"{{code}}"}
                  </span>
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-muted">
                    <span className="font-medium text-ink-900">
                      File danh sách {!useSavedRecipients ? "*" : ""}
                    </span>
                    <input
                      name="csv"
                      type="file"
                      accept=".csv,text/csv"
                      required={!useSavedRecipients}
                      disabled={useSavedRecipients}
                      className="mt-2 block w-full text-xs text-ink-900 file:mr-2 file:rounded-lg file:border-0 file:bg-accent/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-accent"
                    />
                  </label>
                  <label className="block text-sm text-muted">
                    <span className="font-medium text-ink-900">Đính kèm (tuỳ chọn)</span>
                    <input
                      name="attachments"
                      type="file"
                      multiple
                      className="mt-2 block w-full text-xs text-ink-900 file:mr-2 file:rounded-lg file:border-0 file:bg-accent2/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-accent2"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  className="mt-4 text-left text-xs font-semibold text-accent2 hover:underline"
                >
                  {showMore ? "Ẩn tuỳ chọn ▴" : "Tuỳ chọn nâng cao ▾"}
                </button>

                {showMore ? (
                  <label className="mt-3 block text-sm text-muted">
                    Chỉ gửi cho N người đầu (để trống = gửi cả danh sách)
                    <input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="vd: 5"
                      className="mt-2 w-full max-w-[120px] rounded-xl border border-stroke bg-ink-950/60 px-3 py-2 text-ink-900"
                    />
                  </label>
                ) : null}

                <button
                  type="submit"
                  disabled={busy || !ready}
                  className="mt-8 w-full rounded-2xl bg-gradient-to-r from-accent via-teal-300 to-accent2 py-4 text-base font-black text-ink-950 shadow-xl shadow-accent/20 transition hover:brightness-110 disabled:opacity-35"
                >
                  {busy ? "Đang gửi…" : "Gửi email khảo sát"}
                </button>
              </form>

              <div className="lg:col-span-3 flex flex-col gap-6">
                <div className="rounded-3xl border border-white/[0.07] bg-panel/88 p-6 shadow-soft backdrop-blur">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold text-white">Lấy phản hồi</h2>
                      <p className="mt-1 text-sm text-muted">
                        Đọc hộp thư — mặc định 7 ngày gần nhất. File đính kèm phản hồi được lưu tự động.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onPoll()}
                      disabled={busy || !ready}
                      className="shrink-0 rounded-2xl border border-accent2/40 bg-accent2/15 px-6 py-3.5 text-sm font-bold text-accent2 transition hover:bg-accent2/25 disabled:opacity-35"
                    >
                      Kiểm tra hộp thư
                    </button>
                  </div>
                  {showMore ? (
                    <label className="mt-4 block text-xs text-muted">
                      Chỉ đọc mail từ ngày (tuỳ chọn, dạng 2026-05-01)
                      <input
                        value={pollSince}
                        onChange={(e) => setPollSince(e.target.value)}
                        className="mt-2 w-full max-w-xs rounded-xl border border-stroke bg-ink-950/60 px-3 py-2 text-sm text-ink-900"
                      />
                    </label>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void loadAll()}
                    disabled={busy}
                    className="rounded-2xl border border-stroke bg-ink-950/50 px-5 py-2.5 text-sm font-semibold text-ink-900 disabled:opacity-40"
                  >
                    Làm mới
                  </button>
                  <button
                    type="button"
                    onClick={onExport}
                    className="rounded-2xl border border-accent/35 bg-accent/12 px-5 py-2.5 text-sm font-bold text-accent"
                  >
                    Tải báo cáo Excel (CSV)
                  </button>
                </div>

                <div className="rounded-3xl border border-white/[0.07] bg-panel/88 p-5 shadow-soft backdrop-blur">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-display font-bold text-white">Đã gửi gần đây</h3>
                    <input
                      value={qOut}
                      onChange={(e) => setQOut(e.target.value)}
                      placeholder="Tìm…"
                      className="max-w-[200px] rounded-xl border border-stroke bg-ink-950/50 px-3 py-1.5 text-xs text-ink-900"
                    />
                  </div>
                  <div className="soft-scroll max-h-64 overflow-auto rounded-xl border border-stroke/60">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-ink-950 text-[10px] uppercase text-muted">
                        <tr>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Mã</th>
                          <th className="px-3 py-2">Lúc gửi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke/50 text-ink-900">
                        {filteredOut.slice(0, 120).map((r) => (
                          <tr key={r.messageId} className="hover:bg-white/[0.03]">
                            <td className="px-3 py-2 font-mono text-[11px]">{r.recipientEmail}</td>
                            <td className="px-3 py-2 text-accent">{r.surveyCode}</td>
                            <td className="px-3 py-2 text-muted">{r.sentAt.slice(0, 16)}</td>
                          </tr>
                        ))}
                        {filteredOut.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-10 text-center text-muted">
                              Chưa có lần gửi nào.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/[0.07] bg-panel/88 p-5 shadow-soft backdrop-blur">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-display font-bold text-white">Phản hồi đã nhận</h3>
                    <input
                      value={qRep}
                      onChange={(e) => setQRep(e.target.value)}
                      placeholder="Tìm…"
                      className="max-w-[200px] rounded-xl border border-stroke bg-ink-950/50 px-3 py-1.5 text-xs text-ink-900"
                    />
                  </div>
                  <div className="soft-scroll max-h-56 overflow-auto rounded-xl border border-stroke/60">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-ink-950 text-[10px] uppercase text-muted">
                        <tr>
                          <th className="px-3 py-2">Người gửi</th>
                          <th className="px-3 py-2">Cách khớp</th>
                          <th className="px-3 py-2">Lúc nhận</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke/50 text-ink-900">
                        {filteredRep
                          .slice(-120)
                          .reverse()
                          .map((r, i) => (
                            <tr
                              key={`${r.inboundMessageId ?? r.subject}-${i}`}
                              className="hover:bg-white/[0.03]"
                            >
                              <td className="px-3 py-2 font-mono text-[11px]">
                                {r.fromAddress || "—"}
                              </td>
                              <td className="px-3 py-2 text-accent2">{r.correlation}</td>
                              <td className="px-3 py-2 text-muted">{r.receivedAt.slice(0, 16)}</td>
                            </tr>
                          ))}
                        {filteredRep.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-10 text-center text-muted">
                              Chưa có phản hồi.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        <footer className="border-t border-white/[0.06] pt-8 text-center text-[11px] text-muted">
          Mail-count · dữ liệu lưu trên máy chủ anh ·{" "}
          <code className="text-muted/80">npm start</code> khi triển khai
        </footer>
      </div>
      <Toast msg={toast?.msg ?? null} kind={toast?.kind ?? "ok"} />
    </div>
  );
}
