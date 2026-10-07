import { beforeAll, test, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { createSessionToken } from '@/lib/session';

beforeAll(() => { process.env.SESSION_SECRET = 'x'.repeat(64); });
const req = (path: string, cookie?: string) => new NextRequest(new URL(path, 'https://launcher.test'),
  { headers: cookie ? { cookie: `launcher_session=${cookie}` } : {} });

test.each(['/api/apps', '/api/apps/abc', '/api/launch/abc', '/api/check/abc', '/api/logout'])(
  '%s without a session returns 401', async (p) => {
    expect((await middleware(req(p))).status).toBe(401);
  });
test('page without a session redirects to /login with next', async () => {
  const res = await middleware(req('/'));
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe('https://launcher.test/login?next=%2F');
});
test('GET /giveaway without a session redirects to /login with next', async () => {
  const res = await middleware(req('/giveaway'));
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe('https://launcher.test/login?next=%2Fgiveaway');
});
test('/login and /api/login are public', async () => {
  for (const p of ['/login', '/api/login']) expect((await middleware(req(p))).headers.get('x-middleware-next')).toBe('1');
});
test('valid session passes', async () => {
  const res = await middleware(req('/api/apps', await createSessionToken()));
  expect(res.headers.get('x-middleware-next')).toBe('1');
});
