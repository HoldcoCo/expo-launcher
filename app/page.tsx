"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicApp } from "@/lib/apps";
import type { CheckResult } from "@/lib/frappe-check";
import { launchApp, type LaunchOutcome } from "@/lib/launch-client";
import { siteColours, siteOf } from "@/lib/sites";
import { AppTile } from "@/components/AppTile";
import { AppForm } from "@/components/AppForm";
import { Toast, type ToastMessage } from "@/components/Toast";

type Check = CheckResult | { skipped: true };

const LAUNCH_MESSAGES: Record<Exclude<LaunchOutcome, { ok: true }>["reason"], string> = {
  "popup-blocked":
    "Pop-ups are blocked for this site. Safari: Settings › Safari › Block Pop-ups off. Chrome: pop-up icon in the address bar › Always allow.",
  unauthorized: "",
  "needs-password": "This app has no saved password. Edit it to add one.",
  unreadable: "This app's saved password can't be read. Re-enter it in Edit.",
  failed: "Couldn't load this app's login, try again.",
};

const GROUP_ORDER = ["Axiom", "Tecleef"];
const groupRank = (g: string) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length);

/**
 * Readiness summary from last check results for active login apps.
 */
function readinessLine(apps: PublicApp[]): { text: string; tone: "ok" | "bad" } | null {
  const loginApps = apps.filter((a) => a.is_active && a.requires_login);
  if (loginApps.length === 0) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const failed = loginApps.filter((a) => a.last_check_ok === false);
  const notCheckedToday = loginApps.filter((a) => {
    if (!a.last_check_at) return true;
    return new Date(a.last_check_at) < startOfToday;
  });

  const allPassedToday = loginApps.every(
    (a) => a.last_check_ok === true && a.last_check_at !== null && new Date(a.last_check_at) >= startOfToday,
  );

  if (allPassedToday) return { text: "All logins checked today", tone: "ok" };
  if (failed.length > 0) {
    return {
      text: `${failed.length} logins failed their last check`,
      tone: "bad",
    };
  }
  return {
    text: `${notCheckedToday.length} logins not checked today`,
    tone: "bad",
  };
}

/** Six static skeleton tiles while the app list loads. */
function SkeletonGrid() {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="rounded-[14px] border border-line bg-surface p-5 sm:min-h-44">
          <div className="size-11 rounded-[10px] bg-line" />
          <div className="mt-3 h-7 w-3/4 rounded bg-line" />
          <div className="mt-2 h-4 w-full rounded bg-line" />
          <div className="mt-auto pt-8">
            <div className="h-3 w-1/2 rounded bg-line" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LauncherPage() {
  const router = useRouter();
  const [apps, setApps] = useState<PublicApp[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [form, setForm] = useState<PublicApp | "new" | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const toLogin = useCallback(() => router.replace("/login?next=%2F"), [router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/apps", { cache: "no-store" });
      if (res.status === 401) return toLogin();
      if (!res.ok) throw new Error();
      setApps((await res.json()).apps);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [toLogin]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const shown = (apps ?? []).filter((a) => editMode || a.is_active);
    const byGroup = new Map<string, PublicApp[]>();
    for (const a of shown) byGroup.set(a.group_name, [...(byGroup.get(a.group_name) ?? []), a]);
    return [...byGroup.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b));
  }, [apps, editMode]);

  const colours = useMemo(() => siteColours((apps ?? []).map((a) => a.url)), [apps]);
  const readiness = useMemo(() => (apps ? readinessLine(apps) : null), [apps]);

  function present(app: PublicApp) {
    // launchApp opens the tab synchronously: nothing may be awaited before this call.
    const pending = launchApp(app.id);
    setOpeningId(app.id);
    void pending.then((outcome) => {
      setTimeout(() => setOpeningId((id) => (id === app.id ? null : id)), 1500);
      if (outcome.ok) return;
      setOpeningId(null);
      if (outcome.reason === "unauthorized") return toLogin();
      setToast({ text: LAUNCH_MESSAGES[outcome.reason], tone: "error" });
    });
  }

  async function runCheck(id: string): Promise<Check> {
    const res = await fetch(`/api/check/${id}`, { method: "POST" });
    if (res.status === 401) {
      toLogin();
      throw new Error("unauthorized");
    }
    const body = await res.json().catch(() => ({}));
    let result: Check;
    if (res.ok) result = body as Check;
    else if (res.status === 409) result = { ok: false, status: null, message: "no password saved" };
    else if (res.status === 422) result = { ok: false, status: null, message: "re-enter the password" };
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
        if (!("skipped" in r) && !r.ok) failed++;
      }
      setToast(
        failed
          ? { text: `${failed} ${failed === 1 ? "app" : "apps"} failed the login check. See the red lines.`, tone: "error" }
          : { text: "Every login works.", tone: "info" },
      );
    } catch {
      /* redirected to login */
    } finally {
      setCheckingAll(false);
    }
  }

  async function save(input: Record<string, unknown>) {
    const editing = form !== "new" && form !== null;
    const res = await fetch(editing ? `/api/apps/${form.id}` : "/api/apps", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.status === 401) {
      toLogin();
      return {};
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { errors: body.errors ?? { body: "Couldn't save. Try again." } };
    setToast({ text: `Saved ${body.app.name}.`, tone: "info" });
    if (editing) {
      setChecks((c) => {
        const next = { ...c };
        delete next[form.id];
        return next;
      });
    }
    await load();
    return {};
  }

  async function remove(app: PublicApp) {
    if (!window.confirm(`Delete ${app.name}?`)) return;
    const res = await fetch(`/api/apps/${app.id}`, { method: "DELETE" });
    if (res.status === 401) return toLogin();
    setToast(
      res.ok
        ? { text: `Deleted ${app.name}.`, tone: "info" }
        : { text: `Couldn't delete ${app.name}.`, tone: "error" },
    );
    await load();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  const formSiteColour =
    form === null
      ? "#0C4881"
      : form === "new"
        ? "#0C4881"
        : colours.get(siteOf(form.url)) ?? "#0C4881";

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <div className="mr-auto min-w-0">
            <h1 className="font-display text-[2.25rem] font-extrabold leading-none tracking-[-0.01em] text-ink">
              Expo launcher
            </h1>
            <p className="mt-1 text-[0.8125rem] font-medium text-muted">
              Axiom and Tecleef demos
            </p>
            {readiness && (
              <p
                className={`mt-1 hidden text-[0.8125rem] font-medium lg:block ${
                  readiness.tone === "ok" ? "text-ok" : "text-bad"
                }`}
              >
                {readiness.text}
              </p>
            )}
          </div>

          <div
            role="group"
            aria-label="Mode"
            className="flex rounded-[10px] border border-line p-0.5"
          >
            <button
              type="button"
              aria-pressed={!editMode}
              onClick={() => { if (editMode) setEditMode(false); }}
              className={`min-h-10 rounded-[8px] px-3 text-[0.9375rem] font-semibold ${
                !editMode ? "bg-ink text-white" : "text-muted"
              }`}
            >
              Present
            </button>
            <button
              type="button"
              aria-pressed={editMode}
              onClick={() => { if (!editMode) setEditMode(true); }}
              className={`min-h-10 rounded-[8px] px-3 text-[0.9375rem] font-semibold ${
                editMode ? "bg-ink text-white" : "text-muted"
              }`}
            >
              Edit
            </button>
          </div>

          <button
            type="button"
            onClick={logout}
            className="min-h-10 rounded-[10px] px-3 text-[0.9375rem] font-semibold text-muted"
          >
            Log out
          </button>
        </div>
        {readiness && (
          <p
            className={`mx-auto max-w-6xl px-4 pb-3 text-[0.8125rem] font-medium lg:hidden sm:px-6 ${
              readiness.tone === "ok" ? "text-ok" : "text-bad"
            }`}
          >
            {readiness.text}
          </p>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        {editMode && (
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setForm("new")}
              className="min-h-12 rounded-[10px] bg-ink px-5 text-[0.9375rem] font-semibold text-white"
            >
              Add app
            </button>
            <button
              type="button"
              onClick={checkAll}
              disabled={checkingAll || !apps?.length}
              className="min-h-12 rounded-[10px] border border-ink px-5 text-[0.9375rem] font-semibold text-ink disabled:opacity-50"
            >
              {checkingAll ? "Checking…" : "Check all apps"}
            </button>
          </div>
        )}

        {loadError && (
          <div role="alert" className="mb-6 text-base font-semibold text-bad">
            Couldn&apos;t load the app list.{" "}
            <button type="button" onClick={load} className="underline underline-offset-4">
              Try again
            </button>
          </div>
        )}

        {apps === null && !loadError && <SkeletonGrid />}

        {apps !== null && groups.length === 0 && (
          <p className="text-base text-muted">No apps yet. Switch to Edit and add one.</p>
        )}

        {groups.map(([group, list]) => (
          <section key={group} aria-labelledby={`g-${group}`} className="mb-12">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3">
              <h2
                id={`g-${group}`}
                className="font-display text-[1.875rem] font-extrabold text-ink-deep"
              >
                {group}
              </h2>
              <span className="text-[0.8125rem] font-medium text-muted">
                {list.length} {list.length === 1 ? "app" : "apps"}
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

        {apps !== null && apps.length > 0 && (
          <p className="max-w-2xl text-[0.8125rem] font-medium text-muted">
            Tiles with the same colour share one login session. Tapping a tile signs that site out,
            then back in as the tile&apos;s user.
          </p>
        )}
      </main>

      {form !== null && (
        <AppForm
          key={form === "new" ? "new" : form.id}
          app={form === "new" ? null : form}
          siteColour={formSiteColour}
          onSave={save}
          onTest={form === "new" ? undefined : () => runCheck(form.id)}
          onClose={() => setForm(null)}
        />
      )}

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
