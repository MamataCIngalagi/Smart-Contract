import type { Credential } from './vaultTypes';
const STORAGE = 'smart-contract-capabilities-v1';
export function readCredentials(): Credential[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    return Array.isArray(value) ? value.filter(validCredential) : [];
  } catch { return []; }
}
export function validCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object') return false;
  const c = value as Credential;
  return typeof c.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.id)
    && typeof c.capability === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c.capability);
}
export function saveCredentials(credentials: Credential[]) {
  if (credentials.length > 200) throw new Error('A browser vault supports up to 200 records. Save a recovery file before using another browser.');
  localStorage.setItem(STORAGE, JSON.stringify(credentials));
}

export function parseRecovery(text: string): Credential[] {
  if (text.length > 128_000) throw new Error('Recovery file is too large. Use a Smart-Contract recovery file.');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('This is not a valid JSON recovery file.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Recovery file format is invalid.');
  const file = parsed as { version?: number; app?: string; credentials?: unknown };
  if (file.version !== 1 || file.app !== 'Smart-Contract' || !Array.isArray(file.credentials) || file.credentials.length > 200 || !file.credentials.every(validCredential)) {
    throw new Error('Choose a version 1 Smart-Contract recovery file with valid access credentials.');
  }
  const unique = new Map<string, Credential>();
  for (const credential of file.credentials) {
    const previous = unique.get(credential.id);
    if (previous && previous.capability !== credential.capability) throw new Error('Recovery file contains conflicting credentials.');
    unique.set(credential.id, credential);
  }
  return [...unique.values()];
}
export function newCredential(): Credential {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const capability = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return { id: crypto.randomUUID(), capability };
}
export function exportRecovery(credentials: Credential[]) {
  const file = new Blob([JSON.stringify({ version: 1, app: 'Smart-Contract', credentials }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `smart-contract-recovery-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
