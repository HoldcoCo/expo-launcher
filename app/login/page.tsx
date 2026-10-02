'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';

function lockMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(safeNext(params.get('next')));
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) setError(lockMessage(body.retryAfterSeconds ?? 900));
      else if (res.status === 401) setError('Incorrect password');
      else setError('Enter the team password.');
      setPassword('');
    } catch {
      setError("Couldn't reach the launcher. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <label htmlFor="team-password" className="block text-lg font-semibold text-text">
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
        aria-describedby={error ? 'login-error' : undefined}
        className="mt-2 block h-14 w-full rounded-md border-2 border-line bg-white px-4 text-xl text-text focus:border-ink focus:outline-none"
      />
      {error && (
        <p id="login-error" role="alert" className="mt-3 text-lg font-semibold text-bad">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-6 h-14 w-full rounded-md bg-ink text-xl font-extrabold text-white transition-opacity disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12 sm:px-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-5xl font-extrabold leading-none tracking-tight text-ink">Expo launcher</h1>
        <p className="mb-10 mt-3 text-lg text-muted">For the Holdco booth team.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
