import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';
import { migrate, pool } from './vaultRepository.ts';
import { vaultRoutes } from './vaultRoutes.ts';
import { encryptHandoff, decryptHandoff, parseHandoff } from '../frontend/src/lib/vaultHandoff.ts';

test('single credential encrypted handoff authenticates passphrase and origin', async () => {
  const credential = { id: randomUUID(), capability: randomBytes(32).toString('base64url') };
  const origin = 'https://vault.example.test'; const passphrase = 'a-long-unique-test-passphrase';
  const envelope = await encryptHandoff(credential, passphrase, origin);
  assert.ok(!JSON.stringify(envelope).includes(credential.capability));
  assert.deepEqual(await decryptHandoff(parseHandoff(JSON.stringify(envelope)), passphrase, origin), credential);
  await assert.rejects(decryptHandoff(envelope, 'wrong-but-long-passphrase', origin), /Incorrect passphrase/);
  await assert.rejects(decryptHandoff(envelope, passphrase, 'https://different.example.test'), /different app/);
  assert.throws(() => parseHandoff(JSON.stringify({ ...envelope, iterations: 1 })), /Unsupported/);
});

test('organization changes require capability and survive a scoped read', async () => {
  await migrate(); const app = express(); app.use(express.json()); app.use('/api/vault', vaultRoutes);
  const server = app.listen(0, '0.0.0.0'); await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const post = (route: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api/vault${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const id = randomUUID(); const capability = randomBytes(32).toString('base64url');
  try {
    const created = await post('/records', { id, capability, title: 'Organization fixture', ciphertext: randomBytes(48).toString('base64'), key: randomBytes(32).toString('base64'), nonce: randomBytes(12).toString('base64'), releaseAt: Date.now() + 60000 });
    assert.equal(created.status, 201);
    assert.equal((await post(`/records/${id}/organization`, { capability: randomBytes(32).toString('base64url'), folder: 'Leaked', tags: [] })).status, 404);
    assert.equal((await post(`/records/${id}/organization`, { folder: 'Leaked', tags: [] })).status, 404);
    assert.equal((await post(`/records/${id}/organization`, { capability, folder: 'Personal', tags: Array(11).fill('too many') })).status, 400);
    const saved = await post(`/records/${id}/organization`, { capability, folder: ' Personal ', tags: ['future', 'future', 'note'] });
    assert.equal(saved.status, 200); assert.deepEqual((await saved.json()).record.tags, ['future', 'note']);
    const query = await post('/records/query', { credentials: [{ id, capability }] });
    assert.equal((await query.json()).records[0].folder, 'Personal');
    assert.deepEqual((await (await post('/records/query', { credentials: [{ id, capability: randomBytes(32).toString('base64url') }] })).json()).records, []);
  } finally { await pool.query('DELETE FROM vault_messages WHERE id=$1', [id]); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
});
