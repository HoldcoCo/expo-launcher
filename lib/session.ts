// Signed session token. Uses Web Crypto only, so it runs in middleware (Edge) and in Node.
export const SESSION_COOKIE = 'launcher_session';
export const SESSION_TTL_MS = 14 * 60 * 60 * 1000; // 50_400_000

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set (32+ chars)');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function base64url(bytes: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  return base64url(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(now: number = Date.now()): Promise<string> {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${await sign(exp)}`;
}

export async function verifySessionToken(token: string | undefined, now: number = Date.now()): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (!constantTimeEqual(sig, await sign(exp))) return false;
  return Number(exp) > now;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: true as const,
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge: SESSION_TTL_MS / 1000,
  };
}
