import { useCallback, useEffect, useState } from "react";
import { CampaignWorkspace } from "./CampaignWorkspace";
import { DashboardTab } from "./DashboardTab";
import { fetchJson } from "./api-fetch";

type ApiStatus = {
  configured?: boolean;
  envSamplePath?: string;
  smtp: { host: string; port: number; secure: boolean; userMasked: string };
  imap: { host: string; port: number; tls: boolean; userMasked: string };
  paths: {
    outboundLogPath: string;
    repliesDir: string;
    repliesIndexPath: string;
  };
  attachmentCountDisk: number;
  sendDelayMs: number;
};

function Toast({
  msg,
  kind,
}: {
  msg: string | null;
  kind: "ok" | "err";
}) {
  if (!msg) return null;
  const cls =
    kind === "ok"
      ? "border-accent/35 bg-accent/11 text-accent"
      : "border-red-400/35 bg-red-950/55 text-red-300";
  return (
    <div
      className={`fixed bottom-20 right-4 z-50 max-w-lg rounded-2xl border px-4 py-3 text-sm shadow-2xl sm:bottom-6 sm:right-6 ${cls}`}
    >
      {msg}
    </div>
  );
}

type TabId = "campaign" | "dashboard";

export function App(props?: {
  sessionAuth?: boolean;
  onLogout?: () => void | Promise<void>;
}) {
  const sessionAuth = props?.sessionAuth ?? false;
  const onLogout = props?.onLogout;
  const [tab, setTab] = useState<TabId>("campaign");
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [dashRefresh, setDashRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(
    null,
  );

  const [subject, setSubject] = useState("Khảo sát [{{code}}]");
  const [body, setBody] = useState(
    "Chào {{greetingOrName}},\n\nTrả lời trực tiếp email này.\n\n{{title}}",
  );
  const [limit, setLimit] = useState("");
  const [pollSince, setPollSince] = useState("");

  const showToast = useCallback((msg: string, kind: "ok" | "err") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5200);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const s = await fetchJson<
        {
          configured?: boolean;
          envSamplePath?: string;
        } & Partial<ApiStatus>
      >("/api/status");
      setStatus({
        configured: s.configured ?? false,
        envSamplePath: s.envSamplePath,
        smtp: s.smtp!,
        imap: s.imap!,
        paths: s.paths!,
        attachmentCountDisk: s.attachmentCountDisk ?? 0,
        sendDelayMs: s.sendDelayMs ?? 0,
      });
      setDashRefresh((k) => k + 1);
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), "err");
    }
  }, [showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const ready = Boolean(status?.configured);

  return (
    <div className="mesh-bg min-h-full pb-20 sm:pb-10">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/85 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="font-display text-sm font-bold tracking-wide text-accent">
            Mail-count
          </span>
          <nav className="hidden gap-1 rounded-xl border border-white/[0.08] bg-ink-950/70 p-1 sm:flex">
            {(
              [
                ["campaign", "Gửi"],
                ["dashboard", "Số liệu"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  tab === id
                    ? "bg-accent text-ink-950"
                    : "text-muted hover:text-ink-900"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {sessionAuth && onLogout ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-lg border border-stroke/80 px-3 py-1.5 text-[11px] font-semibold text-muted hover:text-ink-900"
            >
              Thoát
            </button>
          ) : (
            <span className="w-12 sm:w-0" />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
        {tab === "dashboard" ? (
          <DashboardTab showToast={showToast} refreshKey={dashRefresh} />
        ) : (
          <CampaignWorkspace
            ready={ready}
            busy={busy}
            setBusy={setBusy}
            showToast={showToast}
            loadAll={loadAll}
            refreshKey={dashRefresh}
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            limit={limit}
            setLimit={setLimit}
            pollSince={pollSince}
            setPollSince={setPollSince}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-stroke/80 bg-ink-950/95 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
        <div className="mx-auto flex w-full max-w-md">
          {(
            [
              ["campaign", "Gửi"],
              ["dashboard", "Số liệu"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 py-3 text-center text-sm font-bold ${
                tab === id ? "text-accent" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <Toast msg={toast?.msg ?? null} kind={toast?.kind ?? "ok"} />
    </div>
  );
}
