"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export type ToastMessage = { text: string; tone: "info" | "error" };

export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss(): void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, message.tone === "error" ? 12000 : 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      {message && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 text-base text-text"
        >
          {message.tone === "error" ? (
            <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
          )}
          <span className="flex-1">{message.text}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="-my-1 min-h-10 shrink-0 rounded-[10px] px-2 text-[0.9375rem] font-semibold text-muted"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
