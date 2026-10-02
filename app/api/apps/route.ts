import { NextResponse } from 'next/server';
import { insertApp, listApps } from '@/lib/db';
import { toPublicApp, validateAppInput } from '@/lib/apps';
import { badJson, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apps = (await listApps()).map(toPublicApp);
  return NextResponse.json({ apps }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === undefined) return badJson();
  const result = validateAppInput(body, null);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
  const app = await insertApp(result.patch);
  return NextResponse.json({ app: toPublicApp(app) }, { status: 201 });
}
