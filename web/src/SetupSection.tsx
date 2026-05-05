import { useCallback, useEffect, useState } from "react";

type SetupPayload = {
  ok: boolean;
  envPath: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: string;
  smtp_user: string;
  smtp_pass_set: boolean;
  imap_host: string;
  imap_port: string;
  imap_tls: string;
  imap_user: string;
  imap_pass_set: boolean;
  use_shared_imap: boolean;
  send_delay_ms: string;
  configured?: boolean;
};

async function fj<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? r.statusText);
  return body as T;
}

export function AccountSetup(props: {
  onSaved: () => void | Promise<void>;
  showToast: (m: string, k: "ok" | "err") => void;
}) {
  const { onSaved, showToast } = props;
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<SetupPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fj<SetupPayload>("/api/setup");
      setS(d);
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
    const obj: Record<string, string | boolean | undefined> = {};
    fd.forEach((v, k) => {
      if (
        k === "smtp_secure" ||
        k === "imap_tls" ||
        k === "use_shared_imap"
      )
        return;
      obj[k] = typeof v === "string" ? v : String(v);
    });
    obj.use_shared_imap = fd.has("use_shared_imap");
    obj.smtp_secure = fd.has("smtp_secure");
    obj.imap_tls = fd.has("imap_tls");

    setBusy(true);
    try {
      await fj<{ ok: boolean }>("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(obj),
      });
      showToast("Đã lưu vào file .env (chỉ trên máy anh).", "ok");
      await load();
      void onSaved();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-accent/25 bg-panel/92 p-6 shadow-soft">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Bước 1 · Tài khoản
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-900">
            Cấu hình SMTP / IMAP
          </h2>
          <p className="mt-1 text-xs text-muted">
            Ghi vào <code className="text-ink-900">{s?.envPath ?? ".env"}</code>.
            Không đồng bộ lên mạng. Để trống ô mật khẩu = giữ nguyên trong file.
          </p>
        </div>
        <span className="text-sm text-accent">{open ? "Ẩn" : "Hiện"}</span>
      </button>

      {open && s && (
        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-3 rounded-xl border border-stroke bg-ink-950/35 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              SMTP · gửi
            </h3>
            <label className="block text-xs text-muted">
              Host
              <input
                name="smtp_host"
                defaultValue={s.smtp_host}
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                Cổng
                <input
                  name="smtp_port"
                  defaultValue={s.smtp_port}
                  className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
                />
              </label>
              <label className="mt-5 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  name="smtp_secure"
                  defaultChecked={s.smtp_secure === "true"}
                  className="rounded border-stroke"
                />
                SMTP_SECURE
              </label>
            </div>
            <label className="block text-xs text-muted">
              Email đăng nhập
              <input
                name="smtp_user"
                defaultValue={s.smtp_user}
                required
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
            <label className="block text-xs text-muted">
              Mật khẩu / app password
              <input
                name="smtp_pass"
                type="password"
                autoComplete="off"
                placeholder={s.smtp_pass_set ? "•••• (để trống nếu giữ)" : ""}
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-stroke bg-ink-950/35 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              IMAP · đọc phản hồi
            </h3>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                name="use_shared_imap"
                defaultChecked={s.use_shared_imap}
                className="rounded border-stroke"
              />
              Dùng chung tài khoản với SMTP (khuyến nghị)
            </label>
            <label className="block text-xs text-muted">
              Host
              <input
                name="imap_host"
                defaultValue={s.imap_host}
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                Cổng
                <input
                  name="imap_port"
                  defaultValue={s.imap_port}
                  className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
                />
              </label>
              <label className="mt-5 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  name="imap_tls"
                  defaultChecked={s.imap_tls === "true"}
                  className="rounded border-stroke"
                />
                TLS
              </label>
            </div>
            <label className="block text-xs text-muted">
              IMAP user (nếu khác SMTP)
              <input
                name="imap_user"
                defaultValue={s.imap_user}
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
            <label className="block text-xs text-muted">
              IMAP password
              <input
                name="imap_pass"
                type="password"
                autoComplete="off"
                placeholder={s.imap_pass_set ? "•••• (để trống nếu giữ)" : ""}
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
            <label className="block text-xs text-muted">
              SEND_DELAY_MS (ms giữa mỗi mail)
              <input
                name="send_delay_ms"
                defaultValue={s.send_delay_ms}
                className="mt-1 w-full rounded-lg border border-stroke bg-panel px-2 py-1.5 text-sm text-ink-900"
              />
            </label>
          </div>

          <div className="lg:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-accent to-accent2 px-5 py-2 text-sm font-semibold text-ink-950 shadow-soft disabled:opacity-40"
            >
              Lưu cấu hình (.env)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-xl border border-stroke px-4 py-2 text-sm font-medium text-ink-900 disabled:opacity-40"
            >
              Tải lại từ đĩa
            </button>
            {!s.configured ? (
              <span className="self-center text-xs text-amber-300">
                Cảnh báo: Chưa có SMTP_USER hoặc SMTP_PASS — anh cần Lưu cấu hình phía trên trước khi gửi/poll mail.
              </span>
            ) : (
              <span className="self-center text-xs text-accent">
                Đã đủ SMTP để gửi và IMAP fallback mật khẩu SMTP.
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

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
      showToast(`Đã lưu ${(b as { rowCount?: number }).rowCount ?? 0} địa chỉ.`, "ok");
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
    <section className="rounded-2xl border border-accent2/30 bg-panel/92 p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent2">
        Danh sách email
      </p>
      <h2 className="mt-1 text-lg font-semibold text-ink-900">
        Lưu file CSV để tái dùng
      </h2>
      <p className="mt-1 text-xs text-muted">
        Sau khi lưu, anh có thể tick «Dùng danh sách đã lưu» trong form gửi — không phải chọn file CSV mỗi lần.
      </p>
      <div className="mt-3 rounded-lg border border-stroke bg-ink-950/35 p-3 font-mono text-[11px] text-muted">
        <p>Tệp máy chủ:</p>
        <p className="break-all text-ink-900">{info?.path ?? "…"}</p>
        <p className="mt-2">
          Hàng hiệu lực:{" "}
          <span className="text-accent2">{info?.rowCount ?? 0}</span>
        </p>
        {info?.sampleEmails?.length ? (
          <p className="mt-1 truncate text-muted">
            Mẫu: {info.sampleEmails.join(", ")}
          </p>
        ) : null}
      </div>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
        <label className="text-xs text-muted">
          CSV
          <input
            name="csv"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 block text-xs text-ink-900 file:mr-2 file:rounded file:border-0 file:bg-accent2/22 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-accent2"
          />
        </label>
        <button
          type="submit"
          disabled={busySubmit}
          className="rounded-lg border border-accent2/35 bg-accent2/15 px-4 py-2 text-sm font-semibold text-accent2 disabled:opacity-40"
        >
          Lưu danh sách lên máy
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-stroke px-3 py-2 text-xs text-ink-900"
        >
          Làm mới
        </button>
      </form>
    </section>
  );
}
