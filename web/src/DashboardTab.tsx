import { useCallback, useEffect, useState } from "react";

type DashboardPayload = {
  ok: boolean;
  totals: {
    sent: number;
    repliesMatchedOnCampaign: number;
    pending: number;
    polledMessages: number;
    responseRatePct: number;
  };
  timeline: { date: string; sent: number; replies: number }[];
  correlation: Record<string, number>;
  repliesWithAttachments: number;
  lastSentAt: string | null;
  lastReplyAt: string | null;
};

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? r.statusText);
  return data as T;
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

export function DashboardTab(props: {
  showToast: (m: string, k: "ok" | "err") => void;
  refreshKey: number;
}) {
  const { showToast, refreshKey } = props;
  const [d, setD] = useState<DashboardPayload | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const x = await fetchJson<DashboardPayload>("/api/dashboard");
      setD(x);
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (busy && !d) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted">
        Đang tải số liệu…
      </div>
    );
  }
  if (!d) return null;

  const maxBar = Math.max(
    1,
    ...d.timeline.map((t) => Math.max(t.sent, t.replies)),
  );

  const corrLabels: Record<string, string> = {
    "message-id": "Theo luồng mail",
    "subject-code": "Theo mã trong tiêu đề",
    "manual-unknown": "Cần xem tay",
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat
          label="Đã gửi"
          value={d.totals.sent}
          sub="Theo nhật ký gửi"
          tone="cyan"
        />
        <BigStat
          label="Đã có phản hồi"
          value={d.totals.repliesMatchedOnCampaign}
          sub="Khớp với danh sách đã gửi"
          tone="violet"
        />
        <BigStat
          label="Chưa trả lời"
          value={d.totals.pending}
          sub="Ước tính"
          tone="amber"
        />
        <BigStat
          label="Tỷ lệ phản hồi"
          value={`${d.totals.responseRatePct}%`}
          sub="Trên tổng đã gửi"
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-3xl border border-white/[0.06] bg-panel/80 p-6 shadow-soft backdrop-blur">
          <h3 className="font-display text-lg font-semibold text-white">
            Hoạt động 14 ngày gần đây
          </h3>
          <p className="mt-1 text-xs text-muted">
            Mỗi ngày hai cột:{" "}
            <span className="text-accent">■</span> đã gửi ·{" "}
            <span className="text-accent2">■</span> phản hồi đã import
          </p>
          <div className="mt-6 flex h-48 items-end gap-1 sm:gap-1.5">
            {d.timeline.map((t) => {
              const sh = (t.sent / maxBar) * 100;
              const rh = (t.replies / maxBar) * 100;
              return (
                <div
                  key={t.date}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${t.date}: gửi ${t.sent}, phản hồi ${t.replies}`}
                >
                  <div className="flex h-full w-full max-w-[22px] items-end justify-center gap-0.5 sm:max-w-[28px]">
                    <div
                      className="w-[45%] max-w-[10px] rounded-t-md bg-accent/90 transition-all"
                      style={{
                        height: `${Math.max(sh, t.sent ? 6 : 0)}%`,
                        minHeight: t.sent ? 4 : 0,
                      }}
                    />
                    <div
                      className="w-[45%] max-w-[10px] rounded-t-md bg-accent2/85 transition-all"
                      style={{
                        height: `${Math.max(rh, t.replies ? 6 : 0)}%`,
                        minHeight: t.replies ? 4 : 0,
                      }}
                    />
                  </div>
                  <span className="mt-1 max-w-full truncate text-[9px] text-muted sm:text-[10px]">
                    {t.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="rounded-3xl border border-white/[0.06] bg-panel/80 p-6 shadow-soft backdrop-blur">
            <h3 className="font-display text-lg font-semibold text-white">
              Cách ghép phản hồi
            </h3>
            <ul className="mt-4 space-y-3 text-sm">
              {Object.entries(d.correlation).map(([k, n]) => (
                <li
                  key={k}
                  className="flex items-center justify-between gap-3 rounded-xl bg-ink-950/50 px-3 py-2.5"
                >
                  <span className="text-muted">{corrLabels[k] ?? k}</span>
                  <span className="font-display text-lg font-semibold tabular-nums text-white">
                    {n}
                  </span>
                </li>
              ))}
              {Object.keys(d.correlation).length === 0 && (
                <li className="text-sm text-muted">Chưa có dữ liệu import.</li>
              )}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-br from-accent/8 to-transparent p-6">
            <h3 className="font-display text-sm font-semibold text-white">Chi tiết nhanh</h3>
            <dl className="mt-3 space-y-2 text-xs text-muted">
              <div className="flex justify-between gap-4">
                <dt>Mail đã quét trong inbox</dt>
                <dd className="font-medium text-ink-900">{d.totals.polledMessages}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Phản hồi có file đính kèm</dt>
                <dd className="font-medium text-ink-900">{d.repliesWithAttachments}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Lần gửi gần nhất</dt>
                <dd className="text-right font-mono text-[11px] text-ink-900">
                  {formatTs(d.lastSentAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Phản hồi mới nhất</dt>
                <dd className="text-right font-mono text-[11px] text-ink-900">
                  {formatTs(d.lastReplyAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub: string;
  tone: "cyan" | "violet" | "amber" | "emerald";
}) {
  const ring = {
    cyan: "from-accent/25 to-transparent border-accent/20",
    violet: "from-accent2/25 to-transparent border-accent2/20",
    amber: "from-amber-400/20 to-transparent border-amber-400/25",
    emerald: "from-emerald-400/22 to-transparent border-emerald-400/25",
  }[tone];
  return (
    <div
      className={`rounded-3xl border bg-gradient-to-b p-5 shadow-soft ${ring}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="font-display mt-2 text-4xl font-bold tabular-nums tracking-tight text-white">
        {value}
      </p>
      <p className="mt-2 text-[11px] text-muted/85">{sub}</p>
    </div>
  );
}
