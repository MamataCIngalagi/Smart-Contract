import pg from 'pg';
import { authorized } from './vaultCrypto.ts';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

export type StoredMessage = {
  id: string; accession: string; title: string; ciphertext: string; nonce: string;
  wrapped_key: string; wrapped_key_nonce: string; capability_hash: string;
  release_at: string; created_at: string; mode: 'server-managed' | 'contract-backed';
  submission_state: 'confirmed' | 'pending' | 'failed';
  chain_id: string | null; contract_address: string | null;
  contract_message_id: string | null; transaction_hash: string | null; failure_code: string | null;
  folder?: string; tags?: string[];
};
export type Credential = { id: string; capability: string };

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS vault_messages (
    id UUID PRIMARY KEY, accession TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
    ciphertext TEXT NOT NULL, nonce TEXT NOT NULL, wrapped_key TEXT NOT NULL,
    wrapped_key_nonce TEXT NOT NULL, capability_hash TEXT NOT NULL,
    release_at BIGINT NOT NULL, created_at BIGINT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'server-managed', submission_state TEXT NOT NULL DEFAULT 'confirmed',
    chain_id BIGINT, contract_address TEXT, contract_message_id TEXT,
    transaction_hash TEXT, failure_code TEXT
  )`);
  // Additive migration: never rewrite existing ciphertext or credentials.
  await pool.query("ALTER TABLE vault_messages ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE vault_messages ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[]");
}

export async function organizeRecord(id: string, folder: string, tags: string[]): Promise<StoredMessage> {
  const { rows } = await pool.query<StoredMessage>('UPDATE vault_messages SET folder=$2, tags=$3 WHERE id=$1 RETURNING *', [id, folder, tags]);
  return rows[0];
}

export async function scopedRecords(credentials: Credential[]): Promise<StoredMessage[]> {
  if (credentials.length === 0) return [];
  const { rows } = await pool.query<StoredMessage>('SELECT * FROM vault_messages WHERE id = ANY($1::uuid[]) ORDER BY release_at, id', [credentials.map(c => c.id)]);
  const byId = new Map(credentials.map(c => [c.id, c.capability]));
  return rows.filter(row => authorized(byId.get(row.id) ?? '', row.capability_hash));
}

export async function insertRecord(record: StoredMessage): Promise<void> {
  await pool.query(`INSERT INTO vault_messages
    (id, accession, title, ciphertext, nonce, wrapped_key, wrapped_key_nonce, capability_hash, release_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [record.id, record.accession, record.title, record.ciphertext, record.nonce, record.wrapped_key, record.wrapped_key_nonce, record.capability_hash, record.release_at, record.created_at]);
}
