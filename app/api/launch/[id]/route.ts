import { NextResponse } from 'next/server';
import { getApp } from '@/lib/db';
import { resolveLogin } from '@/lib/apps';
import { loginError } from '@/lib/http';

// The only response that ever carries a demo password. Never cached, never logged.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = resolveLogin(await getApp(id));
  if (r.status !== 200) return loginError(r.status);
  return NextResponse.json(r.payload, { headers: { 'Cache-Control': 'no-store' } });
}
