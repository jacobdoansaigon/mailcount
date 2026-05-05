import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { LoginPage } from "./LoginPage";
import { fetchJson } from "./api-fetch";

type AuthConfig = {
  ok: boolean;
  multiUser?: boolean;
};

type Gate = "loading" | "legacy" | "login" | "app";

export function AppRoot() {
  const [gate, setGate] = useState<Gate>("loading");
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(
    null,
  );

  const showToast = useCallback((msg: string, kind: "ok" | "err") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5200);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetchJson<AuthConfig>("/api/auth/config");
        if (!cfg.multiUser) {
          setGate("legacy");
          return;
        }
        try {
          await fetchJson<{ ok: boolean }>("/api/me");
          setGate("app");
        } catch {
          setGate("login");
        }
      } catch (e) {
        showToast(String(e instanceof Error ? e.message : e), "err");
        setGate("legacy");
      }
    })();
  }, [showToast]);

  const onLoggedIn = useCallback(() => setGate("app"), []);

  const onLogout = useCallback(async () => {
    try {
      await fetchJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      /* vẫn chuyển về login */
    }
    setGate("login");
  }, []);

  if (gate === "loading") {
    return (
      <div className="mesh-bg flex min-h-full flex-col items-center justify-center gap-4 px-4">
        <div className="h-11 w-11 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
        <p className="text-sm text-muted">Đang tải…</p>
      </div>
    );
  }

  if (gate === "legacy") {
    return (
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    );
  }

  /** Chế độ multi-user: có URL /login và / */
  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            gate === "login" ? (
              <LoginPage onLoggedIn={onLoggedIn} showToast={showToast} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/"
          element={
            gate === "app" ? (
              <App sessionAuth onLogout={onLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {gate === "login" ? <Toast msg={toast?.msg ?? null} kind={toast?.kind ?? "ok"} /> : null}
    </>
  );
}

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
      className={`fixed bottom-6 right-6 z-50 max-w-lg rounded-2xl border px-5 py-3.5 text-sm shadow-2xl ${cls}`}
    >
      {msg}
    </div>
  );
}
