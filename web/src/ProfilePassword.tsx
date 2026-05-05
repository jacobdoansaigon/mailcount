import { useState, type FormEvent } from "react";
import { fetchJson } from "./api-fetch";

export function ProfilePassword(props: {
  showToast: (m: string, k: "ok" | "err") => void;
  variant?: "default" | "compact";
}) {
  const { showToast, variant = "default" } = props;
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (next !== again) {
      showToast("Mật khẩu mới nhập lại không khớp.", "err");
      return;
    }
    setBusy(true);
    try {
      await fetchJson<{ ok: boolean }>("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      showToast("Đã đổi mật khẩu đăng nhập.", "ok");
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form
      className={
        variant === "compact"
          ? "mt-3 grid gap-2 sm:grid-cols-2"
          : "mt-6 grid gap-4 sm:grid-cols-2"
      }
      onSubmit={(e) => void onSubmit(e)}
    >
      <label className="block sm:col-span-2">
        <span className="text-[10px] font-medium uppercase text-muted">
          Mật khẩu hiện tại
        </span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={
            variant === "compact"
              ? "mt-1 w-full rounded-xl border border-stroke/90 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
              : "mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3 text-base text-white outline-none focus:border-accent/50"
          }
        />
      </label>
      <label className="block sm:col-span-1">
        <span className="text-[10px] font-medium uppercase text-muted">
          Mật khẩu mới
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={8}
          required
          className={
            variant === "compact"
              ? "mt-1 w-full rounded-xl border border-stroke/90 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none focus:border-accent2/50"
              : "mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3 text-base text-white outline-none focus:border-accent2/50"
          }
        />
      </label>
      <label className="block sm:col-span-1">
        <span className="text-[10px] font-medium uppercase text-muted">
          Nhập lại mới
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          minLength={8}
          required
          className={
            variant === "compact"
              ? "mt-1 w-full rounded-xl border border-stroke/90 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none focus:border-accent2/50"
              : "mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3 text-base text-white outline-none focus:border-accent2/50"
          }
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className={
            variant === "compact"
              ? "rounded-xl border border-white/10 bg-ink-900/80 px-5 py-2 text-sm font-bold text-white hover:bg-ink-900 disabled:opacity-40"
              : "rounded-2xl border border-white/10 bg-ink-900/80 px-8 py-3 text-sm font-bold text-white hover:bg-ink-900 disabled:opacity-40"
          }
        >
          {busy ? "…" : "Đổi mật khẩu đăng nhập"}
        </button>
      </div>
    </form>
  );

  if (variant === "compact") {
    return (
      <details className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#1a2233]/90 via-panel to-[#121a28] p-4 shadow-soft">
        <summary className="cursor-pointer list-none text-sm font-semibold text-muted marker:hidden [&::-webkit-details-marker]:hidden">
          Mật khẩu đăng nhập web
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-muted/90">
          Khác với mật khẩu mailbox Microsoft dùng để gửi mail khảo sát bên dưới.
        </p>
        {form}
      </details>
    );
  }

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#1a2233]/95 via-panel to-[#121a28] p-8 shadow-soft">
      <h2 className="font-display text-lg font-bold text-white">Đổi mật khẩu đăng nhập</h2>
      <p className="mt-2 text-sm text-muted">
        Mật khẩu để vào trang này — riêng với email/mật khẩu Microsoft để gửi khảo sát.
      </p>
      {form}
    </section>
  );
}
