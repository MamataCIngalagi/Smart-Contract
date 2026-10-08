import type { StoredMessage } from './vaultRepository.ts';

export function releaseAvailable(record: StoredMessage, serverTime = Date.now()): boolean {
  return record.mode === 'server-managed' && record.submission_state === 'confirmed' && serverTime >= Number(record.release_at);
}

export function metadata(record: StoredMessage, serverTime = Date.now()) {
  return {
    id: record.id, accession: record.accession, title: record.title,
    releaseAt: Number(record.release_at), createdAt: Number(record.created_at),
    mode: record.mode, submissionState: record.submission_state,
    available: releaseAvailable(record, serverTime), transactionHash: record.transaction_hash,
    failureCode: record.failure_code,
    folder: record.folder ?? '', tags: record.tags ?? [],
  };
}
