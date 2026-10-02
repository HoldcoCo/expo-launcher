import type { LaunchPayload } from '@/lib/apps';

export type LaunchOutcome =
  | { ok: true }
  | { ok: false; reason: 'popup-blocked' | 'unauthorized' | 'needs-password' | 'unreadable' | 'failed' };

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

    // 3. Post the login into that tab with a hidden form (never a URL with the password in it).
    const form = doc.createElement('form');
    form.method = 'POST';
    form.action = payload.loginUrl;
    form.target = tabName;
    form.style.display = 'none';
    for (const [name, value] of [['usr', payload.username], ['pwd', payload.password]] as const) {
      const input = doc.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    doc.body.appendChild(form);
    try { form.submit(); } finally { form.remove(); }

    // 4 + 5. Once the session cookie is set, send the tab to the app.
    setTimeout(() => { tab.location.href = payload.targetUrl; }, payload.delayMs ?? 1500);
    return { ok: true };
  })();
}
