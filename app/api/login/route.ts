import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { clearAttempt, getAttempt, saveAttempt } from '@/lib/db';
import { clientIp, lockStatus, recordFailure } from '@/lib/lockout';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';

function teamHash(): string {
  const b64 = process.env.TEAM_PASSWORD_HASH;
  if (!b64) throw new Error('TEAM_PASSWORD_HASH is not set');
  return Buffer.from(b64, 'base64').toString('utf8');
}

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const now = new Date();
  const attempt = await getAttempt(ip);
  const lock = lockStatus(attempt, now);
  if (lock.locked) {
    return NextResponse.json({ error: 'locked', retryAfterSeconds: lock.retryAfterSeconds }, { status: 429 });
  }

  let password: unknown;
  try { password = (await req.json())?.password; } catch { password = undefined; }
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'missing-password' }, { status: 400 });
  }

  if (!(await bcrypt.compare(password, teamHash()))) {
    const next = recordFailure(attempt, ip, now);
    await saveAttempt(next);
    const after = lockStatus(next, now);
    if (after.locked) {
      return NextResponse.json({ error: 'locked', retryAfterSeconds: after.retryAfterSeconds }, { status: 429 });
    }
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  await clearAttempt(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
  return res;
}
