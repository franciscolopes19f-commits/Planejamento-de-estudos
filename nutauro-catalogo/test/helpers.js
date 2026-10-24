import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, saveSetting, getSettings } from '../server/db.js';
import { createApp } from '../server/app.js';

export async function startApp({ env = {}, fetchImpl, seedDemo = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-test-'));
  const db = openDb(':memory:');
  const fullEnv = { ADMIN_EMAIL: 'admin@teste.com', ADMIN_PASSWORD: 'senha-segura-1', SEED_DEMO: seedDemo ? '1' : '0', NODE_ENV: 'test', ...env };
  const app = createApp({ db, env: fullEnv, dataDir, fetchImpl: fetchImpl || (async () => { throw new Error('rede desativada no teste'); }), log: () => {} });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function req(method, url, body, { admin = false, headers = {} } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (admin) { h['X-Requested-With'] = 'nutauro-admin'; if (cookie) h.Cookie = cookie; }
    const r = await fetch(base + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, body: json, text, headers: r.headers };
  }
  const login = () => req('POST', '/api/admin/login', { email: 'admin@teste.com', password: 'senha-segura-1' }, { admin: true });
  const configure = (patch) => { for (const [k, v] of Object.entries(patch)) saveSetting(db, k, { ...getSettings(db)[k], ...v }); };
  const close = () => { app.close(); server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); };
  return { db, base, req, login, configure, close, env: fullEnv };
}

export function variantBySku(db, sku) {
  return db.prepare('SELECT * FROM variants WHERE sku = ?').get(sku);
}

export const customer = { name: 'Cliente Teste', phone: '(21) 98888-7777' };
export const addressCaxias = { cep: '25010-000', street: 'Rua A', number: '10', district: 'Centro', city: 'Duque de Caxias', uf: 'RJ' };
