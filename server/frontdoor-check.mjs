const root = process.env.LOGEN_APP_ORIGIN;
if (!root) throw new Error('Platform origin is unavailable');
const front = await fetch(root);
const html = await front.text();
console.log('Front door:', front.status, front.headers.get('content-type'));
if (!front.ok || !html.includes('Smart-Contract — Vault')) throw new Error('The front door did not serve the vault HTML');
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
if (!asset) throw new Error('Compiled React entry was not found');
const script = await fetch(new URL(asset, root));
if (!script.ok) throw new Error('Compiled script unavailable');
const config = await fetch(new URL('/api/vault/config', root));
const settings = await config.json();
console.log('Deployed mode:', settings.mode);
const empty = await fetch(new URL('/api/vault/records/query', root), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentials: [] }),
});
const data = await empty.json();
if (!empty.ok || data.records?.length !== 0) throw new Error('Fresh empty capability registry is broken');
console.log('Compiled frontend and fresh vault API are serving.');
