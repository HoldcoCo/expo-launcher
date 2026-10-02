'use client';

import { useEffect } from 'react';

export type ToastMessage = { text: string; tone: 'info' | 'error' };

export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss(): void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, message.tone === 'error' ? 12000 : 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      {message && (
        <div role={message.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-xl items-start gap-4 rounded-lg px-5 py-4 text-lg font-semibold text-white shadow-xl ${message.tone === 'error' ? 'bg-bad' : 'bg-ink'}`}>
          <span>{message.text}</span>
          <button type="button" onClick={onDismiss} className="-my-1 min-h-10 shrink-0 rounded px-2 underline underline-offset-4">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
