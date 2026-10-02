export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

export type AttemptRow = {
  ip: string;
  failed_count: number;
  window_started_at: string;
  locked_until: string | null;
};

export function lockStatus(row: AttemptRow | null, now: Date): { locked: boolean; retryAfterSeconds: number } {
  if (!row?.locked_until) return { locked: false, retryAfterSeconds: 0 };
  const ms = Date.parse(row.locked_until) - now.getTime();
  return ms > 0 ? { locked: true, retryAfterSeconds: Math.ceil(ms / 1000) } : { locked: false, retryAfterSeconds: 0 };
}

export function recordFailure(row: AttemptRow | null, ip: string, now: Date): AttemptRow {
  const windowExpired = !row || now.getTime() - Date.parse(row.window_started_at) >= WINDOW_MS;
  const lockEnded = !!row?.locked_until && Date.parse(row.locked_until) <= now.getTime();
  const fresh = windowExpired || lockEnded;
  const failed_count = fresh ? 1 : row!.failed_count + 1;
  return {
    ip,
    failed_count,
    window_started_at: fresh ? now.toISOString() : row!.window_started_at,
    locked_until: failed_count >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS).toISOString() : null,
  };
}

export function clientIp(headers: Headers): string {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first || 'unknown';
}
