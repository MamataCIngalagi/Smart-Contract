import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';
import { pool, migrate, scopedRecords } from './vaultRepository.ts';
import { unwrapKey } from './vaultCrypto.ts';
import { vaultRoutes } from './vaultRoutes.ts';

test('empty, capability scoped, encrypted persistent record', async () => {
  await migrate();
  const app = express(); app.use(express.json()); app.use('/api/vault', vaultRoutes);
  const server = app.listen(0, '0.0.0.0');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const root = `http://127.0.0.1:${address.port}/api/vault`;
  async function post(path: string, body: unknown) {
    return fetch(root + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  const id = randomUUID(); const capability = randomBytes(32).toString('base64url');
  const secret = 'FIRST-SLICE-PLAINTEXT-' + randomUUID(); const key = randomBytes(32); const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final(), cipher.getAuthTag()]);
  try {
    const empty = await post('/records/query', { credentials: [] });
    assert.deepEqual((await empty.json()).records, []);
    const releaseAt = Date.now() + 500;
    const created = await post('/records', { id, capability, title: 'Test reference', ciphertext: encrypted.toString('base64'), nonce: nonce.toString('base64'), key: key.toString('base64'), releaseAt });
    assert.equal(created.status, 201);
    const record = (await created.json()).record;
    assert.equal(record.available, false);
    const unauthorized = await post('/records/query', { credentials: [{ id, capability: randomBytes(32).toString('base64url') }] });
    assert.deepEqual((await unauthorized.json()).records, []);
    const noCap = await post('/records/query', { credentials: [{ id }] });
    assert.equal(noCap.status, 400);
    const earlyRelease = await post(`/records/${id}/release`, { capability });
    assert.equal(earlyRelease.status, 423);
    const wrongRelease = await post(`/records/${id}/release`, { capability: randomBytes(32).toString('base64url') });
    assert.equal(wrongRelease.status, 404);
    const absentRelease = await post(`/records/${id}/release`, {});
    assert.equal(absentRelease.status, 404);
    await new Promise(resolve => setTimeout(resolve, 550));
    const released = await post(`/records/${id}/release`, { capability });
    const releasePayload = await released.json();
    assert.equal(released.status, 200);
    assert.equal(Buffer.from(releasePayload.key, 'base64').toString('base64'), key.toString('base64'));
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(releasePayload.key, 'base64'), nonce);
    decipher.setAuthTag(encrypted.subarray(-16));
    assert.equal(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString(), secret);
    const valid = await post('/records/query', { credentials: [{ id, capability }] });
    assert.equal((await valid.json()).records[0].id, id);
    const db = (await scopedRecords([{ id, capability }]))[0];
    assert.ok(!JSON.stringify(db).includes(secret));
    assert.notEqual(db.wrapped_key, key.toString('base64'));
    assert.equal(unwrapKey(db.wrapped_key, db.wrapped_key_nonce, id).toString('base64'), key.toString('base64'));
    assert.equal(db.capability_hash.length, 64);
    console.log('Verified PostgreSQL ciphertext and wrapped key, capability denial, empty registry and reload query.');
  } finally {
    await pool.query('DELETE FROM vault_messages WHERE id=$1', [id]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
