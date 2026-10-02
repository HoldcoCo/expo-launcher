import { beforeAll, beforeEach, test, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('@/lib/db', () => ({ getAttempt: vi.fn(), saveAttempt: vi.fn(), clearAttempt: vi.fn() }));
import { getAttempt, saveAttempt, clearAttempt } from '@/lib/db';
import { POST } from '@/app/api/login/route';
import { POST as LOGOUT } from '@/app/api/logout/route';

beforeAll(() => {
  process.env.SESSION_SECRET = 'x'.repeat(64);
  process.env.TEAM_PASSWORD_HASH = Buffer.from(bcrypt.hashSync('right', 4)).toString('base64');
});
beforeEach(() => { vi.mocked(getAttempt).mockResolvedValue(null); });
const post = (body: unknown) => POST(new Request('https://l.test/api/login', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '9.9.9.9' } }));

test('right password sets the session cookie and clears attempts', async () => {
  const res = await post({ password: 'right' });
  expect(res.status).toBe(200);
  expect(res.headers.get('set-cookie')).toMatch(/launcher_session=.+HttpOnly/i);
  expect(clearAttempt).toHaveBeenCalledWith('9.9.9.9');
});
test('wrong password returns 401 and records a failure', async () => {
  expect((await post({ password: 'nope' })).status).toBe(401);
  expect(saveAttempt).toHaveBeenCalledWith(expect.objectContaining({ ip: '9.9.9.9', failed_count: 1 }));
});
test('locked IP gets 429 even with the right password', async () => {
  vi.mocked(getAttempt).mockResolvedValueOnce({ ip: '9.9.9.9', failed_count: 5, window_started_at: new Date().toISOString(), locked_until: new Date(Date.now() + 60_000).toISOString() });
  const res = await post({ password: 'right' });
  expect(res.status).toBe(429);
  expect((await res.json()).retryAfterSeconds).toBeGreaterThan(0);
});
test('5th wrong password returns 429 straight away', async () => {
  vi.mocked(getAttempt).mockResolvedValueOnce({ ip: '9.9.9.9', failed_count: 4, window_started_at: new Date().toISOString(), locked_until: null });
  const res = await post({ password: 'nope' });
  expect(res.status).toBe(429);
  expect((await res.json()).retryAfterSeconds).toBe(900);
});
test('missing password returns 400', async () => expect((await post({})).status).toBe(400));
test('logout clears the cookie', async () => {
  expect((await LOGOUT()).headers.get('set-cookie')).toMatch(/launcher_session=;.*Max-Age=0/i);
});
