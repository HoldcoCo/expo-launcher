import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AttemptRow } from '@/lib/lockout';

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
