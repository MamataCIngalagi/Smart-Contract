# PLAN.md — build contract (TRD)

Derived from the validated design plan — do NOT hand-edit; the platform
regenerates this file from the plan and the item ledger (audit = recompute).
Implement every acceptance item, then make one focused primary-path self-check.
Batch concrete blockers before final deployment; do not add speculative edge cases or polish audits.
Platform checks record execution evidence separately; implementation is not verification.
Historical review findings are retained for context, not an approval requirement.

## Summary

Smart-Contract is an account-free workbench for creating encrypted messages and opening them after a chosen release time. A browser retains bearer access credentials, while the Node/Express API persists ciphertext and escrows the decryption key until release. Imported Solidity contracts provide contract-backed release enforcement only when their deployed capabilities and configuration have been verified; otherwise the app explicitly operates in server-managed mode. Users create a record, track its release state, and open the message when the authoritative release check permits it. This is managed encryption, not a claim of trustless secrecy from the server operator.

## Data model

Use persistent SQLite storage accessed by the Node/Express API. VaultMessage has id:string UUID primary key, accession:string unique, title:string, ciphertext:base64 string, nonce:base64 string, wrappedKey:base64 string, wrappedKeyNonce:base64 string, capabilityHash:string, releaseAt:integer UTC epoch milliseconds, createdAt:integer UTC epoch milliseconds, mode:enum server-managed|contract-backed, submissionState:enum pending|confirmed|failed, chainId:nullable integer, contractAddress:nullable string, contractMessageId:nullable string, transactionHash:nullable string, and failureCode:nullable string. Release availability is derived from authoritative checks, not a browser-controlled status field. A browser-local credential registry relates message UUIDs to random bearer capabilities; it contains no plaintext or decryption keys. An exported recovery file contains these capabilities and is explicitly treated as a secret. Server encryption keys come from environment configuration, never the database or client bundle. No users, sessions, or account tables.

## Routes

- `/` (public) — The working encrypted-message vault, with creation and message details presented within the same route.. UI: New message is the primary action; the page includes the vault register, search, release-state filters, creation sheet, recovery import/export, and selected-message workbench.. Empty state: With no browser-held credentials, show Create your first locked message, New message, and Import recovery file; do not insert sample messages or expose other visitors' records.

## Acceptance items

- [~] `trd-1` — Encrypted message vault — **implemented**
  - acceptance: Against the deployed Express API, an empty capability registry returns an empty vault, a valid encrypted record survives an API restart, and requests with an absent or incorrect capability cannot obtain its metadata or escrowed key.
  - verify: check
  - steps: Create server/vaultRepository.ts, server/vaultCrypto.ts, server/releasePolicy.ts, and server/vaultRoutes.ts and mount their /api/vault endpoints in the existing Node/Express entry. Add persistent SQLite storage and environment-backed AES-256-GCM key wrapping. Inspect the imported Solidity sources and ABI, documenting the actual supported release semantics in server/contractAdapter.ts without inventing methods. Implement server-managed release checks first, with an explicit mode response from GET /api/vault/config. Scope metadata reads to supplied bearer capabilities rather than providing a public global listing. Validate payload sizes, future release timestamps, ciphertext structure, and capabilities; rate-limit sensitive endpoints and redact secrets from logs.
- [~] `trd-2` — core — **implemented**
  - acceptance: Opening / in the deployed React app with fresh browser storage displays the working empty vault, and loading, API failure, and populated responses each render their corresponding usable state without a marketing wrapper.
  - verify: self_check
  - steps: Create frontend/src/pages/VaultPage.tsx and frontend/src/components/vault/ with the register and workbench components; wire / in the frontend router directly to the standalone product shell. Inspect KIT.md and compose available @/ui shell, scaffold, and control primitives. Implement the design tokens in frontend/src/index.css and fetch configuration and scoped metadata through relative /api/... paths. Implement loading, zero-record, populated, and retryable error states without fixtures or account controls.
- [~] `trd-3` — Encrypted message vault — **implemented**
  - acceptance: A fresh-browser user can create a future-release message from / and see it persist after reload, while inspection of the stored SQLite record finds ciphertext and a wrapped key rather than the submitted plaintext or raw key.
  - verify: self_check
  - steps: Create frontend/src/lib/vaultCrypto.ts and frontend/src/lib/vaultCredentials.ts. Use Web Crypto to generate a fresh AES-GCM key, nonce, and high-entropy bearer capability for each message and encrypt the message before submission. Send ciphertext and the key over the same-origin HTTPS API for server-side key escrow; never describe this as protection from the server operator. Implement the creation form in frontend/src/components/vault/CreateMessageSheet.tsx, including timezone confirmation, future-time validation, pending/error feedback, and recovery-file download before final submission. Persist browser capabilities only after successful record creation, discard temporary plaintext and key references after submission, and update the register from the API response.
- [~] `trd-4` — Encrypted message vault — **implemented**
  - acceptance: A created message rejects key release before its deadline even when the browser clock is advanced, opens to the original text after authoritative release, and returns to a plaintext-free closed state when the detail sheet is dismissed.
  - verify: self_check
  - steps: Extend server/releasePolicy.ts and server/vaultRoutes.ts with a capability-protected key-release endpoint that checks authoritative server time on every request and refuses pending or failed records. Implement frontend/src/components/vault/MessageDetailSheet.tsx to request a key only through Open message, decrypt ciphertext locally, and handle locked, available, opened, malformed-ciphertext, and release-check failure states. Treat countdowns as informational and refresh server-derived availability at the release boundary. Clear displayed plaintext and retained key references when the detail sheet closes; never persist decrypted content.
- [~] `trd-5` — Encrypted message vault — **implemented**
  - acceptance: The deployed preview accurately reports server-managed mode when unconfigured; if configured for a compatible deployed imported contract, a test message shows a verifiable transaction receipt and cannot obtain its key until the contract permits release, while RPC failure never unlocks it.
  - verify: self_check
  - steps: Complete server/contractAdapter.ts using only verified interfaces from the imported Solidity contracts and environment-provided RPC, chain, deployed address, and signer configuration. Enable contract-backed creation only if the actual contract supports the required registration and authoritative release checks. Persist real transaction hashes and contract identifiers, wait for successful receipts before marking records confirmed, and deny key release when the contract reports locked or RPC verification fails. Expose pending and failed submissions through the existing React workbench. With configuration absent, retain explicitly labeled server-managed mode; with configuration present but invalid or incompatible, return an actionable unavailable state rather than silently downgrading or fabricating blockchain evidence.
- [~] `trd-6` — Encrypted message vault — **implemented**
  - acceptance: A recovery file exported from one browser restores its records in another browser, malformed or unauthorized entries expose no records, and searches or filters with no matches provide a reset action distinct from the zero-record creation state.
  - verify: self_check
  - steps: Extend frontend/src/lib/vaultCredentials.ts and the VaultPage controls with validated recovery-file import and export, duplicate handling, and explicit secret-file warnings. Resolve imported capabilities through the existing scoped Express metadata endpoint without revealing whether unauthorized IDs exist. Implement title/reference search, All/Locked/Ready filters, deterministic release-time sorting, and reset controls. Keep access credentials out of URLs, analytics, logs, and error messages; explain that clearing browser storage without a recovery file loses access.
- [~] `trd-7` — core — **implemented**
  - acceptance: At 375px and 1440px viewport widths, / has no horizontal page overflow or duplicate mobile title, all text and navigation icons meet 4.5:1 contrast with text at least 11px, and creation and opening are operable by keyboard across empty and populated states.
  - verify: self_check
  - steps: Finish frontend/src/index.css and the React vault components with keyboard-operable rows, labeled fields, dialog focus containment and restoration, accessible status announcements, and reduced-motion support. Exercise the public / route at desktop and phone widths with loading, empty, populated, locked, ready, pending, and failed API states. Measure text and control contrast against their actual backgrounds, including chartreuse status markers, and verify the primary action remains clearly enabled. Ensure Express errors are mapped to actionable frontend messages without leaking cryptographic or configuration secrets.

## Dormant scaffold features

Activate the standalone React product shell, Node/Express vault API, persistent storage, managed key escrow, and a verified imported-contract adapter when configured. Leave scaffold authentication, account management, uploads, billing, notifications, and marketing layouts dormant. Recovery-file import is local credential recovery, not a general upload service.

## Out of scope

No landing page, sign-in, sign-up, user roles, global public message directory, sample records presented as user data, attachments, chat threads, recipient delivery, email reminders, token trading, new Solidity contract design, or fabricated blockchain transactions. Do not claim that ordinary encryption or blockchain timestamps prevent the server operator from accessing escrowed keys. Do not expose keys before release, silently substitute server time for a configured contract check, or promise account-based recovery.

