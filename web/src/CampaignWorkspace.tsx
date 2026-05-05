import { useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchJson } from "./api-fetch";
import {
  renderMailTemplate,
  splitTemplateHighlights,
  type MailPreviewCtx,
} from "./mailPreview";
import { SimpleAccount } from "./SimpleAccount";
import { ProfilePassword } from "./ProfilePassword";

type RecRow = {
  email: string;
  name: string;
  greeting: string;
  title: string;
  surveyCode: string;
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
};

function previewCtx(r: RecRow): MailPreviewCtx {
  const code =
    (r.surveyCode ?? "").trim() ||
    "DEMO12AB";
  return {
    surveyCode: code,
    name: r.name ?? "",
    email: r.email,
    greeting: r.greeting ?? "",
    title: r.title ?? "",
  };
}

function HighlightedLine({ text }: { text: string }) {
  const parts = splitTemplateHighlights(text);
  return (
    <span className="break-words">
      {parts.map((p, i) =>
        p.key === "ph" ? (
          <span key={i} className="font-medium text-accent2">
            {p.text}
          </span>
        ) : (
          <span key={i} className="text-white/90">
            {p.text}
          </span>
        ),
      )}
    </span>
  );
}

export function CampaignWorkspace(props: {
  ready: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  showToast: (m: string, k: "ok" | "err") => void;
  loadAll: () => Promise<void>;
  refreshKey: number;
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  limit: string;
  setLimit: (v: string) => void;
  pollSince: string;
  setPollSince: (v: string) => void;
}) {
  const {
    ready,
    busy,
    setBusy,
    showToast,
    loadAll,
    refreshKey,
    subject,
    setSubject,
    body,
    setBody,
    limit,
    setLimit,
    pollSince,
    setPollSince,
  } = props;

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<RecRow[]>([]);
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualGreeting, setManualGreeting] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [busyRec, setBusyRec] = useState(false);
  const [busyFile, setBusyFile] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [outbound, setOutbound] = useState<OutboundRow[]>([]);
  const [replies, setReplies] = useState<ReplyRow[]>([]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusyRec(true);
      try {
        const d = await fetchJson<{
          ok: boolean;
          total: number;
          page: number;
          rows: RecRow[];
        }>(`/api/recipients/saved?page=${page}&limit=${pageSize}`);
        if (cancelled) return;
        setTotal(d.total ?? 0);
        setRows(d.rows ?? []);
      } catch (e) {
        if (!cancelled) showToast(String(e instanceof Error ? e.message : e), "err");
      } finally {
        if (!cancelled) setBusyRec(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey, showToast]);

  useEffect(() => {
    if (!histOpen) return;
    (async () => {
      try {
        const [o, rp] = await Promise.all([
          fetchJson<{ rows: OutboundRow[] }>("/api/outbound"),
          fetchJson<{ rows: ReplyRow[] }>("/api/replies"),
        ]);
        setOutbound(o.rows ?? []);
        setReplies(rp.rows ?? []);
      } catch (e) {
        showToast(String(e instanceof Error ? e.message : e), "err");
      }
    })();
  }, [histOpen, refreshKey, showToast]);

  const previewRows = useMemo(() => rows.slice(0, 2), [rows]);

  const onManual = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusyRec(true);
    try {
      await fetchJson<{ ok: boolean }>("/api/recipients/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: manualEmail.trim(),
          name: manualName.trim(),
          greeting: manualGreeting.trim(),
          title: manualTitle.trim(),
        }),
      });
      setManualEmail("");
      setManualName("");
      setManualGreeting("");
      setManualTitle("");
      setPage(1);
      void loadAll();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusyRec(false);
    }
  };

  const onFile = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    setBusyFile(true);
    try {
      const r = await fetch("/api/recipients/saved", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? r.statusText);
      ev.currentTarget.reset();
      setPage(1);
      void loadAll();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusyFile(false);
    }
  };

  const onSend = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    fd.set("subjectTemplate", subject);
    fd.set("bodyText", body);
    fd.set("dryRun", "");
    fd.set("useSavedRecipients", "1");
    fd.set("limit", limit.trim());
    setBusy(true);
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 900_000);
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        body: fd,
        signal: ac.signal,
        credentials: "include",
      });
      const raw = await r.text();
      let data: { error?: string; recipientCount?: number } = {};
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          throw new Error(
            raw.length > 180 ? `${raw.slice(0, 180)}…` : raw || r.statusText,
          );
        }
      }
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      showToast(`Đã gửi ${data.recipientCount ?? 0}`, "ok");
      await loadAll();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        showToast("Hết thời gian chờ — thử giới hạn ít người hơn.", "err");
      } else {
        showToast(String(e instanceof Error ? e.message : e), "err");
      }
    } finally {
      window.clearTimeout(t);
      setBusy(false);
    }
  };

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
      showToast(`+${r.newMessagesImported}`, "ok");
      await loadAll();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-24 sm:gap-6">
      <div className="space-y-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Hồ sơ
        </h2>
        <ProfilePassword showToast={showToast} variant="compact" />
        <SimpleAccount
          onSaved={loadAll}
          showToast={showToast}
          variant="compact"
        />
      </div>

      {/* 1 — Nội dung mail */}
      <section className="rounded-2xl border border-white/[0.08] bg-panel/90 p-4 shadow-soft sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold tracking-wide text-white">Nội dung gửi</h2>
          <span className="text-[10px] text-muted">màu mint = từ danh sách</span>
        </div>
        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tiêu đề</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-stroke/80 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40"
          />
          <div className="mt-1.5 rounded-lg bg-ink-950/50 px-2 py-1.5 text-xs leading-snug">
            <HighlightedLine text={subject} />
          </div>
        </label>
        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Nội dung</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1.5 w-full resize-y rounded-xl border border-stroke/80 bg-ink-950/70 px-3 py-2.5 font-mono text-xs leading-relaxed text-white outline-none focus:border-accent/40"
          />
          <div className="mt-1.5 max-h-28 overflow-y-auto rounded-lg bg-ink-950/50 px-2 py-1.5 text-xs leading-relaxed">
            <HighlightedLine text={body.slice(0, 800) + (body.length > 800 ? "…" : "")} />
          </div>
        </label>
      </section>

      {/* 2 — Danh sách */}
      <section className="rounded-2xl border border-white/[0.08] bg-panel/90 p-4 shadow-soft sm:p-5">
        <h2 className="font-display text-sm font-bold text-white">Danh sách</h2>

        <form onSubmit={onManual} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            required
            placeholder="Email *"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            className="rounded-xl border border-stroke/80 bg-ink-950/70 px-3 py-2 text-sm text-white placeholder:text-muted/50 sm:col-span-2"
          />
          <input
            type="text"
            placeholder="Tên"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className="rounded-xl border border-stroke/80 bg-ink-950/70 px-3 py-2 text-sm text-white placeholder:text-muted/50"
          />
          <input
            type="text"
            placeholder="Nhân xưng"
            value={manualGreeting}
            onChange={(e) => setManualGreeting(e.target.value)}
            className="rounded-xl border border-stroke/80 bg-ink-950/70 px-3 py-2 text-sm text-white placeholder:text-muted/50"
          />
          <input
            type="text"
            placeholder="Chức vụ"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            className="rounded-xl border border-stroke/80 bg-ink-950/70 px-3 py-2 text-sm text-white placeholder:text-muted/50 sm:col-span-2"
          />
          <button
            type="submit"
            disabled={busyRec}
            className="rounded-xl bg-accent/20 py-2.5 text-sm font-bold text-accent sm:col-span-2"
          >
            {busyRec ? "…" : "Thêm"}
          </button>
        </form>

        <form onSubmit={onFile} className="mt-4 flex flex-col gap-2 border-t border-stroke/50 pt-4 sm:flex-row sm:items-end">
          <input
            name="csv"
            type="file"
            accept=".csv,text/csv"
            required
            className="min-w-0 flex-1 text-xs text-ink-900 file:mr-2 file:rounded-lg file:border-0 file:bg-accent2/20 file:px-3 file:py-2 file:font-semibold file:text-accent2"
          />
          <button
            type="submit"
            disabled={busyFile}
            className="rounded-xl bg-accent2/20 px-4 py-2.5 text-sm font-bold text-accent2"
          >
            {busyFile ? "…" : "CSV"}
          </button>
        </form>

        <div className="mt-4 overflow-x-auto rounded-xl border border-stroke/60">
          <table className="w-full min-w-[520px] text-left text-[11px] sm:text-xs">
            <thead className="bg-ink-950/90 text-[10px] uppercase text-muted">
              <tr>
                <th className="px-2 py-2">Tên</th>
                <th className="px-2 py-2">Nhân xưng</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Chức vụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke/40 text-ink-900">
              {rows.map((r) => (
                <tr key={r.email} className="hover:bg-white/[0.03]">
                  <td className="max-w-[100px] truncate px-2 py-2">{r.name || "—"}</td>
                  <td className="max-w-[90px] truncate px-2 py-2">{r.greeting || "—"}</td>
                  <td className="max-w-[140px] truncate px-2 py-2 font-mono">{r.email}</td>
                  <td className="max-w-[100px] truncate px-2 py-2">{r.title || "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-2 py-8 text-center text-muted">
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>
            {total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}` : "0"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || busyRec}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-stroke px-3 py-1.5 font-semibold text-ink-900 disabled:opacity-30"
            >
              ←
            </button>
            <button
              type="button"
              disabled={page >= totalPages || busyRec}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-stroke px-3 py-1.5 font-semibold text-ink-900 disabled:opacity-30"
            >
              →
            </button>
          </div>
        </div>
      </section>

      {/* 3 — Xem trước + gửi */}
      <section className="rounded-2xl border border-white/[0.08] bg-panel/90 p-4 shadow-soft sm:p-5">
        <h2 className="font-display text-sm font-bold text-white">Xem trước</h2>
        <div className="soft-scroll mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {previewRows.length === 0 ? (
            <div className="snap-center text-sm text-muted">Thêm danh sách trước</div>
          ) : (
            previewRows.map((r, idx) => {
              const ctx = previewCtx(r);
              const subj = renderMailTemplate(subject, ctx);
              const bod = renderMailTemplate(body, ctx);
              return (
                <div
                  key={r.email + idx}
                  className="w-[min(88vw,340px)] shrink-0 snap-center rounded-xl border border-stroke/70 bg-ink-950/55 p-3"
                >
                  <p className="text-[10px] font-bold uppercase text-accent2">Người {idx + 1}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold text-white">{subj}</p>
                  <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted">
                    {bod}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={(e) => void onSend(e)} className="mt-4 space-y-3 border-t border-stroke/50 pt-4">
          <input type="hidden" name="useSavedRecipients" value="1" />
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <span>Giới hạn N người (trống = tất cả)</span>
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="N"
              className="w-16 rounded-lg border border-stroke bg-ink-950/60 px-2 py-1 text-ink-900"
            />
          </label>
          <label className="block text-[11px] text-muted">
            Poll từ ngày (tuỳ chọn)
            <input
              value={pollSince}
              onChange={(e) => setPollSince(e.target.value)}
              placeholder="2026-05-01"
              className="mt-1 w-full max-w-xs rounded-lg border border-stroke bg-ink-950/60 px-2 py-1.5 text-sm text-ink-900"
            />
          </label>
          <label className="block text-[11px] text-muted">
            Đính kèm
            <input
              name="attachments"
              type="file"
              multiple
              className="mt-1 block w-full text-xs file:rounded-lg file:border-0 file:bg-accent2/20 file:px-3 file:py-2 file:font-semibold file:text-accent2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !ready}
              className="min-h-[48px] flex-1 rounded-2xl bg-gradient-to-r from-accent to-teal-400 px-4 py-3 text-sm font-black text-ink-950 disabled:opacity-35"
            >
              {busy ? "Đang gửi…" : "Gửi hàng loạt"}
            </button>
            <button
              type="button"
              onClick={() => void onPoll()}
              disabled={busy || !ready}
              className="min-h-[48px] rounded-2xl border border-accent2/40 bg-accent2/15 px-4 py-3 text-sm font-bold text-accent2 disabled:opacity-35"
            >
              Poll
            </button>
            <button
              type="button"
              onClick={() => window.open("/api/report.csv", "_blank")}
              className="min-h-[48px] rounded-2xl border border-stroke px-4 py-3 text-sm font-semibold text-ink-900"
            >
              CSV
            </button>
          </div>
        </form>
      </section>

      <details
        className="rounded-2xl border border-white/[0.06] bg-ink-950/30 px-3 py-2"
        onToggle={(e) => setHistOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none py-2 text-sm font-semibold text-muted marker:hidden [&::-webkit-details-marker]:hidden">
          Lịch sử gửi / phản hồi
        </summary>
        <div className="grid gap-3 pb-3 sm:grid-cols-2">
          <div className="soft-scroll max-h-48 overflow-auto rounded-lg border border-stroke/50 p-2">
            <p className="mb-1 text-[10px] uppercase text-muted">Đã gửi</p>
            {outbound.slice(-40).map((r) => (
              <div key={r.messageId} className="truncate py-0.5 font-mono text-[10px] text-ink-900">
                {r.recipientEmail}
              </div>
            ))}
          </div>
          <div className="soft-scroll max-h-48 overflow-auto rounded-lg border border-stroke/50 p-2">
            <p className="mb-1 text-[10px] uppercase text-muted">Phản hồi</p>
            {replies.slice(-40).map((r, i) => (
              <div key={i} className="truncate py-0.5 font-mono text-[10px] text-ink-900">
                {r.fromAddress}
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
