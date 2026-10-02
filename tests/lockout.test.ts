import { test, expect } from 'vitest';
import { lockStatus, recordFailure, clientIp, type AttemptRow } from '@/lib/lockout';

const t = (min: number) => new Date(Date.UTC(2026, 9, 10, 9, min));
const fail = (n: number, at = t(0)) => { let r: AttemptRow | null = null; for (let i = 0; i < n; i++) r = recordFailure(r, '1.1.1.1', at); return r; };

test('no row is not locked', () => expect(lockStatus(null, t(0)).locked).toBe(false));
test('4 failures do not lock', () => expect(lockStatus(fail(4), t(0)).locked).toBe(false));
test('5th failure locks for 900 s', () => expect(lockStatus(fail(5), t(0))).toEqual({ locked: true, retryAfterSeconds: 900 }));
test('10 minutes into a lock, 300 s remain', () => expect(lockStatus(fail(5), t(10)).retryAfterSeconds).toBe(300));
test('lock ends after 15 minutes', () => expect(lockStatus(fail(5), t(15)).locked).toBe(false));
test('a failure after the window starts a new count', () => expect(recordFailure(fail(4), '1.1.1.1', t(16)).failed_count).toBe(1));
test('a failure after a lock ends starts a new count', () => expect(recordFailure(fail(5), '1.1.1.1', t(16)).failed_count).toBe(1));
test('client IP is the first forwarded address', () => {
  expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5');
  expect(clientIp(new Headers())).toBe('unknown');
});
