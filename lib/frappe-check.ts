import 'server-only';

export type CheckResult = { ok: boolean; status: number | null; message: string };

export const CHECK_TIMEOUT_MS = 10_000;

/** Tries a Frappe login from the server. Servers aren't bound by browser cross-origin rules, so we can read the answer. */
export async function checkFrappeLogin(
  loginUrl: string,
  username: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult> {
  let res: Response;
  try {
    res = await fetchImpl(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ usr: username, pwd: password }).toString(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, status: null, message: 'Timed out after 10 s' };
    return { ok: false, status: null, message: 'Could not reach the site' };
  }

  let message: unknown;
  try { message = (await res.json())?.message; } catch { message = undefined; }
  if (typeof message !== 'string') return { ok: false, status: res.status, message: `HTTP ${res.status}` };
  return { ok: res.status === 200 && message === 'Logged In', status: res.status, message };
}
