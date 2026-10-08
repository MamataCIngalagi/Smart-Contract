import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { capabilityHash, unwrapKey, wrapKey } from './vaultCrypto.ts';
import { insertRecord, scopedRecords, organizeRecord } from './vaultRepository.ts';
import type { Credential, StoredMessage } from './vaultRepository.ts';
import { metadata } from './releasePolicy.ts';
import { storageConfiguration } from './contractAdapter.ts';
import { releaseAvailable } from './releasePolicy.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAP = /^[A-Za-z0-9_-]{43}$/;
export const vaultRoutes = Router();
const requests = new Map<string, { since: number; count: number }>();
const cleanup = setInterval(() => { for (const [id, item] of requests) if (Date.now() - item.since > 60_000) requests.delete(id); }, 60_000);
cleanup.unref();
vaultRoutes.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const item = requests.get(ip);
  if (!item || now - item.since > 60_000) requests.set(ip, { since: now, count: 1 });
  else if (++item.count > 120) { res.status(429).json({ error: 'Too many requests. Wait a minute and retry.' }); return; }
  next();
});

function validCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object') return false;
  const item = value as Credential;
  return typeof item.id === 'string' && UUID.test(item.id) && typeof item.capability === 'string' && CAP.test(item.capability);
}

type Creation = Credential & { title: string; ciphertext: string; nonce: string; key: string; releaseAt: number };

function base64(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string' || value.length > max * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const buffer = Buffer.from(value, 'base64');
  return buffer.length >= min && buffer.length <= max && buffer.toString('base64') === value;
}

vaultRoutes.get('/config', (_req, res) => res.json({ ...storageConfiguration(), serverTime: Date.now() }));

vaultRoutes.post('/records/query', async (req, res) => {
  const credentials = req.body?.credentials;
  if (!Array.isArray(credentials) || credentials.length > 200 || !credentials.every(validCredential)) {
    res.status(400).json({ error: 'Provide a valid access credential registry of up to 200 records.' }); return;
  }
  const serverTime = Date.now();
  const records = await scopedRecords(credentials);
  res.json({ records: records.map(record => ({ ...metadata(record, serverTime), ciphertext: record.ciphertext, nonce: record.nonce })), serverTime });
});

vaultRoutes.post('/records/:id/organization', async (req, res) => {
  const credential = { id: req.params.id, capability: req.body?.capability };
  if (!validCredential(credential)) { res.status(404).json({ error: 'Message unavailable.' }); return; }
  const [record] = await scopedRecords([credential]);
  if (!record) { res.status(404).json({ error: 'Message unavailable.' }); return; }
  const { folder, tags } = req.body;
  if (typeof folder !== 'string' || folder.length > 80 || !Array.isArray(tags) || tags.length > 10 ||
    !tags.every(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 32)) {
    res.status(400).json({ error: 'Use a folder up to 80 characters and up to 10 tags of 32 characters each.' }); return;
  }
  const result = await organizeRecord(record.id, folder.trim(), [...new Set<string>(tags.map((tag: string) => tag.trim()))]);
  res.json({ record: metadata(result), serverTime: Date.now() });
});

vaultRoutes.post('/records/:id/release', async (req, res) => {
  const { id } = req.params;
  const capability = req.body?.capability;
  if (!UUID.test(id) || typeof capability !== 'string' || !CAP.test(capability)) {
    res.status(404).json({ error: 'This message is unavailable or is not released yet.' }); return;
  }
  const [record] = await scopedRecords([{ id, capability }]);
  if (!record) { res.status(404).json({ error: 'This message is unavailable or is not released yet.' }); return; }
  const serverTime = Date.now();
  if (!releaseAvailable(record, serverTime)) {
    res.status(423).json({ error: 'The release service has not authorized this message yet.', serverTime, releaseAt: Number(record.release_at) }); return;
  }
  const key = unwrapKey(record.wrapped_key, record.wrapped_key_nonce, record.id);
  try { res.json({ key: key.toString('base64'), serverTime }); }
  finally { key.fill(0); }
});

vaultRoutes.post('/records', async (req, res) => {
  const value = req.body as Creation;
  if (req.body?.mode && req.body.mode !== 'server-managed') {
    res.status(503).json({ error: storageConfiguration().contractReason }); return;
  }
  if (!validCredential({ id: value?.id, capability: value?.capability }) || typeof value.title !== 'string' || value.title.trim().length < 1 || value.title.length > 120 ||
    !base64(value.ciphertext, 17, 16384) || !base64(value.nonce, 12, 12) || !base64(value.key, 32, 32) ||
    !Number.isSafeInteger(value.releaseAt) || value.releaseAt <= Date.now() || value.releaseAt > Date.now() + 10 * 366 * 86400_000) {
    res.status(400).json({ error: 'Check the title, encrypted message, and future release time (within ten years).' }); return;
  }
  const previous = await scopedRecords([{ id: value.id, capability: value.capability }]);
  if (previous.length) { res.status(200).json({ record: metadata(previous[0]), serverTime: Date.now() }); return; }
  const rawKey = Buffer.from(value.key, 'base64');
  const wrapped = wrapKey(rawKey, value.id);
  rawKey.fill(0);
  const now = Date.now();
  const record: StoredMessage = {
    id: value.id, accession: `V-${new Date(now).getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`,
    title: value.title.trim(), ciphertext: value.ciphertext, nonce: value.nonce,
    wrapped_key: wrapped.wrappedKey, wrapped_key_nonce: wrapped.wrappedKeyNonce,
    capability_hash: capabilityHash(value.capability), release_at: String(value.releaseAt), created_at: String(now),
    mode: 'server-managed', submission_state: 'confirmed', chain_id: null, contract_address: null,
    contract_message_id: null, transaction_hash: null, failure_code: null,
  };
  try { await insertRecord(record); }
  catch (error) {
    if ((error as { code?: string }).code === '23505') { res.status(409).json({ error: 'Cannot use this record identifier. Start a new message.' }); return; }
    throw error;
  }
  res.status(201).json({ record: metadata(record, now), serverTime: now });
});
