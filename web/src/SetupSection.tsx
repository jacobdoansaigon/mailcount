import { useCallback, useEffect, useState } from "react";

async function fj<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? r.statusText);
  return body as T;
}

/** Lưu danh sách người nhận (CSV) — dùng lại mỗi lần gửi */
export function SavedRecipientsBlock(props: {
  onSaved: () => void | Promise<void>;
  showToast: (m: string, k: "ok" | "err") => void;
}) {
  const { onSaved, showToast } = props;
  const [busySubmit, setBusySubmit] = useState(false);
  const [busyManual, setBusyManual] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualGreeting, setManualGreeting] = useState("");
  const [info, setInfo] = useState<{
    exists: boolean;
    path: string;
    rowCount: number;
    sampleEmails: string[];
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fj<{
        ok: boolean;
        exists: boolean;
        path: string;
        rowCount: number;
        sampleEmails: string[];
      }>("/api/recipients/saved");
      setInfo(d);
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onManualAdd = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusyManual(true);
    try {
      const r = await fj<{ ok: boolean; rowCount: number }>("/api/recipients/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: manualEmail.trim(),
          name: manualName.trim(),
          greeting: manualGreeting.trim(),
        }),
      });
      showToast(`Đã thêm · còn ${r.rowCount} người trong danh sách.`, "ok");
      setManualEmail("");
      setManualName("");
      setManualGreeting("");
      await load();
      void onSaved();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusyManual(false);
    }
  };

  const onSubmitFile = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    setBusySubmit(true);
    try {
      const r = await fetch("/api/recipients/saved", { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? r.statusText);
      showToast(`Đã lưu ${(b as { rowCount?: number }).rowCount ?? 0} người trong danh sách.`, "ok");
      await load();
      void onSaved();
      ev.currentTarget.reset();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusySubmit(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/[0.07] bg-panel/85 p-6 shadow-soft backdrop-blur">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-accent2">
        Bước 2
      </p>
      <h2 className="font-display mt-2 text-xl font-bold text-white">Danh sách người nhận</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Thêm từng người bên dưới, <strong className="text-ink-900">hoặc</strong> tải file Excel/CSV (cột{" "}
        <strong className="text-ink-900">email</strong>, tuỳ chọn <strong className="text-ink-900">greeting</strong>{" "}
        như Anh Minh, Chị Lan).
      </p>
      <div className="mt-4 flex flex-wrap items-baseline gap-3 rounded-2xl border border-stroke/80 bg-ink-950/45 px-4 py-3">
        <p className="text-3xl font-bold tabular-nums text-white">{info?.rowCount ?? 0}</p>
        <p className="text-sm text-muted">người đã lưu</p>
        {info?.sampleEmails?.length ? (
          <p className="w-full text-[11px] text-muted/90">
            Ví dụ: {info.sampleEmails.slice(0, 4).join(" · ")}
            {(info.sampleEmails?.length ?? 0) > 4 ? "…" : ""}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={onManualAdd}
        className="mt-6 rounded-2xl border border-stroke/70 bg-ink-950/35 p-4 sm:p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Nhập tay
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="text-xs font-medium text-muted">Email *</span>
            <input
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              required
              placeholder="ten@congty.com"
              className="mt-1.5 w-full rounded-xl border border-stroke bg-ink-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-accent2/50"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-xs font-medium text-muted">Tên (tuỳ chọn)</span>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="mt-1.5 w-full rounded-xl border border-stroke bg-ink-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-accent2/50"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-xs font-medium text-muted">Xưng hô (tuỳ chọn)</span>
            <input
              type="text"
              value={manualGreeting}
              onChange={(e) => setManualGreeting(e.target.value)}
              placeholder="Anh Minh, Chị Lan…"
              className="mt-1.5 w-full rounded-xl border border-stroke bg-ink-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-accent2/50"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted/90">
          Trùng email sẽ <strong className="text-ink-900">cập nhật</strong> tên / xưng hô; mã khảo sát cũ (nếu có) được giữ.
        </p>
        <button
          type="submit"
          disabled={busyManual}
          className="mt-4 rounded-xl border border-accent/40 bg-accent/15 px-5 py-2.5 text-sm font-bold text-accent transition hover:bg-accent/25 disabled:opacity-40"
        >
          {busyManual ? "Đang thêm…" : "Thêm người này"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-stroke/80" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
          hoặc file
        </span>
        <div className="h-px flex-1 bg-stroke/80" />
      </div>

      <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmitFile}>
        <label className="text-sm text-muted">
          <span className="mb-2 block font-medium text-ink-900">Chọn file CSV</span>
          <input
            name="csv"
            type="file"
            accept=".csv,text/csv"
            required
            className="block text-sm text-ink-900 file:mr-3 file:rounded-xl file:border-0 file:bg-accent2/25 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-accent2"
          />
        </label>
        <button
          type="submit"
          disabled={busySubmit}
          className="rounded-2xl border border-accent2/35 bg-accent2/15 px-6 py-3 text-sm font-bold text-accent2 transition hover:bg-accent2/25 disabled:opacity-40"
        >
          {busySubmit ? "Đang lưu…" : "Thay bằng file này"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-stroke px-4 py-2.5 text-sm text-muted hover:text-ink-900"
        >
          Làm mới
        </button>
      </form>
    </section>
  );
}
