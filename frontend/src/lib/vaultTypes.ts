export type Credential = { id: string; capability: string };
export type VaultRecord = {
  id: string; accession: string; title: string; releaseAt: number; createdAt: number;
  mode: 'server-managed' | 'contract-backed'; submissionState: 'confirmed' | 'pending' | 'failed';
  available: boolean; transactionHash: string | null; failureCode: string | null;
  folder: string; tags: string[];
};
export type VaultConfig = { mode: string; available: boolean; custody: string; contractReason: string; serverTime: number };
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/vault${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Vault request failed. Retry shortly.');
  return result as T;
}
