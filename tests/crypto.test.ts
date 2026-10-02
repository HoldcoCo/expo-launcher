import { beforeAll, test, expect } from 'vitest';
import { encryptPassword, decryptPassword, DecryptError } from '@/lib/crypto';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });

test('round trip returns the exact password', () => {
  for (const p of ['demo123', 'p&ss=+% x', 'كلمة سر']) expect(decryptPassword(encryptPassword(p))).toBe(p);
});
test('same password encrypts differently each time', () => {
  expect(encryptPassword('a')).not.toBe(encryptPassword('a'));
});
test('stored as iv:ciphertext:tag with a 12-byte IV and 16-byte tag', () => {
  const [iv, , tag] = encryptPassword('a').split(':');
  expect(Buffer.from(iv, 'base64')).toHaveLength(12);
  expect(Buffer.from(tag, 'base64')).toHaveLength(16);
});
test('tampered ciphertext throws DecryptError', () => {
  const [iv, ct, tag] = encryptPassword('secret').split(':');
  const bad = Buffer.from(ct, 'base64'); bad[0] ^= 1;
  expect(() => decryptPassword([iv, bad.toString('base64'), tag].join(':'))).toThrow(DecryptError);
});
test('a different key throws DecryptError', () => {
  const stored = encryptPassword('secret');
  const saved = process.env.CREDENTIALS_KEY;
  process.env.CREDENTIALS_KEY = Buffer.alloc(32, 9).toString('base64');
  try { expect(() => decryptPassword(stored)).toThrow(DecryptError); }
  finally { process.env.CREDENTIALS_KEY = saved; }
});
test('malformed input throws DecryptError', () => {
  expect(() => decryptPassword('not-valid')).toThrow(DecryptError);
});
