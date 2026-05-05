import { useCallback, useEffect, useState } from "react";
import { fetchJson as fj } from "./api-fetch";

type AccountGet = {
  ok: boolean;
  configured?: boolean;
  preset?: string;
  tagline?: string;
  emailMasked?: string;
  workEmail?: string;
};

export function SimpleAccount(props: {
  onSaved: () => void | Promise<void>;
  showToast: (m: string, k: "ok" | "err") => void;
  /** Giao diện gọn trong layout mobile-first */
  variant?: "default" | "compact";
}) {
  const { onSaved, showToast, variant = "default" } = props;
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [info, setInfo] = useState<AccountGet | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await fj<AccountGet>("/api/account");
      setInfo(d);
      if (d.workEmail) setEmail(d.workEmail);
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await fj<{ ok: boolean }>("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      showToast(
        "Đã lưu và xác thực SMTP với Microsoft 365 — có thể gửi khảo sát và Poll.",
        "ok",
      );
      setPassword("");
      await load();
      void onSaved();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  const testMicrosoftSmtp = async () => {
    if (!info?.configured) {
      showToast("Anh chị lưu email + mật khẩu mailbox trước.", "err");
      return;
    }
    setTesting(true);
    try {
      const r = await fj<{ ok: boolean; message?: string }>(
        "/api/me/mailbox/test-connection",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      showToast(r.message ?? "SMTP Microsoft: kết nối OK.", "ok");
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setTesting(false);
    }
  };

  const inner = (
    <div className="relative">
      {variant === "default" ? (
        <>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Bước 1
          </p>
          <h2 className="font-display mt-2 text-2xl font-bold tracking-tight text-white">
            Kết nối email công việc
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {info?.tagline ??
              "Chỉ cần email và mật khẩu — hệ thống tự dùng cấu hình Microsoft 365 an toàn."}
          </p>
        </>
      ) : null}

      {variant === "default" &&
        (info?.configured ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Đã kết nối · {info.emailMasked}
          </div>
        ) : (
          <div className="mt-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-100">
            Chưa kết nối — điền bên dưới để bắt đầu
          </div>
        ))}

      <form
        className={variant === "compact" ? "mt-3 grid gap-2 sm:grid-cols-2" : "mt-8 grid gap-5 sm:grid-cols-2"}
        onSubmit={onSubmit}
      >
        <label className="block sm:col-span-1">
          <span className="text-[10px] font-medium uppercase text-muted">Email gửi</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ten@congty.com"
            required
            className={
              variant === "compact"
                ? "mt-1 w-full rounded-xl border border-stroke/90 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                : "mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3.5 text-base text-white outline-none ring-0 transition placeholder:text-muted/50 focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            }
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="text-[10px] font-medium uppercase text-muted">Mật khẩu</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={info?.configured ? "Đổi thì nhập" : "Bắt buộc"}
            className={
              variant === "compact"
                ? "mt-1 w-full rounded-xl border border-stroke/90 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none focus:border-accent2/50"
                : "mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3.5 text-base text-white outline-none transition placeholder:text-muted/50 focus:border-accent2/50 focus:ring-2 focus:ring-accent2/15"
            }
          />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || testing}
            className={
              variant === "compact"
                ? "rounded-xl bg-gradient-to-r from-accent to-teal-400 px-5 py-2 text-sm font-bold text-ink-950 disabled:opacity-40"
                : "rounded-2xl bg-gradient-to-r from-accent to-teal-400 px-8 py-3.5 text-sm font-bold text-ink-950 shadow-lg shadow-accent/25 transition hover:brightness-110 disabled:opacity-40"
            }
          >
            {busy ? "…" : "Lưu"}
          </button>
          <button
            type="button"
            disabled={busy || testing || !info?.configured}
            onClick={() => void testMicrosoftSmtp()}
            className={
              variant === "compact"
                ? "rounded-xl border border-white/15 bg-ink-900/70 px-4 py-2 text-xs font-bold text-muted hover:text-ink-900 disabled:opacity-35"
                : "rounded-2xl border border-white/15 bg-ink-900/70 px-6 py-3 text-sm font-bold text-muted hover:text-ink-900 disabled:opacity-35"
            }
          >
            {testing ? "…" : "Thử SMTP (Microsoft)"}
          </button>
          {variant === "default" ? (
            <p className="text-[11px] leading-snug text-muted/90">
              Dùng tài khoản Microsoft 365 công ty. Nếu bật xác thực hai lớp, tạo{" "}
              <span className="text-ink-900">mã ứng dụng</span> trong tài khoản Microsoft.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );

  if (variant === "compact") {
    return (
      <details className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#1a2233]/90 via-panel to-[#121a28] p-4 shadow-soft">
        <summary className="cursor-pointer list-none text-sm font-semibold text-muted marker:hidden [&::-webkit-details-marker]:hidden">
          Mail gửi khảo sát (Microsoft 365) · {info?.configured ? "đã nối" : "chưa cấu hình"}
        </summary>
        <div className="mt-3 border-t border-stroke/40 pt-3">{inner}</div>
      </details>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#1a2233]/95 via-panel to-[#121a28] p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_80px_-20px_rgba(0,0,0,0.65)]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-accent2/12 blur-3xl" />
      {inner}
    </section>
  );
}
