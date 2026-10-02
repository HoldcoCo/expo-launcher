import { beforeAll, test, expect } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_TTL_MS } from '@/lib/session';

beforeAll(() => { process.env.SESSION_SECRET = 'x'.repeat(64); });
const t0 = 1_800_000_000_000;

test('fresh token verifies', async () => {
  expect(await verifySessionToken(await createSessionToken(t0), t0 + 1000)).toBe(true);
});
test('expired token fails', async () => {
  expect(await verifySessionToken(await createSessionToken(t0), t0 + SESSION_TTL_MS + 1)).toBe(false);
});
test('edited expiry fails', async () => {
  const [, sig] = (await createSessionToken(t0)).split('.');
  expect(await verifySessionToken(`${t0 + 9e9}.${sig}`, t0)).toBe(false);
});
test('missing or junk token fails', async () => {
  expect(await verifySessionToken(undefined, t0)).toBe(false);
  expect(await verifySessionToken('junk', t0)).toBe(false);
});
