import { randomBytes, createCipheriv, createDecipheriv, scryptSync, createHash, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function encryptBuffer(data: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

export function decryptBuffer(payload: Buffer, passphrase: string): Buffer {
  const MIN_PAYLOAD = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (payload.length < MIN_PAYLOAD) {
    throw new Error(`Ciphertext too short (${payload.length} < ${MIN_PAYLOAD} bytes)`);
  }
  const salt = payload.subarray(0, SALT_LENGTH);
  const iv = payload.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = payload.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function hashBuffer(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashString(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export function verifyPassphrase(storedHash: string, passphrase: string): boolean {
  if (storedHash.startsWith('v2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const derived = scryptSync(passphrase, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
  // Timing-safe comparison to prevent timing attacks on legacy hashes
  const a = Buffer.from(hashString(passphrase), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashPassphrase(passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(passphrase, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `v2:${salt.toString('hex')}:${derived.toString('hex')}`;
}
