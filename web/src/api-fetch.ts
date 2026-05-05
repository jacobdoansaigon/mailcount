/** Gọi API cùng origin (Vite proxy / production static) — gửi cookie phiên đăng nhập. */
const withCreds = (init?: RequestInit): RequestInit => ({
  credentials: "include",
  ...init,
});

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, withCreds(init));
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Hết thời gian chờ máy chủ — thử lại sau.");
    }
    throw e;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? r.statusText);
  return data as T;
}
