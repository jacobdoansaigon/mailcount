import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchJson } from "./api-fetch";

type AuthConfig = {
  ok: boolean;
  multiUser?: boolean;
  publicUrl?: string;
  authMode?: string;
};

export function LoginPage(props: {
  onLoggedIn: () => void;
  showToast: (m: string, k: "ok" | "err") => void;
}) {
  const { onLoggedIn, showToast } = props;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);

  const loadCfg = useCallback(async () => {
    setCfgLoading(true);
    try {
      const c = await fetchJson<AuthConfig>("/api/auth/config");
      setCfg(c);
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setCfgLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCfg();
  }, [loadCfg]);

  useEffect(() => {
    (async () => {
      try {
        await fetchJson<{ ok: boolean }>("/api/me");
        onLoggedIn();
      } catch {
        /* chưa đăng nhập */
      }
    })();
  }, [onLoggedIn]);

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !password) return;
    setBusy(true);
    try {
      await fetchJson<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, password }),
      });
      onLoggedIn();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mesh-bg min-h-full">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-10 sm:px-6 sm:py-14 lg:flex-row lg:items-stretch lg:gap-12 lg:py-16">
        <div className="mb-10 flex flex-1 flex-col justify-center lg:mb-0 lg:max-w-md lg:pr-4">
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-accent">
            Mail-count
          </p>
          <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            Đăng nhập{" "}
            <span className="bg-gradient-to-r from-accent via-teal-200 to-accent2 bg-clip-text text-transparent">
              email &amp; mật khẩu
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Dùng tài khoản được cấp. Sau khi vào, anh/chị cấu hình mailbox Microsoft trong mục Hồ sơ để gửi mail khảo sát.
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center lg:max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-gradient-to-br from-[#1a2233]/95 via-panel to-[#121a28] p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_80px_-20px_rgba(0,0,0,0.65)] sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/12 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent2/10 blur-3xl" />

            <div className="relative">
              {cfgLoading ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <p className="text-sm text-muted">Đang tải…</p>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-white">Đăng nhập</h2>
                  <p className="mt-2 text-sm text-muted">
                    {cfg?.authMode === "password"
                      ? "Nhập email tài khoản và mật khẩu."
                      : "Nhập thông tin đăng nhập."}
                  </p>

                  <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-5">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Email
                      </span>
                      <input
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="ten@congty.com"
                        className="mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3.5 text-base text-white outline-none ring-0 transition placeholder:text-muted/45 focus:border-accent/55 focus:ring-2 focus:ring-accent/15"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Mật khẩu
                      </span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3.5 text-base text-white outline-none transition focus:border-accent2/50 focus:ring-2 focus:ring-accent2/15"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-2xl bg-gradient-to-r from-accent via-teal-300 to-accent2 py-4 text-sm font-black text-ink-950 shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:opacity-40"
                    >
                      {busy ? "Đang đăng nhập…" : "Đăng nhập"}
                    </button>
                  </form>
                </>
              )}

              {!cfgLoading && cfg?.publicUrl ? (
                <p className="relative mt-8 border-t border-white/[0.06] pt-6 text-[10px] leading-relaxed text-muted/75">
                  URL ứng dụng:{" "}
                  <span className="font-mono text-muted/90">{cfg.publicUrl}</span>
                </p>
              ) : null}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted/80">
            <a
              href="/login"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              Tải lại trang đăng nhập
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
