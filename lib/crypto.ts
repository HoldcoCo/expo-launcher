import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class DecryptError extends Error {
  constructor(message = 'Stored password could not be decrypted') {
    super(message);
    this.name = 'DecryptError';
  }
}

function key(): Buffer {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new Error('CREDENTIALS_KEY is not set');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes, base64');
  return k;
}

export function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, ct, cipher.getAuthTag()].map((b) => b.toString('base64')).join(':');
}

export function decryptPassword(stored: string): string {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3) throw new Error('bad format');
    const [iv, ct, tag] = parts.map((p) => Buffer.from(p, 'base64'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error('bad format');
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    if (e instanceof DecryptError) throw e;
    throw new DecryptError();
  }
}
