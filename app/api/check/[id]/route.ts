import { NextResponse } from 'next/server';
import { getApp, saveCheckResult } from '@/lib/db';
import { resolveLogin } from '@/lib/apps';
import { checkFrappeLogin } from '@/lib/frappe-check';
import { loginError } from '@/lib/http';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getApp(id);
  const r = resolveLogin(row, { allowInactive: true });
  if (r.status !== 200) {
    if (row && r.status === 422) await saveCheckResult(id, false, new Date());
    return loginError(r.status);
  }
  const { loginUrl, username, password } = r.payload;
  if (!loginUrl || !username || !password) return NextResponse.json({ skipped: true });
  const result = await checkFrappeLogin(loginUrl, username, password);
  await saveCheckResult(id, result.ok, new Date());
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
