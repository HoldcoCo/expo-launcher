import { decryptPassword, encryptPassword } from '@/lib/crypto';

export type AppRow = {
  id: string;
  name: string;
  group_name: string;
  description: string | null;
  url: string;
  requires_login: boolean;
  username: string | null;
  password_encrypted: string | null;
  redirect_delay_ms: number;
  sort_order: number;
  is_active: boolean;
  last_check_ok: boolean | null;
  last_check_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicApp = Omit<AppRow, 'password_encrypted'> & { hasPassword: boolean; passwordReadable: boolean };

export function toPublicApp(row: AppRow): PublicApp {
  const { password_encrypted, ...rest } = row;
  let passwordReadable = false;
  if (password_encrypted) {
    try { decryptPassword(password_encrypted); passwordReadable = true; } catch { passwordReadable = false; }
  }
  return { ...rest, hasPassword: !!password_encrypted, passwordReadable };
}

export function loginUrlFor(url: string): string {
  return `${new URL(url).origin}/api/method/login`;
}

type Result = { ok: true; patch: Partial<AppRow> } | { ok: false; errors: Record<string, string> };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateAppInput(input: unknown, existing: AppRow | null): Result {
  if (!isObject(input)) return { ok: false, errors: { body: 'Expected a JSON object' } };
  const creating = existing === null;
  const errors: Record<string, string> = {};
  const patch: Partial<AppRow> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined;

  // Required text fields
  for (const [key, label] of [['name', 'Name'], ['group_name', 'Group'], ['url', 'URL']] as const) {
    if (!has(key)) { if (creating) errors[key] = `${label} is required`; continue; }
    const v = input[key];
    if (typeof v !== 'string' || v.trim() === '') { errors[key] = `${label} is required`; continue; }
    patch[key] = v.trim();
  }
  if (patch.url !== undefined) {
    let ok = false;
    try { ok = new URL(patch.url).protocol === 'https:'; } catch { ok = false; }
    if (!ok) { errors.url = 'Must be a full https:// link'; delete patch.url; }
  }

  // Optional text fields
  for (const key of ['description', 'username'] as const) {
    if (!has(key)) continue;
    const v = input[key];
    if (v === null) { patch[key] = null; continue; }
    if (typeof v !== 'string') { errors[key] = 'Must be text'; continue; }
    patch[key] = v.trim() === '' ? null : v.trim();
  }

  for (const key of ['requires_login', 'is_active'] as const) {
    if (!has(key)) continue;
    if (typeof input[key] !== 'boolean') errors[key] = 'Must be true or false';
    else patch[key] = input[key] as boolean;
  }

  if (has('sort_order')) {
    const v = input.sort_order;
    if (!Number.isInteger(v)) errors.sort_order = 'Must be a whole number';
    else patch.sort_order = v as number;
  }
  if (has('redirect_delay_ms')) {
    const v = input.redirect_delay_ms;
    if (!Number.isInteger(v) || (v as number) < 500 || (v as number) > 10000) errors.redirect_delay_ms = 'Must be between 500 and 10000 ms';
    else patch.redirect_delay_ms = v as number;
  }

  if (has('password')) {
    const v = input.password;
    if (typeof v !== 'string') errors.password = 'Must be text';
    else if (v !== '') patch.password_encrypted = encryptPassword(v);
  }

  // Login rule, checked on the merged result
  const requiresLogin = patch.requires_login ?? existing?.requires_login ?? true;
  if (requiresLogin) {
    const username = 'username' in patch ? patch.username : existing?.username;
    if (!username && !errors.username) errors.username = 'Username is required when the app needs a login';
    const password = patch.password_encrypted ?? existing?.password_encrypted;
    if (!password && !errors.password) errors.password = 'Password is required when the app needs a login';
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch };
}
