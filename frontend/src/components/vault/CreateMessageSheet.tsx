import { useRef, useState, type FormEvent } from 'react';
import { Download, LockKeyhole, LoaderCircle } from 'lucide-react';
import Workbench from './Workbench';
import { encryptMessage } from '../../lib/vaultCrypto';
import { exportRecovery, newCredential, readCredentials, saveCredentials } from '../../lib/vaultCredentials';
import { api, type VaultRecord } from '../../lib/vaultTypes';

export default function CreateMessageSheet({ close, created }: { close: () => void; created: (record: VaultRecord) => void }) {
  const credential = useRef(newCredential());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [releaseAt, setReleaseAt] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const release = new Date(releaseAt).getTime();
    if (!Number.isFinite(release) || release <= Date.now()) { setError('Choose a release date and time in the future.'); return; }
    if (!downloaded || !confirmed) { setError('Download your recovery file and confirm the timezone and key custody.'); return; }
    setPending(true);
    try {
      // Check browser persistence BEFORE the server accepts the record.
      saveCredentials(readCredentials());
      const encrypted = await encryptMessage(message);
      const response = await api<{ record: VaultRecord }>('/records', { ...credential.current, title, releaseAt: release, ...encrypted });
      const existing = readCredentials();
      saveCredentials([...existing.filter(c => c.id !== credential.current.id), credential.current]);
      encrypted.key = '';
      setMessage('');
      created(response.record);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not seal the message. Retry.'); }
    finally { setPending(false); }
  }

  function downloadRecovery() {
    try { exportRecovery([...readCredentials(), credential.current]); setDownloaded(true); setError(''); }
    catch { setError('Your browser could not download the recovery file. Allow downloads and retry.'); }
  }

  return <Workbench title="New message" close={() => { if (!pending) close(); }}>
    <p className="helper">Encrypt in this browser. The server escrows the key until the release time.</p>
    <form className="workbench-form" onSubmit={event => void submit(event)}>
      <label>Title<input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="A note for the future" required disabled={pending} /></label>
      <label>Message<textarea maxLength={8000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Write the words you want to keep until later…" required disabled={pending} /></label>
      <label>Release date and time<input type="datetime-local" value={releaseAt} onChange={e => setReleaseAt(e.target.value)} required disabled={pending} /></label>
      <p className="helper">Timezone: <strong>{zone}</strong>. Release uses authoritative server time, not your device clock.</p>
      <div className="custody-note"><LockKeyhole size={18} /><p><strong>Server-managed custody.</strong> Your ciphertext and a wrapped key are persisted. The server operator can access escrowed keys; this is not trustless or operator-blind encryption.</p></div>
      <div className="recovery-step"><strong>Save access before sealing</strong><p className="helper">This secret file restores access if browser storage is cleared. Anyone with it can access these records.</p><button type="button" className="button secondary" onClick={downloadRecovery} disabled={pending}><Download size={16} /> {downloaded ? 'Download again' : 'Download recovery file'}</button></div>
      <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required disabled={pending} /><span>I confirm the timezone and understand server-managed key custody.</span></label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="button primary" disabled={pending || !downloaded}><span>{pending ? <LoaderCircle size={16} className="spin" /> : <LockKeyhole size={16} />}</span>{pending ? 'Encrypting and saving…' : 'Encrypt and seal'}</button>
    </form>
  </Workbench>;
}
