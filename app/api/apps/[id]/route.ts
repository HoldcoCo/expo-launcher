import { NextResponse } from 'next/server';
import { deleteApp, getApp, updateApp } from '@/lib/db';
import { toPublicApp, validateAppInput } from '@/lib/apps';
import { badJson, notFound, readJson } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readJson(req);
  if (body === undefined) return badJson();
  const existing = await getApp(id);
  if (!existing) return notFound();
  const result = validateAppInput(body, existing);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
  const app = await updateApp(id, result.patch);
  if (!app) return notFound();
  return NextResponse.json({ app: toPublicApp(app) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return (await deleteApp(id)) ? new NextResponse(null, { status: 204 }) : notFound();
}
