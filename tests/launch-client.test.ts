// @vitest-environment jsdom
import { beforeEach, afterEach, test, expect, vi, type Mock } from 'vitest';
import { launchApp, LOGOUT_SETTLE_MS } from '@/lib/launch-client';

let order: string[]; let tab: { close: Mock; location: { href: string } }; let win: Window;
const reply = (status: number, body: object) => vi.fn(async () => { order.push('fetch'); return new Response(JSON.stringify(body), { status }); });
const login = { targetUrl: 'https://demo.axiomerp.co/arc/', loginUrl: 'https://demo.axiomerp.co/api/method/login', username: 'demo@axiom.test', password: 'p&ss=+% كلمة', delayMs: 1500 };
let submitted: { action: string; method: string; target: string; usr: string; pwd: string } | null;

beforeEach(() => {
  order = []; submitted = null; vi.useFakeTimers();
  tab = { close: vi.fn(), location: { href: '' } };
  win = { open: vi.fn(() => { order.push('open'); return tab; }) } as unknown as Window;
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    const v = (n: string) => (this.elements.namedItem(n) as HTMLInputElement).value;
    submitted = { action: this.action, method: this.method, target: this.target, usr: v('usr'), pwd: v('pwd') };
  });
});
afterEach(() => { vi.useRealTimers(); });

test('opens the tab before any network call, synchronously', () => {
  const f = reply(200, login);
  void launchApp('a1', { win, fetchImpl: f });
  expect(win.open).toHaveBeenCalledWith('about:blank', 'axiom-launch-a1');
  expect(order[0]).toBe('open');
});
test('blocked pop-up stops before fetching', async () => {
  (win.open as Mock).mockReturnValue(null);
  const f = reply(200, login);
  expect(await launchApp('a1', { win, fetchImpl: f })).toEqual({ ok: false, reason: 'popup-blocked' });
  expect(f).not.toHaveBeenCalled();
});
test('login app posts exact credentials into the tab, then redirects after the delay', async () => {
  expect(await launchApp('a1', { win, fetchImpl: reply(200, login) })).toEqual({ ok: true });
  vi.advanceTimersByTime(LOGOUT_SETTLE_MS);
  expect(submitted).toEqual({ action: login.loginUrl, method: 'post', target: 'axiom-launch-a1', usr: login.username, pwd: login.password });
  expect(document.querySelector('form')).toBeNull();
  expect(tab.location.href).toBe('https://demo.axiomerp.co/api/method/logout');
  vi.advanceTimersByTime(1500);
  expect(tab.location.href).toBe(login.targetUrl);
});
test('the site is logged out in the tab before the new login is posted', async () => {
  await launchApp('a1', { win, fetchImpl: reply(200, login) });
  expect(tab.location.href).toBe('https://demo.axiomerp.co/api/method/logout');
  expect(submitted).toBeNull();
  vi.advanceTimersByTime(LOGOUT_SETTLE_MS - 1);
  expect(submitted).toBeNull();
  vi.advanceTimersByTime(1);
  expect(submitted).not.toBeNull();
});
test('no-login app goes straight to the target', async () => {
  await launchApp('t1', { win, fetchImpl: reply(200, { targetUrl: 'https://dev.tecleef.com/' }) });
  expect(submitted).toBeNull();
  expect(tab.location.href).toBe('https://dev.tecleef.com/');
});
test.each([[401, 'unauthorized'], [409, 'needs-password'], [422, 'unreadable'], [500, 'failed']])(
  'HTTP %i closes the tab and reports %s', async (status, reason) => {
    expect(await launchApp('a1', { win, fetchImpl: reply(status, {}) })).toEqual({ ok: false, reason });
    expect(tab.close).toHaveBeenCalled();
  });
test('network error closes the tab and reports failed', async () => {
  const f = vi.fn().mockRejectedValue(new TypeError('offline'));
  expect(await launchApp('a1', { win, fetchImpl: f })).toEqual({ ok: false, reason: 'failed' });
  expect(tab.close).toHaveBeenCalled();
});
test('the launch request is a POST to this app\'s launch route', async () => {
  const f = reply(200, login);
  await launchApp('a1', { win, fetchImpl: f });
  expect(f).toHaveBeenCalledWith('/api/launch/a1', expect.objectContaining({ method: 'POST' }));
});
