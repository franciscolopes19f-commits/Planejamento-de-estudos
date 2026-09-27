// Conta e sincronização via Supabase (login com código de 6 dígitos enviado por e-mail).
// Usa diretamente as APIs HTTP do Supabase (Auth + PostgREST), sem bibliotecas externas.
// A URL do projeto e a chave "anon"/"publishable" são públicas por natureza; a proteção dos dados é feita
// pelas regras de acesso (RLS) do banco: cada usuário só lê e grava a própria linha.
import { eq, mergeStates, toCloud } from './merge.js';

const SESSION_KEY = 'rumo:sessao';
const BASE_KEY = 'rumo:sync-base';
const CONFIG_KEY = 'rumo:supabase-config';
const TABLE = 'rumo_dados';

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export function config() {
  const own = ls.get(CONFIG_KEY);
  if (own?.url && own?.anonKey) return { url: own.url.replace(/\/$/, ''), anonKey: own.anonKey, source: 'aparelho' };
  const g = globalThis.RUMO_CONFIG || {};
  if (g.supabaseUrl && g.supabaseAnonKey) return { url: g.supabaseUrl.replace(/\/$/, ''), anonKey: g.supabaseAnonKey, source: 'publicacao' };
  return null;
}
export function setLocalConfig(url, anonKey) { ls.set(CONFIG_KEY, url && anonKey ? { url: url.trim(), anonKey: anonKey.trim() } : null); }
export const isConfigured = () => !!config();

export function session() { return ls.get(SESSION_KEY); }
export function signOut() { ls.set(SESSION_KEY, null); ls.set(BASE_KEY, null); }
export function hasBase() { return !!ls.get(BASE_KEY); }

export class CloudError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

function friendly(status, body) {
  const raw = `${body?.msg || body?.message || body?.error_description || body?.error || ''}`;
  if (/not authorized/i.test(raw)) return new CloudError('Este e-mail não pode receber códigos no plano gratuito. Use o mesmo e-mail da conta que criou o projeto no Supabase (ou configure um serviço de e-mail próprio).', 'email_not_authorized');
  if (status === 429 || /rate limit|security purposes/i.test(raw)) return new CloudError('Limite de envio de e-mails atingido (o plano gratuito envia poucos e-mails por hora). Espere alguns minutos e tente de novo; se já recebeu um código há pouco, use-o.', 'rate_limit');
  if (/expired|invalid/i.test(raw) && /otp|token/i.test(raw)) return new CloudError('Código inválido ou expirado. Peça um novo código.', 'otp_invalid');
  if (/signups not allowed|signup.*disabled/i.test(raw)) return new CloudError('Cadastro de novos usuários está desativado neste projeto. Use o e-mail já cadastrado.', 'signup_disabled');
  if (status === 401 || status === 403) return new CloudError('Sessão expirada. Entre novamente.', 'auth');
  return new CloudError(raw || `Erro ${status} no servidor.`, 'server');
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const cfg = config(); if (!cfg) throw new CloudError('Sincronização ainda não configurada.', 'no_config');
  let r;
  try {
    r = await fetch(cfg.url + path, {
      method,
      headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new CloudError('Sem conexão com o servidor. Seus dados continuam salvos neste aparelho.', 'offline'); }
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw friendly(r.status, data);
  return data;
}

// 1) Pede o código. create_user permite o primeiro acesso; depois recomenda-se desligar novos cadastros no painel.
export async function sendCode(email) {
  await call('/auth/v1/otp', { method: 'POST', body: { email: email.trim().toLowerCase(), create_user: true } });
}

function storeSession(d) {
  const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user_id: d.user?.id, email: d.user?.email };
  ls.set(SESSION_KEY, s);
  return s;
}

// 2) Confere o código digitado dentro do app (funciona no app instalado na Tela de Início do iPhone).
export async function verifyCode(email, code) {
  const d = await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: email.trim().toLowerCase(), token: code.trim() } });
  return storeSession(d);
}

async function token() {
  let s = session(); if (!s) throw new CloudError('Entre na sua conta para sincronizar.', 'auth');
  if (Date.now() > s.expires_at - 60000) {
    try {
      s = storeSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } }));
    } catch (e) {
      if (e.code !== 'offline') ls.set(SESSION_KEY, null);
      throw e;
    }
  }
  return s;
}

export async function pull() {
  const s = await token();
  const rows = await call(`/rest/v1/${TABLE}?select=data,rev,updated_at&user_id=eq.${s.user_id}`, { token: s.access_token });
  return rows?.[0] || null;
}

async function push(data, prevRev) {
  const s = await token();
  if (prevRev == null) {
    try {
      const rows = await call(`/rest/v1/${TABLE}`, { method: 'POST', token: s.access_token, headers: { Prefer: 'return=representation' }, body: { user_id: s.user_id, data, rev: 1 } });
      return rows?.[0]?.rev ?? 1;
    } catch (e) { if (/duplicate|conflict|23505/i.test(e.message)) return null; throw e; }
  }
  const rows = await call(`/rest/v1/${TABLE}?user_id=eq.${s.user_id}&rev=eq.${prevRev}`, { method: 'PATCH', token: s.access_token, headers: { Prefer: 'return=representation' }, body: { data, rev: prevRev + 1, updated_at: new Date().toISOString() } });
  return rows?.length ? rows[0].rev : null; // null = outro aparelho gravou antes; tenta de novo
}

/**
 * Sincroniza nos dois sentidos. `mode` na primeira conexão do aparelho:
 *  'merge' (junta), 'cloud' (usa os da nuvem), 'local' (envia os deste aparelho).
 * Retorna { state: estado final para usar localmente ou null se nada mudou localmente, pushed }.
 */
export async function syncNow(localState, { mode = 'merge' } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await pull();
    const base = ls.get(BASE_KEY);
    const local = toCloud(localState);
    let merged;
    if (!row) merged = local;
    else if (!base && mode === 'cloud') merged = row.data;
    else if (!base && mode === 'local') merged = local;
    else merged = mergeStates(base, localState, row.data);
    let rev = row?.rev ?? null;
    if (!row || !eq(merged, row.data)) {
      rev = await push(merged, row ? row.rev : null);
      if (rev == null) continue;
    }
    ls.set(BASE_KEY, merged);
    return { state: eq(merged, local) ? null : merged, pushed: !row || !eq(merged, row.data), rev };
  }
  throw new CloudError('Não foi possível sincronizar agora (muitas alterações simultâneas). Tente de novo.', 'conflict');
}

export async function remoteExists() { return !!(await pull()); }
