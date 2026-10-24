import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const db = openDb(path.join(dataDir, 'nutauro.db'));
const { handler } = createApp({ db, env: process.env, dataDir });

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
http.createServer(handler).listen(port, host, () => {
  console.log(`Nutauro: loja em http://localhost:${port}  ·  painel em http://localhost:${port}/admin`);
});
