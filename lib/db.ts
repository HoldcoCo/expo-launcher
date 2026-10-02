import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AttemptRow } from '@/lib/lockout';
import type { AppRow } from '@/lib/apps';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

// ---- login attempts ----
export async function getAttempt(ip: string): Promise<AttemptRow | null> {
  return check(await db().from('login_attempts').select('*').eq('ip', ip).maybeSingle()) as AttemptRow | null;
}

export async function saveAttempt(row: AttemptRow): Promise<void> {
  check(await db().from('login_attempts').upsert(row, { onConflict: 'ip' }));
}

export async function clearAttempt(ip: string): Promise<void> {
  check(await db().from('login_attempts').delete().eq('ip', ip));
}

// ---- apps ----

export async function listApps(): Promise<AppRow[]> {
  return check(await db().from('apps').select('*')
    .order('group_name').order('sort_order').order('name')) as AppRow[];
}

export async function getApp(id: string): Promise<AppRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null; // not a uuid: Postgres would raise, treat as not found
  return check(await db().from('apps').select('*').eq('id', id).maybeSingle()) as AppRow | null;
}

export async function insertApp(patch: Partial<AppRow>): Promise<AppRow> {
  return check(await db().from('apps').insert(patch).select('*').single()) as AppRow;
}

export async function updateApp(id: string, patch: Partial<AppRow>): Promise<AppRow | null> {
  if (Object.keys(patch).length === 0) return getApp(id);
  return check(await db().from('apps').update(patch).eq('id', id).select('*').maybeSingle()) as AppRow | null;
}

export async function deleteApp(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const rows = check(await db().from('apps').delete().eq('id', id).select('id')) as { id: string }[];
  return rows.length > 0;
}

export async function saveCheckResult(id: string, ok: boolean, at: Date): Promise<void> {
  check(await db().from('apps').update({ last_check_ok: ok, last_check_at: at.toISOString() }).eq('id', id));
}
