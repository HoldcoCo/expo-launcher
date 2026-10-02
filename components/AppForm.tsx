'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { PublicApp } from '@/lib/apps';
import type { CheckResult } from '@/lib/frappe-check';

type Props = {
  app: PublicApp | null;
  onSave(input: Record<string, unknown>): Promise<{ errors?: Record<string, string> }>;
  onTest?(): Promise<CheckResult | { skipped: true }>;
  onClose(): void;
};

const input = 'mt-1 block h-12 w-full rounded-md border-2 border-line bg-white px-3 text-lg text-text focus:border-ink focus:outline-none';

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold text-text">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-base text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-base font-semibold text-bad">{error}</p>}
    </div>
  );
}

export function AppForm({ app, onSave, onTest, onClose }: Props) {
  const editing = app !== null;
  const [name, setName] = useState(app?.name ?? '');
  const [group, setGroup] = useState(app?.group_name ?? 'Axiom');
  const [description, setDescription] = useState(app?.description ?? '');
  const [url, setUrl] = useState(app?.url ?? 'https://');
  const [needsLogin, setNeedsLogin] = useState(app?.requires_login ?? true);
  const [username, setUsername] = useState(app?.username ?? '');
  const [password, setPassword] = useState('');
  const [delay, setDelay] = useState(String(app?.redirect_delay_ms ?? 1500));
  const [order, setOrder] = useState(String(app?.sort_order ?? 100));
  const [visible, setVisible] = useState(app?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; ok: boolean } | null>(null);

  const toInt = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : s);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      name, group_name: group, description, url,
      requires_login: needsLogin, username,
      redirect_delay_ms: toInt(delay), sort_order: toInt(order), is_active: visible,
    };
    if (password !== '') body.password = password;
    try {
      const result = await onSave(body);
      if (result.errors) setErrors(result.errors);
      else onClose();
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!onTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await onTest();
      if ('skipped' in r) setTestResult({ text: 'No login needed', ok: true });
      else setTestResult(r.ok ? { text: 'Login works', ok: true } : { text: `Login failed: ${r.message}`, ok: false });
    } catch {
      setTestResult({ text: "Couldn't run the test. Try again.", ok: false });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-text/30" onClick={onClose}>
      <form
        noValidate
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="app-form-title"
        className="flex h-dvh w-full flex-col overflow-y-auto bg-paper px-6 pb-8 pt-6 md:w-[30rem] md:shadow-2xl"
      >
        <h2 id="app-form-title" className="text-3xl font-extrabold text-ink">{editing ? `Edit ${app.name}` : 'Add app'}</h2>
        {errors.body && <p className="mt-3 text-base font-semibold text-bad">{errors.body}</p>}

        <div className="mt-6 flex flex-col gap-5">
          <Field id="f-name" label="Name" error={errors.name}>
            <input id="f-name" className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="f-group" label="Group" error={errors.group_name}>
            <input id="f-group" className={input} list="groups" value={group} onChange={(e) => setGroup(e.target.value)} />
            <datalist id="groups"><option value="Axiom" /><option value="Tecleef" /></datalist>
          </Field>
          <Field id="f-desc" label="Description" error={errors.description} hint="One line to remind the presenter what to show.">
            <input id="f-desc" className={input} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field id="f-url" label="URL" error={errors.url}>
            <input id="f-url" className={input} type="url" inputMode="url" autoCapitalize="off" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>

          <label className="flex min-h-12 items-center gap-3 text-lg font-semibold">
            <input type="checkbox" className="size-6 accent-ink" checked={needsLogin} onChange={(e) => setNeedsLogin(e.target.checked)} />
            Needs login
          </label>

          {needsLogin && (
            <>
              <Field id="f-user" label="Username" error={errors.username}>
                <input id="f-user" className={input} autoCapitalize="off" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field id="f-pass" label="Password" error={errors.password}>
                <input id="f-pass" className={input} type="password" autoComplete="new-password"
                  placeholder={editing ? 'Leave blank to keep' : undefined}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="f-delay" label="Redirect delay (ms)" error={errors.redirect_delay_ms}>
              <input id="f-delay" className={input} inputMode="numeric" value={delay} onChange={(e) => setDelay(e.target.value)} />
            </Field>
            <Field id="f-order" label="Order" error={errors.sort_order}>
              <input id="f-order" className={input} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
            </Field>
          </div>

          <label className="flex min-h-12 items-center gap-3 text-lg font-semibold">
            <input type="checkbox" className="size-6 accent-ink" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            Visible on the launcher
          </label>
        </div>

        {onTest && (
          <div className="mt-6">
            <button type="button" onClick={test} disabled={testing}
              className="min-h-12 rounded-md border-2 border-ink px-4 text-lg font-semibold text-ink disabled:opacity-50">
              {testing ? 'Testing…' : 'Test login'}
            </button>
            <p className="mt-1 text-base text-muted">Tests the saved login. Save changes first.</p>
            {testResult && (
              <p role="status" className={`mt-2 text-lg font-semibold ${testResult.ok ? 'text-ok' : 'text-bad'}`}>{testResult.text}</p>
            )}
          </div>
        )}

        <div className="mt-auto flex gap-3 pt-8">
          <button type="submit" disabled={saving}
            className="min-h-14 flex-1 rounded-md bg-ink text-xl font-extrabold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}
            className="min-h-14 rounded-md px-5 text-xl font-semibold text-text">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
