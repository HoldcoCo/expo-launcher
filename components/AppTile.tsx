"use client";

import { AlertCircle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { PublicApp } from "@/lib/apps";
import type { CheckResult } from "@/lib/frappe-check";
import { resolveAppIcon } from "@/lib/icons";
import { chipBackground, siteOf } from "@/lib/sites";

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

/**
 * Returns a blocker message when the tile cannot be launched.
 */
function blocker(app: PublicApp): string | null {
  if (!app.requires_login) return null;
  if (!app.hasPassword) return "No password saved";
  if (!app.passwordReadable) return "Re-enter password";
  return null;
}

/**
 * Status line shown under the tile in edit mode.
 */
function checkLine(app: PublicApp, check?: Check): { text: string; tone: "ok" | "bad" | "muted" } | null {
  if (check) {
    if ("skipped" in check) return { text: "No login needed", tone: "muted" };
    return check.ok
      ? { text: "Login works", tone: "ok" }
      : { text: `Login failed: ${check.message}`, tone: "bad" };
  }
  if (app.last_check_ok === null || !app.last_check_at) return null;
  const at = new Date(app.last_check_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return app.last_check_ok
    ? { text: `Login worked at ${at}`, tone: "ok" }
    : { text: `Login failed at ${at}`, tone: "bad" };
}

const PILL = {
  ok: { bg: "bg-ok-bg text-ok", Icon: CheckCircle2 },
  bad: { bg: "bg-bad-bg text-bad", Icon: XCircle },
  muted: { bg: "bg-line text-muted", Icon: MinusCircle },
} as const;

/**
 * Icon chip or monogram in the site colour.
 */
function IconChip({
  app,
  siteColour,
  greyscale,
}: {
  app: PublicApp;
  siteColour: string;
  greyscale: boolean;
}) {
  const resolved = resolveAppIcon(app.name, app.icon);
  return (
    <span
      aria-hidden="true"
      className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${greyscale ? "grayscale" : ""}`}
      style={{ background: chipBackground(siteColour), color: siteColour }}
    >
      {resolved.kind === "icon" ? (
        <resolved.Icon size={22} strokeWidth={1.75} />
      ) : (
        <span className="font-display text-lg font-extrabold leading-none">
          {resolved.letters}
        </span>
      )}
    </span>
  );
}

export function AppTile({
  app,
  editMode,
  check,
  siteColour = "#0C4881",
  opening,
  onLaunch,
  onEdit,
  onDelete,
}: Props) {
  const blocked = blocker(app);
  const status = editMode ? checkLine(app, check) : null;
  const hidden = !app.is_active;
  const openMs = app.redirect_delay_ms + 700;

  return (
    <li className={`relative flex flex-col ${hidden ? "opacity-55" : ""}`}>
      <button
        type="button"
        onClick={onLaunch}
        disabled={!!blocked}
        aria-describedby={blocked ? `blocked-${app.id}` : undefined}
        className={[
          "app-tile relative flex w-full flex-1 flex-col overflow-hidden rounded-[14px] border bg-surface p-5 text-left sm:min-h-44",
          editMode ? "border-dashed border-line-strong" : "border-solid border-line",
          blocked ? "cursor-not-allowed" : "",
        ].join(" ")}
      >
        <IconChip app={app} siteColour={siteColour} greyscale={!!blocked} />

        <span className="mt-3 font-display text-[1.625rem] font-extrabold leading-[1.05] text-ink-deep">
          {app.name}
        </span>
        {app.description && (
          <span className="mt-1 line-clamp-2 text-[0.9375rem] text-muted">{app.description}</span>
        )}

        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-[0.8125rem] font-medium">
          <span
            aria-hidden="true"
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ background: siteColour }}
          />
          <span style={{ color: siteColour }}>{siteOf(app.url)}</span>
          {app.requires_login && app.username && (
            <span className="text-muted">as {app.username}</span>
          )}
        </span>

        {opening && (
          <>
            <span className="mt-2 text-[0.8125rem] font-medium text-muted">Opening…</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left motion-reduce:hidden"
              style={{
                background: siteColour,
                animation: `open-bar ${openMs}ms linear forwards`,
              }}
            />
          </>
        )}

        {blocked && (
          <span
            id={`blocked-${app.id}`}
            className="mt-2 flex items-center gap-1.5 text-[0.8125rem] font-medium text-bad"
          >
            <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
            {blocked}
          </span>
        )}
      </button>

      {editMode && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          {hidden && (
            <span className="rounded-full bg-line px-2.5 py-0.5 text-[0.8125rem] font-medium text-text">
              Hidden
            </span>
          )}
          {status && (() => {
            const pill = PILL[status.tone];
            return (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-medium ${pill.bg}`}>
                <pill.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                {status.text}
              </span>
            );
          })()}
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${app.name}`}
              className="min-h-12 rounded-[10px] px-3 text-[0.9375rem] font-semibold text-ink"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${app.name}`}
              className="min-h-12 rounded-[10px] px-3 text-[0.9375rem] font-semibold text-bad"
            >
              Delete
            </button>
          </span>
        </div>
      )}
    </li>
  );
}
