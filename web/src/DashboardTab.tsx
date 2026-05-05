import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "./api-fetch";

type LeaderboardEntry = {
  email: string;
  name: string;
  label: string;
};

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
  fastestReplies?: LeaderboardEntry[];
  richestReplies?: LeaderboardEntry[];
};

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
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
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted">
        …
      </div>
    );
  }
  if (!d) return null;

  const maxBar = Math.max(
    1,
    ...d.timeline.map((t) => Math.max(t.sent, t.replies)),
  );

  const corrLabels: Record<string, string> = {
    "message-id": "Luồng mail",
    "subject-code": "Mã tiêu đề",
    "manual-unknown": "Tay",
  };

  const fast = d.fastestReplies ?? [];
  const rich = d.richestReplies ?? [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <BigStat label="Gửi" value={d.totals.sent} tone="cyan" />
        <BigStat label="Trả lời" value={d.totals.repliesMatchedOnCampaign} tone="violet" />
        <BigStat label="Chờ" value={d.totals.pending} tone="amber" />
        <BigStat label="%" value={`${d.totals.responseRatePct}%`} tone="emerald" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-panel/85 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Nhanh nhất</p>
          <ul className="mt-2 space-y-2">
            {fast.length === 0 ? (
              <li className="text-xs text-muted">—</li>
            ) : (
              fast.map((x) => (
                <li key={x.email} className="text-xs">
                  <span className="font-semibold text-white">{x.label}</span>
                  <span className="mt-0.5 block truncate text-muted">{x.email}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-panel/85 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Nhiều nội dung</p>
          <ul className="mt-2 space-y-2">
            {rich.length === 0 ? (
              <li className="text-xs text-muted">—</li>
            ) : (
              rich.map((x) => (
                <li key={x.email} className="text-xs">
                  <span className="font-semibold text-accent2">{x.label}</span>
                  <span className="mt-0.5 block truncate text-muted">{x.email}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-panel/80 p-4">
        <p className="text-[10px] font-bold uppercase text-muted">14 ngày</p>
        <div className="mt-3 flex h-40 items-end gap-0.5 overflow-x-auto pb-1">
          {d.timeline.map((t) => {
            const sh = (t.sent / maxBar) * 100;
            const rh = (t.replies / maxBar) * 100;
            return (
              <div key={t.date} className="flex min-w-[14px] flex-1 flex-col items-center justify-end">
                <div className="flex h-full w-full max-w-[18px] items-end justify-center gap-px">
                  <div
                    className="w-[42%] rounded-t bg-accent/90"
                    style={{
                      height: `${Math.max(sh, t.sent ? 8 : 0)}%`,
                      minHeight: t.sent ? 3 : 0,
                    }}
                  />
                  <div
                    className="w-[42%] rounded-t bg-accent2/85"
                    style={{
                      height: `${Math.max(rh, t.replies ? 8 : 0)}%`,
                      minHeight: t.replies ? 3 : 0,
                    }}
                  />
                </div>
                <span className="mt-1 text-[8px] text-muted">{t.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.06] bg-ink-950/40 p-4">
          <p className="text-[10px] font-bold uppercase text-muted">Ghép</p>
          <ul className="mt-2 space-y-1.5">
            {Object.entries(d.correlation).map(([k, n]) => (
              <li key={k} className="flex justify-between text-xs">
                <span className="text-muted">{corrLabels[k] ?? k}</span>
                <span className="font-bold text-white">{n}</span>
              </li>
            ))}
            {Object.keys(d.correlation).length === 0 && (
              <li className="text-xs text-muted">—</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-ink-950/40 p-4 text-xs text-muted">
          <p>
            Quét: <span className="text-ink-900">{d.totals.polledMessages}</span>
          </p>
          <p className="mt-1">
            Đính kèm: <span className="text-ink-900">{d.repliesWithAttachments}</span>
          </p>
          <p className="mt-1 font-mono text-[10px]">
            Gửi {formatTs(d.lastSentAt)}
            <br />
            TL {formatTs(d.lastReplyAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "cyan" | "violet" | "amber" | "emerald";
}) {
  const ring = {
    cyan: "border-accent/25",
    violet: "border-accent2/25",
    amber: "border-amber-400/25",
    emerald: "border-emerald-400/25",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-ink-950/50 p-3 ${ring}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}
