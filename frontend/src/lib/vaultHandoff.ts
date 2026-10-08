import type { Credential } from './vaultTypes.ts';

const ITERATIONS = 310000;
export type HandoffEnvelope = { version: 1; app: 'Smart-Contract'; kind: 'encrypted-handoff'; iterations: number; salt: string; nonce: string; ciphertext: string };
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
function decode(value: unknown, min: number, max: number): Uint8Array {
  if (typeof value !== 'string' || value.length > max * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid encrypted handoff file.');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length < min || bytes.length > max || encode(bytes) !== value) throw new Error('Invalid encrypted handoff file.');
  return bytes;
}
export function parseHandoff(text: string): HandoffEnvelope {
  if (text.length > 4096) throw new Error('Encrypted handoff file is too large.');
  let value: HandoffEnvelope;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid encrypted handoff file.'); }
  if (!value || value.version !== 1 || value.app !== 'Smart-Contract' || value.kind !== 'encrypted-handoff' || value.iterations !== ITERATIONS) throw new Error('Unsupported encrypted handoff format.');
  decode(value.salt, 16, 16); decode(value.nonce, 12, 12); decode(value.ciphertext, 17, 2048);
  return value;
}
async function derivedKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.length < 12 || passphrase.length > 256) throw new Error('Use a passphrase between 12 and 256 characters.');
  const bytes = new TextEncoder().encode(passphrase);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}
export async function encryptHandoff(credential: Credential, passphrase: string, origin: string): Promise<HandoffEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivedKey(passphrase, salt);
  const bytes = new TextEncoder().encode(JSON.stringify({ origin, credential }));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode('Smart-Contract handoff v1') }, key, bytes);
    return { version: 1, app: 'Smart-Contract', kind: 'encrypted-handoff', iterations: ITERATIONS, salt: encode(salt), nonce: encode(nonce), ciphertext: encode(new Uint8Array(ciphertext)) };
  } finally { bytes.fill(0); }
}
export async function decryptHandoff(envelope: HandoffEnvelope, passphrase: string, origin: string): Promise<Credential> {
  const checked = parseHandoff(JSON.stringify(envelope));
  const key = await derivedKey(passphrase, decode(checked.salt, 16, 16));
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(decode(checked.nonce, 12, 12)), additionalData: new TextEncoder().encode('Smart-Contract handoff v1') }, key, new Uint8Array(decode(checked.ciphertext, 17, 2048))));
  } catch { throw new Error('Incorrect passphrase or damaged handoff file.'); }
  try {
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (payload.origin !== origin) throw new Error('This handoff belongs to a different app address. Ask the sender for the correct vault URL.');
    const c = payload.credential;
    if (!c || typeof c.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.id) || typeof c.capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(c.capability)) throw new Error('Invalid handoff access credential.');
    return { id: c.id, capability: c.capability };
  } finally { bytes.fill(0); }
}
export function downloadHandoff(envelope: HandoffEnvelope) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'smart-contract-encrypted-handoff.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
