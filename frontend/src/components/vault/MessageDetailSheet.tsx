import { useState } from 'react';
import { Clock3, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, UnlockKeyhole } from 'lucide-react';
import Workbench from './Workbench';
import { readCredentials } from '../../lib/vaultCredentials';
import { decryptMessage } from '../../lib/vaultCrypto';
import { api, type VaultRecord } from '../../lib/vaultTypes';
import { releaseDate } from '../../pages/VaultPage';
import MessageTools from './MessageTools';

function relative(timestamp: number) {
  const left = Math.max(0, timestamp - Date.now());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  if (left === 0) return 'Release time reached; verify with the service to open.';
  if (hours >= 24) return `In ${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `In ${hours}h ${minutes}m`;
}

export default function MessageDetailSheet({ record, close, updated, reminder, toggleReminder, reminderNotice }: { record: VaultRecord; close: () => void; updated: (value: VaultRecord) => void; reminder: boolean; toggleReminder: () => void; reminderNotice: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);

  async function openMessage() {
    setPending(true); setError('');
    try {
      const credential = readCredentials().find(item => item.id === record.id);
      if (!credential) throw new Error('This browser no longer has this record’s access credential. Import its recovery file.');
      const result = await api<{ key: string; serverTime: number }>(`/records/${record.id}/release`, { capability: credential.capability });
      const response = await fetch(`/api/vault/records/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ credentials: [credential] }), cache: 'no-store',
      });
      if (!response.ok) throw new Error('Could not load the authorized encrypted message. Retry.');
      const payload = await response.json() as { records: Array<VaultRecord & { ciphertext: string; nonce: string }> };
      const encrypted = payload.records.find(item => item.id === record.id);
      if (!encrypted) throw new Error('This message is unavailable. Import a valid recovery file or retry.');
      const clear = await decryptMessage(encrypted.ciphertext, encrypted.nonce, result.key);
      setPlaintext(clear);
      const refreshed = { ...record, available: true };
      updated(refreshed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The release service could not open this message.');
    } finally { setPending(false); }
  }

  return <Workbench title="Message details" close={() => { setPlaintext(null); close(); }}>
    <p className="accession detail-accession"><i />{record.accession}</p>
    <h3>{record.title}</h3>
    <dl className="detail-list">
      <dt>Release time</dt><dd>{releaseDate(record.releaseAt)} <span className="relative-time">· {relative(record.releaseAt)}</span></dd>
      <dt>Storage mode</dt><dd>Server-managed key escrow</dd>
      <dt>Release status</dt><dd><span className={`status-marker ${record.available ? 'ready' : ''}`}>{record.available ? 'Ready to verify' : 'Locked'}</span></dd>
      <dt>Chain evidence</dt><dd>No blockchain transaction. This record is server-managed.</dd>
    </dl>
    {!plaintext ? <section className="release-panel">
      {record.available ? <><h3><UnlockKeyhole size={17} /> Available to open</h3><p className="helper">The service rechecks its clock and access credential before releasing the decryption key.</p></> : <><h3><LockKeyhole size={17} /> Sealed until release</h3><p className="helper"><Clock3 size={15} /> {relative(record.releaseAt)} · {releaseDate(record.releaseAt)}</p></>}
      <p className="helper">The record text remains encrypted and is not shown in details.</p>
      <button className="button primary detail-action" onClick={() => void openMessage()} disabled={pending}>
        {pending ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}{pending ? 'Checking release…' : 'Open message'}
      </button>
      {error && <p className="error-text" role="alert">{error}</p>}
    </section> : <section className="plaintext-panel" aria-live="polite">
      <p className="released-label"><ShieldCheck size={16} /> Released by server time · decrypted in this browser</p>
      <div className="plaintext-copy">{plaintext}</div>
      <button className="button secondary detail-action" onClick={() => setPlaintext(null)}>Close message</button>
    </section>}
    <p className="helper">The server holds the wrapped key and can access message contents. Close this panel to clear plaintext from the interface.</p>
    <MessageTools record={record} updated={updated} reminder={reminder} toggleReminder={toggleReminder} />
    {reminderNotice && <p className="helper" role="status">{reminderNotice}</p>}
  </Workbench>;
}
