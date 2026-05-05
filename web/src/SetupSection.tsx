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

  const onSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
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
        Tải file Excel/CSV đã xuất ra — cần cột <strong className="text-ink-900">email</strong>. Cột{" "}
        <strong className="text-ink-900">greeting</strong> (vd: Anh Minh, Chị Lan) để mỗi mail xưng
        hô đúng người.
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
      <form className="mt-5 flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
        <label className="text-sm text-muted">
          <span className="mb-2 block font-medium text-ink-900">Chọn file</span>
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
          {busySubmit ? "Đang lưu…" : "Lưu danh sách"}
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
