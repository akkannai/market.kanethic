// Usage: node scripts/hash-password.mjs 'your-admin-password'  -> ADMIN_PASSWORD_HASH value
import { randomBytes, scryptSync } from 'node:crypto';
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Usage: node scripts/hash-password.mjs "<password of 10+ chars>"'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
console.log(`scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`);
