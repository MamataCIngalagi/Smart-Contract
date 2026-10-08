import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import { pool } from './vaultRepository.ts';
const stage = process.argv[2];
const origin = process.env.LOGEN_APP_ORIGIN;
const fixture = '/tmp/smart-contract-deploy-check.json';
async function post(path, body) {
  const response = await fetch(new URL('/api/vault'+path, origin), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return { status:response.status, value:await response.json() };
}
if (stage === 'create') {
  const id = randomUUID(); const capability = randomBytes(32).toString('base64url');
  const key = randomBytes(32); const nonce = randomBytes(12); const plaintext = 'DEPLOYED-RESTART-' + randomUUID();
  const cipher = createCipheriv('aes-256-gcm',key,nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
  const releaseAt = Date.now()+2000;
  const record = await post('/records',{id,capability,title:'Verification fixture',key:key.toString('base64'),nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),releaseAt});
  assert.equal(record.status,201);
  await fs.writeFile(fixture,JSON.stringify({id,capability,plaintext}),{mode:0o600});
  console.log('Live first-slice API created an encrypted fixture. The release endpoint is not deployed until the final restart.');
} else {
  const saved = JSON.parse(await fs.readFile(fixture,'utf8'));
  try {
    const wrong = await post('/records/query',{credentials:[{id:saved.id,capability:randomBytes(32).toString('base64url')}]});
    assert.deepEqual(wrong.value.records,[]);
    const query = await post('/records/query',{credentials:[{id:saved.id,capability:saved.capability}]});
    const record = query.value.records[0]; assert.equal(record.id,saved.id);
    const released = await post(`/records/${saved.id}/release`,{capability:saved.capability});
    assert.equal(released.status,200);
    const data = Buffer.from(record.ciphertext,'base64');
    const decipher = createDecipheriv('aes-256-gcm',Buffer.from(released.value.key,'base64'),Buffer.from(record.nonce,'base64'));
    decipher.setAuthTag(data.subarray(-16));
    assert.equal(Buffer.concat([decipher.update(data.subarray(0,-16)),decipher.final()]).toString(),saved.plaintext);
    console.log('PASS live restart persistence, incorrect-capability denial, timed key release, original-text decryption.');
  } finally { await pool.query('DELETE FROM vault_messages WHERE id=$1',[saved.id]); await pool.end(); await fs.unlink(fixture); }
}
