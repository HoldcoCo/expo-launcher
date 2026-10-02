"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { PublicApp } from "@/lib/apps";
import type { CheckResult } from "@/lib/frappe-check";
import {
  ICON_KEYS,
  ICON_REGISTRY,
  iconLabel,
  resolveAppIcon,
  type IconKey,
} from "@/lib/icons";
import { chipBackground } from "@/lib/sites";

type Props = {
  app: PublicApp | null;
  siteColour?: string;
  onSave(input: Record<string, unknown>): Promise<{ errors?: Record<string, string> }>;
  onTest?(): Promise<CheckResult | { skipped: true }>;
  onClose(): void;
};

const FIELD =
  "mt-1 block h-12 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-base text-text focus:border-ink focus:outline-none";

/**
 * Labelled field with optional error linked via aria-describedby.
 */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-[0.9375rem] font-semibold text-text">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[0.8125rem] text-muted">{hint}</p>}
      {error && (
        <p id={errorId} className="mt-1 text-[0.8125rem] font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** Describe error id for aria-describedby when present. */
function describedBy(id: string, error?: string): string | undefined {
  return error ? `${id}-error` : undefined;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap Tab within the dialog and close on Escape.
 */
function useDialogA11y(containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const root = containerRef.current;
    if (!root) return;

    const firstField = root.querySelector<HTMLElement>("#f-name");
    firstField?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [containerRef, onClose]);
}

/**
 * Preview chip matching the tile icon treatment.
 */
function PreviewChip({
  name,
  icon,
  siteColour,
}: {
  name: string;
  icon: IconKey | null;
  siteColour: string;
}) {
  const resolved = resolveAppIcon(name || "App", icon);
  return (
    <span
      aria-hidden="true"
      className="flex size-11 items-center justify-center rounded-[10px]"
      style={{ background: chipBackground(siteColour), color: siteColour }}
    >
      {resolved.kind === "icon" ? (
        <resolved.Icon size={22} strokeWidth={1.75} />
      ) : (
        <span className="font-display text-lg font-extrabold leading-none">{resolved.letters}</span>
      )}
    </span>
  );
}

export function AppForm({ app, siteColour = "#0C4881", onSave, onTest, onClose }: Props) {
  const editing = app !== null;
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useDialogA11y(formRef, onClose);

  const [name, setName] = useState(app?.name ?? "");
  const [group, setGroup] = useState(app?.group_name ?? "Axiom");
  const [description, setDescription] = useState(app?.description ?? "");
  const [url, setUrl] = useState(app?.url ?? "https://");
  const [icon, setIcon] = useState<IconKey | null>(
    app?.icon && (ICON_KEYS as readonly string[]).includes(app.icon) ? (app.icon as IconKey) : null,
  );
  const [needsLogin, setNeedsLogin] = useState(app?.requires_login ?? true);
  const [username, setUsername] = useState(app?.username ?? "");
  const [password, setPassword] = useState("");
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
      name,
      group_name: group,
      description,
      url,
      icon,
      requires_login: needsLogin,
      username,
      redirect_delay_ms: toInt(delay),
      sort_order: toInt(order),
      is_active: visible,
    };
    if (password !== "") body.password = password;
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
      if ("skipped" in r) setTestResult({ text: "No login needed", ok: true });
      else setTestResult(r.ok ? { text: "Login works", ok: true } : { text: `Login failed: ${r.message}`, ok: false });
    } catch {
      setTestResult({ text: "Couldn't run the test. Try again.", ok: false });
    } finally {
      setTesting(false);
    }
  }

  const autoResolved = resolveAppIcon(name || "App", null);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-ink-deep/30"
      onClick={onClose}
    >
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        noValidate
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby={titleId}
        className="flex h-dvh w-full flex-col overflow-y-auto rounded-tl-[16px] rounded-bl-[16px] bg-surface md:w-[480px]"
      >
        <div className="flex flex-1 flex-col px-6 pb-4 pt-6">
          <h2 id={titleId} className="font-display text-[1.875rem] font-extrabold text-ink">
            {editing ? `Edit ${app.name}` : "Add app"}
          </h2>
          {errors.body && (
            <p className="mt-3 text-[0.9375rem] font-medium text-bad">{errors.body}</p>
          )}

          <section className="mt-6 flex flex-col gap-4" aria-labelledby="sec-basics">
            <h3 id="sec-basics" className="text-base font-semibold text-text">
              Basics
            </h3>
            <Field id="f-name" label="Name" error={errors.name}>
              <input
                id="f-name"
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={describedBy("f-name", errors.name)}
              />
            </Field>
            <Field id="f-group" label="Group" error={errors.group_name}>
              <input
                id="f-group"
                className={FIELD}
                list="groups"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                aria-invalid={!!errors.group_name}
                aria-describedby={describedBy("f-group", errors.group_name)}
              />
              <datalist id="groups">
                <option value="Axiom" />
                <option value="Tecleef" />
              </datalist>
            </Field>
            <Field
              id="f-desc"
              label="Description"
              error={errors.description}
              hint="One line to remind the presenter what to show."
            >
              <input
                id="f-desc"
                className={FIELD}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={!!errors.description}
                aria-describedby={describedBy("f-desc", errors.description)}
              />
            </Field>
            <Field id="f-url" label="URL" error={errors.url}>
              <input
                id="f-url"
                className={FIELD}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={!!errors.url}
                aria-describedby={describedBy("f-url", errors.url)}
              />
            </Field>
          </section>

          <section className="mt-8 flex flex-col gap-3" aria-labelledby="sec-icon">
            <div className="flex items-center justify-between gap-3">
              <h3 id="sec-icon" className="text-base font-semibold text-text">
                Icon
              </h3>
              <PreviewChip name={name} icon={icon} siteColour={siteColour} />
            </div>
            {errors.icon && (
              <p id="f-icon-error" className="text-[0.8125rem] font-medium text-bad">
                {errors.icon}
              </p>
            )}
            <div
              role="radiogroup"
              aria-labelledby="sec-icon"
              aria-describedby={errors.icon ? "f-icon-error" : undefined}
              className="grid grid-cols-6 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={icon === null}
                aria-label="Automatic"
                onClick={() => setIcon(null)}
                className={`flex size-11 items-center justify-center rounded-[10px] border border-line ${
                  icon === null ? "ring-2 ring-ink ring-offset-0" : ""
                }`}
                style={{ background: chipBackground(siteColour), color: siteColour }}
              >
                {autoResolved.kind === "icon" ? (
                  <autoResolved.Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <span className="font-display text-sm font-extrabold" aria-hidden="true">
                    {autoResolved.letters}
                  </span>
                )}
              </button>
              {ICON_KEYS.map((key) => {
                const Icon = ICON_REGISTRY[key];
                const selected = icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={iconLabel(key)}
                    onClick={() => setIcon(key)}
                    className={`flex size-11 items-center justify-center rounded-[10px] border border-line text-ink-deep ${
                      selected ? "ring-2 ring-ink ring-offset-0" : ""
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-8 flex flex-col gap-4" aria-labelledby="sec-login">
            <h3 id="sec-login" className="text-base font-semibold text-text">
              Login
            </h3>
            <label className="flex min-h-12 items-center gap-3 text-[0.9375rem] font-semibold text-text">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={needsLogin}
                onChange={(e) => setNeedsLogin(e.target.checked)}
              />
              Needs login
            </label>
            {needsLogin && (
              <>
                <Field id="f-user" label="Username" error={errors.username}>
                  <input
                    id="f-user"
                    className={FIELD}
                    autoCapitalize="off"
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={!!errors.username}
                    aria-describedby={describedBy("f-user", errors.username)}
                  />
                </Field>
                <Field id="f-pass" label="Password" error={errors.password}>
                  <input
                    id="f-pass"
                    className={FIELD}
                    type="password"
                    autoComplete="new-password"
                    placeholder={editing ? "Leave blank to keep" : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!errors.password}
                    aria-describedby={describedBy("f-pass", errors.password)}
                  />
                </Field>
              </>
            )}
            {onTest && (
              <div>
                <button
                  type="button"
                  onClick={test}
                  disabled={testing}
                  className="min-h-12 rounded-[10px] border border-ink px-4 text-[0.9375rem] font-semibold text-ink disabled:opacity-50"
                >
                  {testing ? "Testing…" : "Test login"}
                </button>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  Tests the saved login. Save changes first.
                </p>
                {testResult && (
                  <p
                    role="status"
                    className={`mt-2 text-[0.9375rem] font-semibold ${testResult.ok ? "text-ok" : "text-bad"}`}
                  >
                    {testResult.text}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="mt-8 flex flex-col gap-4" aria-labelledby="sec-display">
            <h3 id="sec-display" className="text-base font-semibold text-text">
              Display
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field id="f-delay" label="Redirect delay" error={errors.redirect_delay_ms}>
                <input
                  id="f-delay"
                  className={FIELD}
                  inputMode="numeric"
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                  aria-invalid={!!errors.redirect_delay_ms}
                  aria-describedby={describedBy("f-delay", errors.redirect_delay_ms)}
                />
              </Field>
              <Field id="f-order" label="Order" error={errors.sort_order}>
                <input
                  id="f-order"
                  className={FIELD}
                  inputMode="numeric"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  aria-invalid={!!errors.sort_order}
                  aria-describedby={describedBy("f-order", errors.sort_order)}
                />
              </Field>
            </div>
            <label className="flex min-h-12 items-center gap-3 text-[0.9375rem] font-semibold text-text">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Visible
            </label>
          </section>
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface px-6 py-4">
          <button
            type="submit"
            disabled={saving}
            className="min-h-12 flex-1 rounded-[10px] bg-ink text-[0.9375rem] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-[10px] px-5 text-[0.9375rem] font-semibold text-text"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
