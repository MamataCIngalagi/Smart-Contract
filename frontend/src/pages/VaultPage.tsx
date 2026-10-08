import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowRight, Plus, RefreshCw, LockKeyhole, MoreHorizontal, Info, Search, Download, Upload } from 'lucide-react';
import { api, type VaultConfig, type VaultRecord, type Credential } from '../lib/vaultTypes';
import { readCredentials, parseRecovery, saveCredentials, exportRecovery } from '../lib/vaultCredentials';
import CreateMessageSheet from '../components/vault/CreateMessageSheet';
import MessageDetailSheet from '../components/vault/MessageDetailSheet';
import WorkbenchImport from '../components/vault/HandoffImportSheet';
import { parseHandoff, type HandoffEnvelope } from '../lib/vaultHandoff';
import { useVaultReminders } from '../lib/vaultReminders';

export function releaseDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default function VaultPage() {
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<VaultRecord | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Locked' | 'Ready'>('All');
  const [importing, setImporting] = useState(false);
  const [handoff, setHandoff] = useState<HandoffEnvelope | null>(null);
  const [folderFilter, setFolderFilter] = useState(''); const [tagFilter, setTagFilter] = useState('');
  const reminders = useVaultReminders(records);
  const folders = [...new Set(records.map(record => record.folder).filter(Boolean))].sort();
  const tags = [...new Set(records.flatMap(record => record.tags ?? []))].sort();
  const fileInput = useRef<HTMLInputElement>(null);
  const displayed = useMemo(() => records.filter(record => {
    const query = search.trim().toLowerCase();
    return (!query || [record.title, record.accession, record.folder ?? '', ...(record.tags ?? [])].some(value => value.toLowerCase().includes(query)))
      && (!folderFilter || (folderFilter === '__unfiled__' ? !record.folder : record.folder === folderFilter))
      && (!tagFilter || (record.tags ?? []).includes(tagFilter))
      && (filter === 'All' || (filter === 'Ready' ? record.available : !record.available));
  }).sort((a,b) => a.releaseAt - b.releaseAt || a.id.localeCompare(b.id)), [records, search, filter, folderFilter, tagFilter]);
  const close = useCallback(() => { setCreating(false); setSelected(null); setHandoff(null); }, []);
  const refresh = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      const [settings, result] = await Promise.all([
        api<VaultConfig>('/config'), api<{ records: VaultRecord[] }>('/records/query', { credentials: readCredentials() }),
      ]);
      setConfig(settings); setRecords(result.records);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vault could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function restore(candidates: Credential[]) {
    const resolved = await api<{ records: VaultRecord[] }>('/records/query', { credentials: candidates });
    const authorized = new Set(resolved.records.map(record => record.id));
    const accepted = candidates.filter(credential => authorized.has(credential.id));
    if (!accepted.length) throw new Error('No accessible records were restored. Check that this is the correct recovery file and app.');
    const combined = new Map(readCredentials().map(credential => [credential.id, credential]));
    for (const credential of accepted) combined.set(credential.id, credential);
    saveCredentials([...combined.values()]);
    setNotice(`Restored access to ${accepted.length} ${accepted.length === 1 ? 'record' : 'records'}. Unauthorized entries were not imported.`);
    await refresh();
  }
  async function importFile(file: File) {
    setImporting(true); setNotice('');
    try {
      if (file.size > 128_000) throw new Error('Recovery file is too large. Choose the exported JSON file.');
      const text = await file.text();
      let kind: unknown;
      try { kind = JSON.parse(text)?.kind; } catch { /* parseRecovery gives the user-facing JSON error */ }
      if (kind === 'encrypted-handoff') { setHandoff(parseHandoff(text)); return; }
      await restore(parseRecovery(text));
    } catch (reason) { setNotice('Import failed: ' + (reason instanceof Error ? reason.message : 'Invalid recovery file.')); }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const result = await api<{ records: VaultRecord[] }>('/records/query', { credentials: readCredentials() });
        setRecords(result.records);
        setSelected(previous => previous ? result.records.find(record => record.id === previous.id) ?? null : null);
      } catch { /* A failed background check never promotes Locked to Ready. Manual Retry remains available. */ }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="product-shell">
    <div className="canvas" ref={node => { if (node) node.inert = Boolean(creating || selected || handoff); }}>
      <header className="appbar">
        <a className="brand" href="/"><Archive size={21} /><span>Smart-Contract</span></a>
        <span className="active-nav">Vault</span>
        <div className="bar-spacer" />
        <span className="mode-label"><span className="mode-dot" />{config ? 'Server-managed' : 'Checking mode…'}</span>
        <button className="icon-btn mobile-mode" aria-label="Storage mode information" aria-expanded={modeOpen} onClick={() => setModeOpen(!modeOpen)}><MoreHorizontal size={20} /></button>
        <button className="button primary" onClick={() => setCreating(true)}><Plus size={17} />New message</button>
      </header>
      {modeOpen && <div className="mobile-mode-info"><Info size={17} />Server-managed key custody; no blockchain receipt is claimed.</div>}
      <main className="working-canvas">
        <section className="vault-toolbar">
          <div className="title-row"><div><h1>Vault</h1><span className="count">{records.length} {records.length === 1 ? 'record' : 'records'}</span></div><button className="button secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} />Refresh</button></div>
          <p className="helper">Your browser holds the access credentials. Messages stay sealed until the server permits release.</p>
          <div className="search-filter-row">
            <label className="search-control"><Search size={17} /><input aria-label="Search titles or references" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title or reference" /></label>
            <div className="filter-controls" role="group" aria-label="Release status filter">{(['All','Locked','Ready'] as const).map(value => <button key={value} className={`filter-button ${filter === value ? 'selected' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
            <div className="recovery-controls"><button className="button secondary" onClick={() => fileInput.current?.click()} disabled={importing}><Upload size={16} />{importing ? 'Importing…' : 'Import recovery'}</button><button className="button secondary" onClick={() => exportRecovery(readCredentials())} disabled={records.length === 0}><Download size={16} /><span>Export recovery</span></button></div>
            <input className="file-input" ref={fileInput} type="file" accept="application/json,.json" aria-label="Import recovery file" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
          </div>
          <div className="organization-filters">
            <label>Folder<select value={folderFilter} onChange={event => setFolderFilter(event.target.value)}><option value="">All folders</option><option value="__unfiled__">Unfiled</option>{folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label>
            <label>Tag<select value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">All tags</option>{tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></label>
            <p className="helper">Open a message to organize, hand off access, or enable an unlock reminder.</p>
          </div>
        </section>
        {notice && <p className={`success-notice ${notice.startsWith('Import failed') ? 'import-error' : ''}`} role={notice.startsWith('Import failed') ? 'alert' : 'status'}>{notice}</p>}
        {error ? <section className="service-error" role="alert"><h2>Could not load your vault</h2><p>{error}</p><button className="button secondary" onClick={() => void refresh()}>Retry</button></section> :
          <section className="register" aria-busy={loading}>
            <div className="register-head"><span>ACCESSION</span><span>TITLE</span><span>RELEASE TIME</span><span>STATUS</span><span aria-label="Action" /></div>
            {loading ? <div className="register-loading" role="status">Reading vault records…{[0,1,2].map(n => <div className="loading-row" key={n}><span /><span /><span /><span /></div>)}</div> : records.length === 0 ?
              <div className="empty-register"><div className="empty-symbol"><LockKeyhole size={25} /></div><h2>Create your first locked message</h2><p>Write a note, choose its release time, and download a secret recovery file. No account or wallet is needed in server-managed mode.</p><button className="button primary" onClick={() => setCreating(true)}><Plus size={17} />New message</button><button className="button secondary empty-import" onClick={() => fileInput.current?.click()} disabled={importing}><Upload size={16} />Import recovery file</button><p className="empty-hint">Clearing browser storage without a recovery file loses access. Keep recovery files secret.</p></div> : displayed.length === 0 ?
              <div className="empty-register filtered-empty"><h2>No matching messages</h2><p>Try another title, folder, tag, or reference, or clear the current filters.</p><button className="button secondary" onClick={() => { setSearch(''); setFilter('All'); setFolderFilter(''); setTagFilter(''); }}>Reset search and filters</button></div> :
              displayed.map(record => <button className="register-row" key={record.id} onClick={() => setSelected(record)}>
                <span className="accession"><i />{record.accession}</span><span className="record-title">{record.title}<span className="record-organization">{[record.folder, ...(record.tags ?? []).map(tag => `#${tag}`)].filter(Boolean).join(' · ')}</span></span><span className="release-cell">{releaseDate(record.releaseAt)}<span className="relative-release">{record.available ? 'Release authorized' : `About ${Math.max(0, Math.ceil((record.releaseAt - Date.now()) / 60000))}m remaining · informational`}</span></span><span className={`status-marker ${record.available ? 'ready' : ''}`}>{record.submissionState === 'confirmed' ? record.available ? 'Ready' : 'Locked' : record.submissionState}</span><ArrowRight size={18} />
              </button>)}
          </section>}
        <div className="custody-line"><Info size={16} /><span>Server-managed mode: keys are escrowed by this service. Blockchain enforcement is not configured.</span></div>
      </main>
    </div>
    {creating && <CreateMessageSheet close={close} created={() => { close(); setNotice('Message encrypted and sealed. Access credentials saved in this browser.'); void refresh(); }} />}
    {selected && <MessageDetailSheet key={selected.id} record={selected} close={close} updated={value => { setSelected(value); setRecords(previous => previous.map(item => item.id === value.id ? value : item)); }} reminder={Boolean(reminders.registry[selected.id])} toggleReminder={() => void reminders.toggle(selected.id)} reminderNotice={reminders.notice} />}
    {handoff && <WorkbenchImport envelope={handoff} close={close} restore={restore} />}
  </div>;
}
