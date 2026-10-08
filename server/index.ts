import express from 'express';
import path from 'node:path';
import { migrate } from './vaultRepository.ts';
import { vaultRoutes } from './vaultRoutes.ts';

await migrate();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use('/api/vault', vaultRoutes);
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Endpoint not found.' }); });
app.use(express.static(path.resolve('frontend/dist'), { index: false }));
app.get('/', (_req, res) => res.sendFile(path.resolve('frontend/dist/index.html')));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (error as { status?: number })?.status;
  res.status(status === 400 || status === 413 ? status : 503).json({ error: status === 413 ? 'Request is too large.' : status === 400 ? 'Invalid request format.' : 'Vault service is unavailable. Retry shortly.' });
});
app.listen(Number(process.env.PORT), '0.0.0.0', () => console.log('Vault HTTP service ready.'));
