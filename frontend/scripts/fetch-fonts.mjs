import fs from 'node:fs/promises';
import path from 'node:path';
const directory = path.resolve('frontend/public/fonts');
const output = path.join(directory, 'fonts.css');
try { await fs.access(output); process.exit(0); } catch { /* first download */ }
await fs.mkdir(directory, { recursive: true });
const response = await fetch('https://fonts.googleapis.com/css2?family=Rethink+Sans:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap', {
  headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
});
if (!response.ok) throw new Error('Font CSS download failed');
let css = await response.text();
const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(match => match[1]))];
for (const [index, url] of urls.entries()) {
  const name = `face-${index}${path.extname(new URL(url).pathname)}`;
  const binary = await fetch(url);
  if (!binary.ok) throw new Error('Font file download failed');
  await fs.writeFile(path.join(directory, name), Buffer.from(await binary.arrayBuffer()));
  css = css.replaceAll(url, `/fonts/${name}`);
}
await fs.writeFile(output, css);
console.log('Selected free fonts are served locally.');
