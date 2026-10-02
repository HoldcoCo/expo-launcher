import { beforeAll, test, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ getApp: vi.fn(), saveCheckResult: vi.fn() }));
vi.mock('@/lib/frappe-check', () => ({ checkFrappeLogin: vi.fn() }));
import { getApp, saveCheckResult } from '@/lib/db';
import { checkFrappeLogin } from '@/lib/frappe-check';
import { encryptPassword } from '@/lib/crypto';
import { POST as LAUNCH } from '@/app/api/launch/[id]/route';
import { POST as CHECK } from '@/app/api/check/[id]/route';
import { stored } from './fixtures';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
const req = () => new Request('https://l.test', { method: 'POST' });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

test('launch returns the login and the target, uncached', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ password_encrypted: encryptPassword('pw') }));
  const res = await LAUNCH(req(), ctx('a1'));
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ targetUrl: 'https://demo.axiomerp.co/arc/', loginUrl: 'https://demo.axiomerp.co/api/method/login', username: 'demo@axiom.test', password: 'pw', delayMs: 1500 });
});
test('no-login app returns only the target', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ requires_login: false, username: null, password_encrypted: null }));
  expect(await (await LAUNCH(req(), ctx('a1'))).json()).toEqual({ targetUrl: 'https://demo.axiomerp.co/arc/' });
});
test('hidden or unknown app is 404', async () => {
  vi.mocked(getApp).mockResolvedValueOnce(stored({ is_active: false })).mockResolvedValueOnce(null);
  expect((await LAUNCH(req(), ctx('a1'))).status).toBe(404);
  expect((await LAUNCH(req(), ctx('x'))).status).toBe(404);
});
test('login app with no stored password is 409', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ password_encrypted: null }));
  expect((await LAUNCH(req(), ctx('a1'))).status).toBe(409);
});
test('login app with no username is 409', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ username: null }));
  expect((await LAUNCH(req(), ctx('a1'))).status).toBe(409);
});
test('unreadable password is 422', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ password_encrypted: 'a:b:c' }));
  expect((await LAUNCH(req(), ctx('a1'))).status).toBe(422);
});
test('check saves and returns the result', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ password_encrypted: encryptPassword('pw') }));
  vi.mocked(checkFrappeLogin).mockResolvedValue({ ok: false, status: 401, message: 'Invalid Login. Try again.' });
  const res = await CHECK(req(), ctx('a1'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: false, status: 401, message: 'Invalid Login. Try again.' });
  expect(checkFrappeLogin).toHaveBeenCalledWith('https://demo.axiomerp.co/api/method/login', 'demo@axiom.test', 'pw');
  expect(saveCheckResult).toHaveBeenCalledWith('a1', false, expect.any(Date));
});
test('check skips no-login apps', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ requires_login: false }));
  expect(await (await CHECK(req(), ctx('a1'))).json()).toEqual({ skipped: true });
});
test('check of an unreadable password is 422 and saved as failed', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ password_encrypted: 'a:b:c' }));
  expect((await CHECK(req(), ctx('a1'))).status).toBe(422);
  expect(saveCheckResult).toHaveBeenCalledWith('a1', false, expect.any(Date));
});
test('check works on a hidden app, so Test login works before un-hiding', async () => {
  vi.mocked(getApp).mockResolvedValue(stored({ is_active: false, password_encrypted: encryptPassword('pw') }));
  vi.mocked(checkFrappeLogin).mockResolvedValue({ ok: true, status: 200, message: 'Logged In' });
  expect((await CHECK(req(), ctx('a1'))).status).toBe(200);
});
