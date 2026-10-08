# Time-Locked Message Vault Smart Contract

Time-Locked Message Vault:

This smart contract allows users to securely store encrypted messages on the Ethereum blockchain with a specified future unlock time. A stored message can only be read after the given timestamp, ensuring time-based access control. Users can update or delete their own messages, and messages remain fully private. This contract demonstrates simple blockchain data storage, timestamp-based logic, and user-specific access control using Solidity.

## Smart-Contract web app

The account-free React vault encrypts messages locally and submits ciphertext and a key through the same-origin HTTPS API. Express wraps that key with AES-256-GCM and persists records in the platform PostgreSQL database. Browser-held bearer capabilities scope metadata and release requests. Download recovery credentials before sealing and keep them secret.

Run with Node.js 22.23.2 and host-supplied `DATABASE_URL`, `LOGEN_APP_UUID`, and `PORT`:

```sh
npm ci
npm --prefix frontend ci
node frontend/scripts/fetch-fonts.mjs
npm run build
npm start
```

**Custody:** this is server-managed encryption, not trustless secrecy from the operator. The server can access escrowed keys. Key release requires a correct capability, confirmed record, and authoritative server time at/after the deadline. Advancing the browser clock cannot release keys. Plaintext and raw keys are not persisted. The wrapping key is HKDF-derived from the environment-provided database secret and app UUID; plan re-wrapping before rotating those secrets.

**Contract compatibility:** the imported Solidity sources remain unchanged. `TimeLockedVault` holds a single entry per `msg.sender` with no independent multi-record escrow identifiers. `TimeCheck` provides only a timestamp. They cannot back this server-signer multi-record vault; the interface reports Server-managed without fabricated transactions. Solidity `private` storage is publicly inspectable.

**Recovery:** files contain secret access capabilities, not plaintext or decryption keys. Another browser can restore authorized records from the same app. Unauthorized identifiers expose no records. Clearing browser storage without a file loses access.

## Vault add-ons

- **Recipient handoff:** Message details exports a single credential in a password-protected file using AES-256-GCM and PBKDF2-SHA256 (310,000 iterations, random salt and nonce). Use a strong unique passphrase of at least 12 characters, send it separately, and import at the same origin using Import recovery. Passphrases never leave the browser. A recipient gains shared access, can forward it, and cannot be revoked with this capability model. Ordinary full-vault recovery exports are still unencrypted secret files.
- **Organization:** Save a folder and comma-separated tags from message details. PostgreSQL stores these fields; only a valid message capability can read or change them. They are not encrypted and are shared with all access holders. Folder/tag filtering and text search work in the vault register.
- **Reminders:** Enable per-message notifications from details, only after browser permission. They use API-confirmed release status and generic text, not titles or plaintext. Keep the vault tab open. There is no service worker, push service, or closed-browser delivery. Reminder preferences stay on this browser.
- **Blockchain releases remain deferred:** A compatible independent-record contract and verified deployed chain/RPC configuration are required. The imported mutable single-entry contract is not silently substituted for working release enforcement.

Run `npm test` for API/crypto tests and `npm run test:browser` for the focused browser journey (requires system Chromium at `/usr/bin/chromium`). Playwright is a pinned development dependency, not a production service.
