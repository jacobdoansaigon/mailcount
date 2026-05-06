import net from "node:net";

/** Thử mở TCP IPv4 tới host:port — không phải SMTP; phát hiện firewall chặn cổng. */
export function probeTcpPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host, port, family: 4 });

    const timer = setTimeout(() => {
      try {
        socket.destroy();
      } catch {
        /* */
      }
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: "timeout" });
      }
    }, timeoutMs);

    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* */
      }
      resolve(ok ? { ok: true } : { ok: false, error });
    };

    socket.once("connect", () => finish(true));
    socket.once("error", (err) =>
      finish(false, String((err as Error).message || err)),
    );
  });
}
