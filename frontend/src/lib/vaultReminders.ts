import { useEffect, useState } from 'react';
import type { VaultRecord } from './vaultTypes';

const STORAGE = 'smart-contract-reminders-v1';
type ReminderRegistry = Record<string, { notified: boolean }>;
function read(): ReminderRegistry {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, item]) => /^[0-9a-f-]{36}$/i.test(id) && item && typeof item === 'object' && typeof (item as { notified?: unknown }).notified === 'boolean')) as ReminderRegistry;
  } catch { return {}; }
}
export function useVaultReminders(records: VaultRecord[]) {
  const [registry, setRegistry] = useState<ReminderRegistry>(read);
  const [notice, setNotice] = useState('');
  function persist(value: ReminderRegistry) { localStorage.setItem(STORAGE, JSON.stringify(value)); setRegistry(value); }
  async function toggle(id: string) {
    setNotice('');
    try {
      const current = read();
      if (current[id]) { delete current[id]; persist(current); setNotice('Reminder removed from this browser.'); return; }
      if (!('Notification' in window)) throw new Error('Browser notifications are unavailable here.');
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') throw new Error('Notifications were not allowed. Enable them in browser site settings to opt in.');
      current[id] = { notified: false }; persist(current);
      setNotice('Reminder enabled for this browser. Keep the vault tab open; notifications never include message text or titles.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save this reminder.'); }
  }
  useEffect(() => {
    const synchronize = (event: StorageEvent) => { if (event.key === STORAGE) setRegistry(read()); };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const next = read(); let changed = false;
    for (const record of records) {
      // Only the API's authoritative flag qualifies; device time never unlocks.
      if (!record.available || !next[record.id] || next[record.id].notified) continue;
      try {
        const notification = new Notification('Vault release available', { body: 'A message is ready. Open your vault to verify its release.', tag: `vault-${record.id}` });
        notification.onclick = () => { window.focus(); notification.close(); };
        next[record.id] = { notified: true }; changed = true;
      } catch { setNotice('This browser could not display notifications. Your vault still shows release status.'); }
    }
    if (changed) { try { persist(next); } catch { setNotice('Could not save reminder status. Browser storage must be enabled.'); } }
  }, [records, registry]);
  return { registry, toggle, notice };
}
