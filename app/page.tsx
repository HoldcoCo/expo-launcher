'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicApp } from '@/lib/apps';
import type { CheckResult } from '@/lib/frappe-check';
import { launchApp, type LaunchOutcome } from '@/lib/launch-client';
import { siteColours, siteOf } from '@/lib/sites';
import { AppTile } from '@/components/AppTile';
import { AppForm } from '@/components/AppForm';
import { Toast, type ToastMessage } from '@/components/Toast';

type Check = CheckResult | { skipped: true };

const LAUNCH_MESSAGES: Record<Exclude<LaunchOutcome, { ok: true }>['reason'], string> = {
  'popup-blocked': 'Pop-ups are blocked for this site. Safari: Settings › Safari › Block Pop-ups off. Chrome: pop-up icon in the address bar › Always allow.',
  unauthorized: '',
  'needs-password': 'This app has no saved password. Edit it to add one.',
  unreadable: "This app's saved password can't be read. Re-enter it in Edit.",
  failed: "Couldn't load this app's login, try again.",
};

const GROUP_ORDER = ['Axiom', 'Tecleef'];
const groupRank = (g: string) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length);

export default function LauncherPage() {
  const router = useRouter();
  const [apps, setApps] = useState<PublicApp[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [form, setForm] = useState<PublicApp | 'new' | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const toLogin = useCallback(() => router.replace('/login?next=%2F'), [router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/apps', { cache: 'no-store' });
      if (res.status === 401) return toLogin();
      if (!res.ok) throw new Error();
      setApps((await res.json()).apps);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [toLogin]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const shown = (apps ?? []).filter((a) => editMode || a.is_active);
    const byGroup = new Map<string, PublicApp[]>();
    for (const a of shown) byGroup.set(a.group_name, [...(byGroup.get(a.group_name) ?? []), a]);
    return [...byGroup.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b));
  }, [apps, editMode]);

  const colours = useMemo(() => siteColours((apps ?? []).map((a) => a.url)), [apps]);

  function present(app: PublicApp) {
    // launchApp opens the tab synchronously: nothing may be awaited before this call.
    const pending = launchApp(app.id);
    setOpeningId(app.id);
    void pending.then((outcome) => {
      setTimeout(() => setOpeningId((id) => (id === app.id ? null : id)), 1500);
      if (outcome.ok) return;
      setOpeningId(null);
      if (outcome.reason === 'unauthorized') return toLogin();
      setToast({ text: LAUNCH_MESSAGES[outcome.reason], tone: 'error' });
    });
  }

  async function runCheck(id: string): Promise<Check> {
    const res = await fetch(`/api/check/${id}`, { method: 'POST' });
    if (res.status === 401) { toLogin(); throw new Error('unauthorized'); }
    const body = await res.json().catch(() => ({}));
    let result: Check;
    if (res.ok) result = body as Check;
    else if (res.status === 409) result = { ok: false, status: null, message: 'no password saved' };
    else if (res.status === 422) result = { ok: false, status: null, message: 're-enter the password' };
    else result = { ok: false, status: res.status, message: `HTTP ${res.status}` };
    setChecks((c) => ({ ...c, [id]: result }));
    return result;
  }

  async function checkAll() {
    if (!apps) return;
    setCheckingAll(true);
    let failed = 0;
    try {
      for (const app of apps.filter((a) => a.is_active)) {
        const r = await runCheck(app.id);
        if (!('skipped' in r) && !r.ok) failed++;
      }
      setToast(failed
        ? { text: `${failed} ${failed === 1 ? 'app' : 'apps'} failed the login check. See the red lines.`, tone: 'error' }
        : { text: 'Every login works.', tone: 'info' });
    } catch {
      /* redirected to login */
    } finally {
      setCheckingAll(false);
    }
  }

  async function save(input: Record<string, unknown>) {
    const editing = form !== 'new' && form !== null;
    const res = await fetch(editing ? `/api/apps/${form.id}` : '/api/apps', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.status === 401) { toLogin(); return {}; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { errors: body.errors ?? { body: "Couldn't save. Try again." } };
    setToast({ text: `Saved ${body.app.name}.`, tone: 'info' });
    if (editing) setChecks((c) => { const next = { ...c }; delete next[form.id]; return next; });
    await load();
    return {};
  }

  async function remove(app: PublicApp) {
    if (!window.confirm(`Delete ${app.name}?`)) return;
    const res = await fetch(`/api/apps/${app.id}`, { method: 'DELETE' });
    if (res.status === 401) return toLogin();
    setToast(res.ok ? { text: `Deleted ${app.name}.`, tone: 'info' } : { text: `Couldn't delete ${app.name}.`, tone: 'error' });
    await load();
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  const sites = [...colours.entries()];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 sm:px-6">
          <h1 className="mr-auto text-3xl font-extrabold tracking-tight text-ink">Expo launcher</h1>
          <button type="button" aria-pressed={editMode} onClick={() => setEditMode((v) => !v)}
            className={`min-h-12 rounded-md px-4 text-lg font-semibold ${editMode ? 'bg-ink text-white' : 'text-ink'}`}>
            {editMode ? 'Done editing' : 'Edit'}
          </button>
          <button type="button" onClick={logout} className="min-h-12 rounded-md px-4 text-lg font-semibold text-muted">
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        {editMode && (
          <div className="mb-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => setForm('new')}
              className="min-h-12 rounded-md bg-ink px-5 text-lg font-extrabold text-white">
              Add app
            </button>
            <button type="button" onClick={checkAll} disabled={checkingAll || !apps?.length}
              className="min-h-12 rounded-md border-2 border-ink px-5 text-lg font-semibold text-ink disabled:opacity-50">
              {checkingAll ? 'Checking…' : 'Check all apps'}
            </button>
          </div>
        )}

        {loadError && (
          <div role="alert" className="mb-6 text-lg font-semibold text-bad">
            Couldn&apos;t load the app list.{' '}
            <button type="button" onClick={load} className="underline underline-offset-4">Try again</button>
          </div>
        )}

        {apps === null && !loadError && <p className="text-lg text-muted">Loading apps…</p>}

        {apps !== null && groups.length === 0 && (
          <p className="text-xl text-muted">No apps yet. Turn on Edit and add one.</p>
        )}

        {groups.map(([group, list]) => (
          <section key={group} aria-labelledby={`g-${group}`} className="mb-12">
            <h2 id={`g-${group}`} className="mb-4 text-4xl font-extrabold tracking-tight text-text">{group}</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((app) => (
                <AppTile
                  key={app.id}
                  app={app}
                  editMode={editMode}
                  check={checks[app.id]}
                  siteColour={colours.get(siteOf(app.url))}
                  opening={openingId === app.id}
                  onLaunch={() => present(app)}
                  onEdit={() => setForm(app)}
                  onDelete={() => remove(app)}
                />
              ))}
            </ul>
          </section>
        ))}

        {sites.length > 1 && (
          <p className="max-w-2xl text-base text-muted">
            Apps with the same colour edge share one login session. Tapping a tile signs that site out, then back in as the tile&apos;s user.
          </p>
        )}
      </main>

      {form !== null && (
        <AppForm
          key={form === 'new' ? 'new' : form.id}
          app={form === 'new' ? null : form}
          onSave={save}
          onTest={form === 'new' ? undefined : () => runCheck(form.id)}
          onClose={() => setForm(null)}
        />
      )}

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
