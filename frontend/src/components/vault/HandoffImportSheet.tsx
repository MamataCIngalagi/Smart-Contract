import { useState, type FormEvent } from 'react';
import Workbench from './Workbench';
import { decryptHandoff, type HandoffEnvelope } from '../../lib/vaultHandoff';
import type { Credential } from '../../lib/vaultTypes';

export default function HandoffImportSheet({ envelope, close, restore }: { envelope: HandoffEnvelope; close: () => void; restore: (credentials: Credential[]) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    try { const credential = await decryptHandoff(envelope, passphrase, window.location.origin); await restore([credential]); setPassphrase(''); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import handoff.'); }
    finally { setPending(false); }
  }
  return <Workbench title="Import encrypted handoff" close={() => { if (!pending) { setPassphrase(''); close(); } }}>
    <p className="helper">Enter the passphrase received separately from the sender. It decrypts locally and is never sent to the server. Access remains locked until the release service permits opening.</p>
    <form className="workbench-form" onSubmit={event => void submit(event)}>
      <label>Handoff passphrase<input type="password" autoComplete="off" minLength={12} maxLength={256} required value={passphrase} onChange={event => setPassphrase(event.target.value)} disabled={pending} /></label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="button primary" disabled={pending}>{pending ? 'Decrypting and checking access…' : 'Decrypt and import access'}</button>
    </form>
  </Workbench>;
}
