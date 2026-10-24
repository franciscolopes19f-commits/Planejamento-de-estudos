import crypto from 'node:crypto';
import { parseCookies, HttpError } from './http.js';

const COOKIE = 'nt_admin';
const SESSION_DAYS = 14;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const hash = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(h, 'base64');
  return ref.length === hash.length && crypto.timingSafeEqual(ref, hash);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** Garante um usuário administrador. Usa ADMIN_EMAIL/ADMIN_PASSWORD; sem eles, gera senha aleatória e exibe no console. */
export function ensureOwner(db, env, log = console.log) {
  const n = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (n > 0) return null;
  const email = (env.ADMIN_EMAIL || 'admin@nutauro.local').toLowerCase();
  const generated = !env.ADMIN_PASSWORD;
  const password = env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD deve ter ao menos 8 caracteres.');
  db.prepare('INSERT INTO users(email, name, role, pass_hash) VALUES (?,?,?,?)').run(email, 'Administrador', 'owner', hashPassword(password));
  if (generated) {
    log(`\n  Acesso inicial ao painel: ${email} / ${password}\n  Troque a senha em Mais → Conta, ou defina ADMIN_EMAIL e ADMIN_PASSWORD.\n`);
  }
  return { email, password, generated };
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions(id, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, expires);
  return { token, expires };
}

export function sessionCookie(token, expires, secure) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(expires).toUTCString()}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function currentUser(db, req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(sha(token));
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function destroySession(db, req) {
  const token = parseCookies(req)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(token));
}

/** Exige sessão; para métodos que alteram dados, exige também o cabeçalho anti-CSRF. */
export function requireAdmin(db, req) {
  const user = currentUser(db, req);
  if (!user) throw new HttpError(401, 'Faça login para continuar.');
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'nutauro-admin') {
    throw new HttpError(403, 'Requisição bloqueada.');
  }
  return user;
}

// Limite simples de tentativas de login por IP (memória do processo).
const attempts = new Map();
export function loginRateLimit(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60_000);
  if (a.length >= 10) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  a.push(now);
  attempts.set(ip, a);
}
export function loginSucceeded(ip) {
  attempts.delete(ip);
}
