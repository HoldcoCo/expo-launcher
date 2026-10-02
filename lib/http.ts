import { NextResponse } from 'next/server';

/** Reads a JSON body; returns undefined when it isn't valid JSON. */
export async function readJson(req: Request): Promise<unknown | undefined> {
  try { return await req.json(); } catch { return undefined; }
}

export const badJson = () => NextResponse.json({ errors: { body: 'Invalid JSON' } }, { status: 400 });
export const notFound = () => NextResponse.json({ error: 'not-found' }, { status: 404 });

const LOGIN_ERRORS = { 404: 'not-found', 409: 'needs-password', 422: 'decrypt-failed' } as const;
export const loginError = (status: 404 | 409 | 422) =>
  NextResponse.json({ error: LOGIN_ERRORS[status] }, { status, headers: { 'Cache-Control': 'no-store' } });
