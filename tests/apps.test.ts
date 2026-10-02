import { beforeAll, test, expect } from 'vitest';
import { encryptPassword, decryptPassword } from '@/lib/crypto';
import { loginUrlFor, toPublicApp, validateAppInput } from '@/lib/apps';
import { stored } from './fixtures';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
const base = { name: 'Axiom ARC', group_name: 'Axiom', url: 'https://demo.axiomerp.co/arc/', requires_login: true, username: 'demo@axiom.test', password: 'p&ss=+' };

test('login URL is the origin plus /api/method/login', () => {
  expect(loginUrlFor('https://demo.axiomerp.co/arc/')).toBe('https://demo.axiomerp.co/api/method/login');
  expect(loginUrlFor('https://axiom.holdco.co/fm-portal')).toBe('https://axiom.holdco.co/api/method/login');
});
test('public app never carries the encrypted password', () => {
  const row = stored();
  const pub = toPublicApp(row);
  expect(pub).not.toHaveProperty('password_encrypted');
  expect(JSON.stringify(pub)).not.toContain(row.password_encrypted);
  expect(pub).toMatchObject({ hasPassword: true, passwordReadable: true });
});
test('unreadable password is flagged', () => {
  expect(toPublicApp(stored({ password_encrypted: 'a:b:c' })).passwordReadable).toBe(false);
});
test('create rejects bad input', () => {
  const r = validateAppInput({ ...base, name: '', url: 'http://x.test', redirect_delay_ms: 499, password: '' }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['name', 'password', 'redirect_delay_ms', 'url']);
  expect(validateAppInput({ ...base, redirect_delay_ms: 10001 }, null).ok).toBe(false);
});
test('create encrypts the password and drops the plain field', () => {
  const r = validateAppInput(base, null);
  if (!r.ok) throw new Error('expected ok');
  expect(r.patch).not.toHaveProperty('password');
  expect(decryptPassword(r.patch.password_encrypted!)).toBe('p&ss=+');
});
test('no-login app needs no username or password', () => {
  expect(validateAppInput({ name: 'Tecleef', group_name: 'Tecleef', url: 'https://dev.tecleef.com/', requires_login: false }, null).ok).toBe(true);
});
test('update with a blank password keeps the stored one', () => {
  const r = validateAppInput({ name: 'Renamed', password: '' }, stored());
  if (!r.ok) throw new Error('expected ok');
  expect(r.patch).not.toHaveProperty('password_encrypted');
  expect(r.patch.name).toBe('Renamed');
});
test('switching login on with no password anywhere is rejected', () => {
  const r = validateAppInput({ requires_login: true, username: 'u' }, stored({ requires_login: false, password_encrypted: null }));
  expect(r.ok).toBe(false);
});
test('id and timestamps in the input are ignored', () => {
  const r = validateAppInput({ ...base, id: 'x', created_at: 'y' }, null);
  if (!r.ok) throw new Error('expected ok');
  expect(r.patch).not.toHaveProperty('id');
  expect(r.patch).not.toHaveProperty('created_at');
});
test('a non-object body is rejected', () => {
  expect(validateAppInput('nope', null).ok).toBe(false);
  expect(validateAppInput(null, stored()).ok).toBe(false);
});
test('wrong types are rejected, not coerced', () => {
  const r = validateAppInput({ ...base, requires_login: 'yes', sort_order: '5' }, null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['requires_login', 'sort_order']);
});
test('text fields are trimmed and a blank description becomes null', () => {
  const r = validateAppInput({ ...base, name: '  Axiom ARC  ', description: '   ' }, null);
  if (!r.ok) throw new Error('expected ok');
  expect(r.patch.name).toBe('Axiom ARC');
  expect(r.patch.description).toBeNull();
});
void encryptPassword;
