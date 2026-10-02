import { beforeAll, test, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ listApps: vi.fn(), getApp: vi.fn(), insertApp: vi.fn(), updateApp: vi.fn(), deleteApp: vi.fn() }));
import { listApps, getApp, insertApp, updateApp, deleteApp } from '@/lib/db';
import { GET, POST } from '@/app/api/apps/route';
import { PATCH, DELETE } from '@/app/api/apps/[id]/route';
import { stored } from './fixtures';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) => new Request('https://l.test/api/apps', { method, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('list never contains a password, encrypted or not', async () => {
  const row = stored();
  vi.mocked(listApps).mockResolvedValue([row]);
  const text = await (await GET()).text();
  expect(text).not.toContain('password_encrypted');
  expect(text).not.toContain(row.password_encrypted);
  expect(JSON.parse(text).apps).toHaveLength(1);
});
test('create returns 201 without the password', async () => {
  vi.mocked(insertApp).mockImplementation(async (p) => stored(p));
  const res = await POST(json('POST', { name: 'X', group_name: 'Axiom', url: 'https://x.test/app', requires_login: true, username: 'u', password: 'pw' }));
  expect(res.status).toBe(201);
  expect(await res.text()).not.toMatch(/password_encrypted|"pw"/);
});
test('create with errors returns 400', async () => {
  expect((await POST(json('POST', { name: '' }))).status).toBe(400);
});
test('broken JSON returns 400', async () => {
  expect((await POST(json('POST', '{oops'))).status).toBe(400);
});
test('patch with a blank password does not touch the stored one', async () => {
  vi.mocked(getApp).mockResolvedValue(stored());
  vi.mocked(updateApp).mockImplementation(async (_id, p) => stored(p));
  expect((await PATCH(json('PATCH', { name: 'New', password: '' }), ctx('a1'))).status).toBe(200);
  expect(vi.mocked(updateApp).mock.calls[0][1]).not.toHaveProperty('password_encrypted');
});
test('patch or delete of an unknown id returns 404', async () => {
  vi.mocked(getApp).mockResolvedValue(null);
  vi.mocked(deleteApp).mockResolvedValue(false);
  expect((await PATCH(json('PATCH', { name: 'x' }), ctx('nope'))).status).toBe(404);
  expect((await DELETE(json('DELETE', ''), ctx('nope'))).status).toBe(404);
});
test('delete returns 204', async () => {
  vi.mocked(deleteApp).mockResolvedValue(true);
  expect((await DELETE(json('DELETE', ''), ctx('a1'))).status).toBe(204);
});
