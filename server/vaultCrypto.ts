import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function capabilityHash(capability: string): string {
  return createHash('sha256').update(capability).digest('hex');
}

export function authorized(capability: string, hash: string): boolean {
  const actual = Buffer.from(capabilityHash(capability), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function escrowKey(): Buffer {
  const connection = process.env.DATABASE_URL;
  const appId = process.env.LOGEN_APP_UUID;
  if (!connection || !appId) throw new Error('Server encryption configuration is unavailable.');
  // The platform supplies a secret, stable per-app database password. Domain
  // separated HKDF derives an escrow key; no master key is written to storage.
  const secret = new URL(connection).password;
  if (!secret) throw new Error('Database secret required for managed key escrow.');
  return Buffer.from(hkdfSync('sha256', secret, appId, 'vault-escrow-aes-gcm-v1', 32));
}

export function wrapKey(key: Buffer, recordId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', escrowKey(), nonce);
  cipher.setAAD(Buffer.from(recordId));
  const wrapped = Buffer.concat([cipher.update(key), cipher.final(), cipher.getAuthTag()]);
  return { wrappedKey: wrapped.toString('base64'), wrappedKeyNonce: nonce.toString('base64') };
}

export function unwrapKey(wrapped: string, nonce: string, recordId: string): Buffer {
  const data = Buffer.from(wrapped, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', escrowKey(), Buffer.from(nonce, 'base64'));
  decipher.setAAD(Buffer.from(recordId));
  decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
}
