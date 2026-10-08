function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
export async function encryptMessage(message: string) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(message));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const result = { ciphertext: encode(new Uint8Array(ciphertext)), nonce: encode(nonce), key: encode(raw) };
  raw.fill(0);
  return result;
}

export async function decryptMessage(ciphertext: string, nonce: string, rawKey: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(rawKey), character => character.charCodeAt(0));
  try {
    if (keyBytes.byteLength !== 32) throw new Error('The released encryption key has an invalid format.');
    const iv = Uint8Array.from(atob(nonce), character => character.charCodeAt(0));
    const data = Uint8Array.from(atob(ciphertext), character => character.charCodeAt(0));
    if (iv.byteLength !== 12 || data.byteLength < 17) throw new Error('The stored encrypted message has an invalid format.');
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The ')) throw error;
    throw new Error('The released message could not be authenticated or decoded.');
  } finally { keyBytes.fill(0); rawKey = ''; }
}
