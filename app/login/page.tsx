"use client";

import { HoldcoLogo } from "@/components/HoldcoLogo";
import { safeNext } from "@/lib/safe-next";
import {
  Building2,
  DoorOpen,
  HardHat,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  Wrench,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

function lockMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** Quiet outlined icons for the ink panel texture. */
const PANEL_ICONS = [
  LayoutDashboard,
  Building2,
  Store,
  ShoppingBag,
  Users,
  DoorOpen,
  HardHat,
  Receipt,
  Wrench,
  Package,
  MessagesSquare,
  ShieldCheck,
] as const;

function InkPanel() {
  return (
    <div className="relative flex h-[200px] w-full shrink-0 flex-col justify-end overflow-hidden bg-ink px-8 py-8 lg:h-auto lg:w-[45%] lg:justify-center lg:px-12 lg:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-6 p-6 opacity-[0.12] lg:grid-cols-3 lg:gap-8 lg:p-10"
      >
        {PANEL_ICONS.map((Icon, i) => (
          <span key={i} className="flex items-center justify-center text-white">
            <Icon size={36} strokeWidth={1.25} />
          </span>
        ))}
      </div>
      <div className="relative z-10 max-w-md">
        <h1 className="font-display text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.01em] text-white lg:text-[2.75rem]">
          Present every demo in one tap.
        </h1>
        <p className="mt-3 text-base text-white/75">
          For the Holdco booth team.
        </p>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(safeNext(params.get("next")));
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 429)
        setError(lockMessage(body.retryAfterSeconds ?? 900));
      else if (res.status === 401) setError("Incorrect password");
      else setError("Enter the team password.");
      setPassword("");
    } catch {
      setError(
        "Couldn't reach the launcher. Check the connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[360px]">
      <label
        htmlFor="team-password"
        className="block text-[0.9375rem] font-semibold text-text"
      >
        Team password
      </label>
      <input
        id="team-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? "login-error" : undefined}
        className="mt-2 block h-12 w-full rounded-[10px] border border-line-strong bg-surface px-4 text-base text-text focus:border-ink focus:outline-none"
      />
      {error && (
        <p
          id="login-error"
          role="alert"
          className="mt-3 text-[0.9375rem] font-semibold text-bad"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-6 h-12 w-full rounded-[10px] bg-ink text-[0.9375rem] font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <InkPanel />
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[360px]">
          <HoldcoLogo height={36} />
          <p className="mb-8 mt-4 font-display text-[1.625rem] font-extrabold text-ink">
            Holdco App launcher
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
