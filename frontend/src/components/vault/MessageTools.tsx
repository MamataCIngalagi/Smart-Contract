import { useState, type FormEvent } from 'react';
import { api, type VaultRecord } from '../../lib/vaultTypes';
import { readCredentials } from '../../lib/vaultCredentials';
import { encryptHandoff, downloadHandoff } from '../../lib/vaultHandoff';

export default function MessageTools({ record, updated, reminder, toggleReminder }: { record: VaultRecord; updated: (record: VaultRecord) => void; reminder: boolean; toggleReminder: () => void }) {
  const [folder, setFolder] = useState(record.folder ?? '');
  const [tags, setTags] = useState((record.tags ?? []).join(', '));
  const [passphrase, setPassphrase] = useState(''); const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  function credential() { const value = readCredentials().find(c => c.id === record.id); if (!value) throw new Error('Import a valid recovery file for this message first.'); return value; }
  async function organize(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(''); setNotice('');
    try {
      const { record: result } = await api<{ record: VaultRecord }>(`/records/${record.id}/organization`, { capability: credential().capability, folder, tags: tags.split(',').map(t => t.trim()).filter(Boolean) });
      updated(result); setNotice('Folder and tags saved. Anyone with this message’s access can see or change its organization.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save organization.'); }
    finally { setPending(false); }
  }
  async function handoff(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(''); setNotice('');
    try {
      if (passphrase !== confirm) throw new Error('Passphrases must match.');
      const envelope = await encryptHandoff(credential(), passphrase, window.location.origin);
      downloadHandoff(envelope); setPassphrase(''); setConfirm('');
      setNotice('Encrypted handoff downloaded for this message only. Send the passphrase through a separate channel.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not export handoff.'); }
    finally { setPending(false); }
  }
  return <section className="message-tools">
    <h3>Folder and tags</h3>
    <form className="compact-form" onSubmit={event => void organize(event)}>
      <label>Folder<input maxLength={80} value={folder} onChange={event => setFolder(event.target.value)} placeholder="Unfiled" disabled={pending} /></label>
      <label>Tags, separated by commas<input value={tags} onChange={event => setTags(event.target.value)} maxLength={340} placeholder="personal, future" disabled={pending} /></label>
      <p className="helper">Up to 10 tags. Folder names and tags are visible to the server and anyone holding this message’s access.</p>
      <button className="button secondary" disabled={pending}>Save organization</button>
    </form>
    <h3>Unlock reminder</h3><p className="helper">Opt in on this browser. Keep this vault tab open; no closed-browser push or message text is sent.</p>
    <button className="button secondary detail-action" onClick={toggleReminder} aria-pressed={reminder}>{reminder ? 'Remove unlock reminder' : 'Enable unlock reminder'}</button>
    <details className="handoff-details"><summary>Hand off access to this message</summary>
      <p className="helper">Only this message’s credential is exported, encrypted with your passphrase. The recipient imports the file at this same vault address. Send a strong, unique passphrase separately.</p>
      <p className="helper">Recipients can open after release and forward access. This shares access, not exclusive ownership; it cannot be revoked. No plaintext or decryption key is exported.</p>
      <form className="compact-form" onSubmit={event => void handoff(event)}>
        <label>Handoff passphrase<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={passphrase} onChange={event => setPassphrase(event.target.value)} disabled={pending} /></label>
        <label>Confirm handoff passphrase<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={event => setConfirm(event.target.value)} disabled={pending} /></label>
        <button className="button primary" disabled={pending}>{pending ? 'Working…' : 'Download encrypted handoff'}</button>
      </form>
    </details>
    {error && <p className="error-text" role="alert">{error}</p>}{notice && <p className="helper" role="status">{notice}</p>}
  </section>;
}
