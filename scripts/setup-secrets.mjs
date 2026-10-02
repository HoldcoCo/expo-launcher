#!/usr/bin/env node
// Prints the three secret env values for the launcher.
// Usage: node scripts/setup-secrets.mjs "<team password>"
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/setup-secrets.mjs "<team password>"');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
console.log(`TEAM_PASSWORD_HASH=${Buffer.from(hash).toString('base64')}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString('hex')}`);
console.log(`CREDENTIALS_KEY=${randomBytes(32).toString('base64')}`);
