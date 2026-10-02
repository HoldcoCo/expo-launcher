import { test, expect, vi } from 'vitest';
import { checkFrappeLogin } from '@/lib/frappe-check';

const respond = (status: number, body: string) => vi.fn().mockResolvedValue(new Response(body, { status }));
const URL_ = 'https://demo.axiomerp.co/api/method/login';

test('200 with Logged In is OK', async () => {
  expect(await checkFrappeLogin(URL_, 'u', 'p', respond(200, '{"message":"Logged In"}'))).toEqual({ ok: true, status: 200, message: 'Logged In' });
});
test('special characters reach Frappe unchanged', async () => {
  const f = respond(200, '{"message":"Logged In"}');
  await checkFrappeLogin(URL_, 'demo@axiom.test', 'p&ss=+% كلمة', f);
  const params = new URLSearchParams(String(f.mock.calls[0][1].body));
  expect(params.get('usr')).toBe('demo@axiom.test');
  expect(params.get('pwd')).toBe('p&ss=+% كلمة');
});
test('401 is a failure with the site message', async () => {
  expect(await checkFrappeLogin(URL_, 'u', 'p', respond(401, '{"message":"Invalid Login. Try again."}'))).toEqual({ ok: false, status: 401, message: 'Invalid Login. Try again.' });
});
test('200 with another message is a failure', async () => {
  expect((await checkFrappeLogin(URL_, 'u', 'p', respond(200, '{"message":"No App"}'))).ok).toBe(false);
});
test('non-JSON reply reports the HTTP status', async () => {
  expect(await checkFrappeLogin(URL_, 'u', 'p', respond(502, '<html>'))).toEqual({ ok: false, status: 502, message: 'HTTP 502' });
});
test('timeout is a failure with no status', async () => {
  const f = vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError'));
  expect(await checkFrappeLogin(URL_, 'u', 'p', f)).toEqual({ ok: false, status: null, message: 'Timed out after 10 s' });
});
test('network error is a failure with no status', async () => {
  const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
  expect(await checkFrappeLogin(URL_, 'u', 'p', f)).toEqual({ ok: false, status: null, message: 'Could not reach the site' });
});
