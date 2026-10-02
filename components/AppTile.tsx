'use client';

import type { PublicApp } from '@/lib/apps';
import type { CheckResult } from '@/lib/frappe-check';
import { siteOf } from '@/lib/sites';

type Check = CheckResult | { skipped: true };

type Props = {
  app: PublicApp;
  editMode: boolean;
  check?: Check;
  siteColour?: string;
  opening?: boolean;
  onLaunch(): void;
  onEdit(): void;
  onDelete(): void;
};

function blocker(app: PublicApp): string | null {
  if (!app.requires_login) return null;
  if (!app.hasPassword) return 'No password saved';
  if (!app.passwordReadable) return 'Re-enter password';
  return null;
}

function checkLine(app: PublicApp, check?: Check): { text: string; tone: 'ok' | 'bad' | 'muted' } | null {
  if (check) {
    if ('skipped' in check) return { text: 'No login needed', tone: 'muted' };
    return check.ok
      ? { text: 'Login works', tone: 'ok' }
      : { text: `Login failed: ${check.message}`, tone: 'bad' };
  }
  if (app.last_check_ok === null || !app.last_check_at) return null;
  const at = new Date(app.last_check_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return app.last_check_ok
    ? { text: `Login worked at ${at}`, tone: 'ok' }
    : { text: `Login failed at ${at}`, tone: 'bad' };
}

const TONE = { ok: 'text-ok', bad: 'text-bad', muted: 'text-muted' } as const;

export function AppTile({ app, editMode, check, siteColour = 'var(--color-ink)', opening, onLaunch, onEdit, onDelete }: Props) {
  const blocked = blocker(app);
  const status = editMode ? checkLine(app, check) : null;
  const hidden = !app.is_active;

  return (
    <li className={`relative flex flex-col ${hidden ? 'opacity-55' : ''}`}>
      <button
        type="button"
        onClick={onLaunch}
        disabled={!!blocked}
        aria-describedby={blocked ? `blocked-${app.id}` : undefined}
        className={`group flex min-h-40 w-full flex-1 flex-col rounded-lg border-l-[10px] bg-white px-5 pb-4 pt-4 text-left ring-1 ring-line transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100 ${opening ? 'ring-2 ring-magenta' : ''}`}
        style={{ borderLeftColor: siteColour }}
      >
        <span className="text-[1.9rem] font-extrabold leading-[1.05] tracking-tight text-text">{app.name}</span>
        {app.description && <span className="mt-1.5 text-lg leading-snug text-muted">{app.description}</span>}
        <span className="mt-auto flex flex-wrap items-baseline gap-x-3 pt-4 text-base">
          <span className="font-semibold" style={{ color: siteColour }}>{siteOf(app.url)}</span>
          {app.requires_login && app.username && <span className="text-muted">as {app.username}</span>}
        </span>
        {opening && <span className="mt-1 text-base font-semibold text-magenta">Opening…</span>}
        {blocked && (
          <span id={`blocked-${app.id}`} className="mt-2 text-base font-semibold text-bad">{blocked}</span>
        )}
      </button>

      {editMode && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {hidden && <span className="rounded bg-line px-2 py-0.5 text-base font-semibold text-text">Hidden</span>}
          {status && <span className={`text-base font-semibold ${TONE[status.tone]}`}>{status.text}</span>}
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={onEdit} aria-label={`Edit ${app.name}`}
              className="min-h-12 rounded-md px-3 text-lg font-semibold text-ink hover:bg-white">
              Edit
            </button>
            <button type="button" onClick={onDelete} aria-label={`Delete ${app.name}`}
              className="min-h-12 rounded-md px-3 text-lg font-semibold text-bad hover:bg-white">
              Delete
            </button>
          </span>
        </div>
      )}
    </li>
  );
}
