import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchJson } from "./api-fetch";

type AuthConfig = {
  ok: boolean;
  multiUser?: boolean;
  publicUrl?: string;
  systemMailConfigured?: boolean;
};

const RESEND_COOLDOWN_S = 45;

export function LoginPage(props: {
  onLoggedIn: () => void;
  showToast: (m: string, k: "ok" | "err") => void;
}) {
  const { onLoggedIn, showToast } = props;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);
  /** Đã gửi magic link lần gần nhất — hiển thị màn hướng dẫn kiểm tra mail */
  const [linkSent, setLinkSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);

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

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = window.setInterval(() => {
      setCooldownLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownLeft]);

  const canRequestLink =
    Boolean(cfg?.ok) && cfg?.systemMailConfigured !== false;
  const onCooldown = cooldownLeft > 0;

  const sendMagicLink = async (emRaw: string) => {
    const em = emRaw.trim().toLowerCase();
    if (!em) return;
    setBusy(true);
    try {
      await fetchJson<{ ok: boolean; message?: string }>("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      setSentToEmail(em);
      setLinkSent(true);
      setCooldownLeft(RESEND_COOLDOWN_S);
      showToast("Đã gửi liên kết — kiểm tra hộp thư (cả mục Spam).", "ok");
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    await sendMagicLink(email);
  };

  const onResend = async () => {
    if (onCooldown || busy || !canRequestLink) return;
    const em = (linkSent ? sentToEmail : email).trim().toLowerCase();
    if (!em) {
      showToast("Nhập email trước khi gửi lại.", "err");
      return;
    }
    await sendMagicLink(em);
  };

  return (
    <div className="mesh-bg min-h-full">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-10 sm:px-6 sm:py-14 lg:flex-row lg:items-stretch lg:gap-12 lg:py-16">
        {/* Cột trái — thương hiệu + giải thích */}
        <div className="mb-10 flex flex-1 flex-col justify-center lg:mb-0 lg:max-w-md lg:pr-4">
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-accent">
            Mail-count
          </p>
          <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            Đăng nhập bằng{" "}
            <span className="bg-gradient-to-r from-accent via-teal-200 to-accent2 bg-clip-text text-transparent">
              magic link
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Không cần mật khẩu trên trang này. Nhập email công ty — hệ thống gửi một liên kết bảo mật; bấm vào
            liên kết trong thư là vào được tài khoản.
          </p>
          <ol className="mt-8 space-y-3 text-sm text-muted">
            {[
              "Nhập email đăng nhập bên phải.",
              "Mở hộp thư và bấm «Đăng nhập» trong mail (hiệu lực ~15 phút).",
              "Trình duyệt lưu phiên an toàn — có thể đăng xuất bất cứ lúc nào trong app.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-snug text-ink-900">{t}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Cột phải — thẻ form */}
        <div className="flex flex-1 flex-col justify-center lg:max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-gradient-to-br from-[#1a2233]/95 via-panel to-[#121a28] p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_80px_-20px_rgba(0,0,0,0.65)] sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/12 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent2/10 blur-3xl" />

            <div className="relative">
              {cfgLoading ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <p className="text-sm text-muted">Đang tải cấu hình…</p>
                </div>
              ) : linkSent ? (
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/35 bg-emerald-500/15 text-xl text-emerald-200">
                      ✓
                    </div>
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">Đã gửi liên kết</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        Mở hộp thư <strong className="text-ink-900">{sentToEmail}</strong> và bấm vào nút đăng nhập
                        trong email. Nếu không thấy, kiểm tra thư mục <strong className="text-ink-900">Spam</strong>{" "}
                        / Quảng cáo.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stroke/80 bg-ink-950/50 px-4 py-3 text-[11px] leading-relaxed text-muted">
                    Liên kết chỉ dùng một lần và sẽ hết hạn sau vài phút. Sau khi đăng nhập, trang khảo sát mở tự
                    động.
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void onResend()}
                      disabled={busy || !canRequestLink || onCooldown}
                      className="rounded-2xl border border-accent2/40 bg-accent2/15 px-6 py-3 text-sm font-bold text-accent2 transition hover:bg-accent2/25 disabled:opacity-40"
                    >
                      {busy
                        ? "Đang gửi…"
                        : onCooldown
                          ? `Gửi lại sau ${cooldownLeft}s`
                          : "Gửi lại liên kết"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkSent(false);
                        setEmail(sentToEmail);
                        setCooldownLeft(0);
                      }}
                      className="text-sm font-semibold text-muted underline-offset-2 hover:text-ink-900 hover:underline"
                    >
                      Đổi email khác
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-white">Bắt đầu</h2>
                  <p className="mt-2 text-sm text-muted">
                    Dùng email mà anh/chị dùng làm tài khoản trên hệ thống này.
                  </p>

                  {cfg && cfg.multiUser && cfg.systemMailConfigured === false ? (
                    <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                      Máy chủ chưa cấu hình SMTP gửi mail hệ thống. Admin cần đặt{" "}
                      <code className="rounded bg-ink-950/80 px-1.5 py-0.5 text-ink-900">SMTP_USER</code> và{" "}
                      <code className="rounded bg-ink-950/80 px-1.5 py-0.5 text-ink-900">SMTP_PASS</code> trên server
                      thì mới gửi được magic link.
                    </div>
                  ) : null}

                  <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-5">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Email đăng nhập
                      </span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="ten@congty.com"
                        className="mt-2 w-full rounded-2xl border border-stroke/90 bg-ink-950/80 px-4 py-3.5 text-base text-white outline-none ring-0 transition placeholder:text-muted/45 focus:border-accent/55 focus:ring-2 focus:ring-accent/15"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy || !canRequestLink}
                      className="w-full rounded-2xl bg-gradient-to-r from-accent via-teal-300 to-accent2 py-4 text-sm font-black text-ink-950 shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:opacity-40"
                    >
                      {busy ? "Đang gửi liên kết…" : "Gửi magic link tới email"}
                    </button>
                  </form>
                </>
              )}

              {!cfgLoading && cfg?.publicUrl ? (
                <p className="relative mt-8 border-t border-white/[0.06] pt-6 text-[10px] leading-relaxed text-muted/75">
                  URL ứng dụng dùng trong liên kết:{" "}
                  <span className="font-mono text-muted/90">{cfg.publicUrl}</span>
                </p>
              ) : null}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted/80">
            Gặp sự cố?{" "}
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
