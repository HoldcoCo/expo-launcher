import type { LaunchPayload } from '@/lib/apps';

export type LaunchOutcome =
  | { ok: true }
  | { ok: false; reason: 'popup-blocked' | 'unauthorized' | 'needs-password' | 'unreadable' | 'failed' };

/** Time for the logout navigation to land before the login form replaces it. */
export const LOGOUT_SETTLE_MS = 700;

const REASON_BY_STATUS: Record<number, 'unauthorized' | 'needs-password' | 'unreadable'> = {
  401: 'unauthorized',
  409: 'needs-password',
  422: 'unreadable',
};

/**
 * Tap-to-present. Call it straight from the click handler with no await before it:
 * the tab must open inside the user's tap or Safari blocks it.
 */
export function launchApp(
  id: string,
  deps: { win?: Window; fetchImpl?: typeof fetch; doc?: Document } = {},
): Promise<LaunchOutcome> {
  const win = deps.win ?? window;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const doc = deps.doc ?? document;
  const tabName = `axiom-launch-${id}`;

  // 1. Open the tab synchronously, before anything async.
  const tab = win.open('about:blank', tabName);
  if (!tab) return Promise.resolve({ ok: false, reason: 'popup-blocked' });

  return (async (): Promise<LaunchOutcome> => {
    // 2. Ask our server for this app's login.
    let payload: LaunchPayload;
    try {
      const res = await fetchImpl(`/api/launch/${encodeURIComponent(id)}`, { method: 'POST', cache: 'no-store' });
      if (!res.ok) {
        tab.close();
        return { ok: false, reason: REASON_BY_STATUS[res.status] ?? 'failed' };
      }
      payload = (await res.json()) as LaunchPayload;
    } catch {
      tab.close();
      return { ok: false, reason: 'failed' };
    }

    if (!payload.loginUrl || payload.username === undefined || payload.password === undefined) {
      tab.location.href = payload.targetUrl;
      return { ok: true };
    }

    // 3. Log the site out first. Apps on one site share a session, so if the new login
    //    failed, the tab would otherwise open as whoever used that site last.
    const { loginUrl, username, password, targetUrl } = payload;
    tab.location.href = `${new URL(loginUrl).origin}/api/method/logout`;

    setTimeout(() => {
      // 4. Post the login into that tab with a hidden form (never a URL with the password in it).
      const form = doc.createElement('form');
      form.method = 'POST';
      form.action = loginUrl;
      form.target = tabName;
      form.style.display = 'none';
      for (const [name, value] of [['usr', username], ['pwd', password]] as const) {
        const input = doc.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      doc.body.appendChild(form);
      try { form.submit(); } finally { form.remove(); }

      // 5. Once the session cookie is set, send the tab to the app.
      setTimeout(() => { tab.location.href = targetUrl; }, payload.delayMs ?? 1500);
    }, LOGOUT_SETTLE_MS);
    return { ok: true };
  })();
}
