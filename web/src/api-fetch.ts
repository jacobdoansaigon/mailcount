/** Gọi API cùng origin (Vite proxy / production static) — gửi cookie phiên đăng nhập. */
const withCreds = (init?: RequestInit): RequestInit => ({
  credentials: "include",
  ...init,
});

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, withCreds(init));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? r.statusText);
  return data as T;
}
