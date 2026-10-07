// @vitest-environment jsdom
import { beforeEach, test, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
import LoginPage from '@/app/login/page';

const fetchReturns = (status: number, body: object) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
const searchParams = (q: string) => { params = new URLSearchParams(q); };

beforeEach(() => { replace.mockReset(); params = new URLSearchParams(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('login page shows the Holdco logo', () => {
  render(<LoginPage />);
  expect(screen.getByRole('img', { name: 'Holdco' })).toBeVisible();
});
test('wrong password shows Incorrect password', async () => {
  fetchReturns(401, { error: 'invalid' });
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('Team password'), 'nope{Enter}');
  expect(await screen.findByText('Incorrect password')).toBeVisible();
});
test('lockout shows the minutes remaining, rounded up', async () => {
  fetchReturns(429, { error: 'locked', retryAfterSeconds: 301 });
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('Team password'), 'x{Enter}');
  expect(await screen.findByText('Too many tries. Try again in 6 minutes.')).toBeVisible();
});
test('one minute left is singular', async () => {
  fetchReturns(429, { error: 'locked', retryAfterSeconds: 40 });
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('Team password'), 'x{Enter}');
  expect(await screen.findByText('Too many tries. Try again in 1 minute.')).toBeVisible();
});
test('success goes to the safe next path', async () => {
  fetchReturns(200, {}); searchParams('next=//evil.test');
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('Team password'), 'right{Enter}');
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
});
test('network failure says so', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('Team password'), 'x{Enter}');
  expect(await screen.findByText("Couldn't reach the launcher. Check the connection and try again.")).toBeVisible();
});
