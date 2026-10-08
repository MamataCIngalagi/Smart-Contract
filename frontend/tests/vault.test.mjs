import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { encryptNote, decryptNote, loadVaultConfig, saveVaultConfig, addressIsValid, networkName } from '../src/vault.ts';

const store = new Map();
globalThis.window = {
  crypto: webcrypto,
  localStorage: {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  },
};

test('AES-GCM round trip preserves Unicode and multiline text', async () => {
  const note = 'A note for tomorrow.\nCafé, Ελληνικά, 日本語.';
  const envelope = await encryptNote(note, 'test-only passphrase');
  assert.ok(envelope.startsWith('v1.'));
  assert.ok(!envelope.includes(note));
  assert.equal(await decryptNote(envelope, 'test-only passphrase'), note);
});

test('fresh encryption produces different ciphertext and rejects the wrong key', async () => {
  const first = await encryptNote('Same message', 'test-only passphrase');
  const second = await encryptNote('Same message', 'test-only passphrase');
  assert.notEqual(first, second);
  await assert.rejects(decryptNote(first, 'wrong passphrase'), /did not unlock/);
  await assert.rejects(decryptNote('unsupported', 'test-only passphrase'), /unsupported encrypted format/);
});

test('empty and malformed connection settings are safe; valid settings persist', () => {
  assert.deepEqual(loadVaultConfig(), { contractAddress: '', chainId: '' });
  store.set('timelock-vault-config-v1', 'not-json');
  assert.deepEqual(loadVaultConfig(), { contractAddress: '', chainId: '' });
  const config = { contractAddress: '0x0000000000000000000000000000000000000001', chainId: '11155111' };
  saveVaultConfig(config);
  assert.deepEqual(loadVaultConfig(), config);
  assert.ok(addressIsValid(config.contractAddress));
  assert.ok(!addressIsValid('not an address'));
  assert.equal(networkName(11155111), 'Sepolia');
});
