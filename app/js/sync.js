// Sincronização opcional entre celular e computador.
// Os dados são criptografados NO APARELHO (AES-GCM 256, chave derivada da sua frase-senha via PBKDF2)
// e só então enviados para um Gist secreto da sua conta GitHub. Sem a frase-senha o conteúdo é ilegível.
// Token e frase-senha ficam apenas neste aparelho (localStorage), nunca no código nem no backup.
const SECRET_KEY = 'rumo:sync-secrets';
const FILE = 'rumo-dados.enc.json';
const API = 'https://api.github.com';

export function getSecrets() {
  try { return JSON.parse(localStorage.getItem(SECRET_KEY) || '{}'); } catch { return {}; }
}
export function setSecrets(s) { try { localStorage.setItem(SECRET_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function clearSecrets() { try { localStorage.removeItem(SECRET_KEY); } catch { /* ignore */ } }

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, updatedAt: obj.updatedAt, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export async function decrypt(wrapper, pass) {
  const key = await deriveKey(pass, unb64(wrapper.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(wrapper.iv) }, key, unb64(wrapper.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new Error('Frase-senha incorreta ou dados corrompidos.'); }
}

async function gh(path, token, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(r.status === 401 ? 'Token inválido ou sem permissão de Gists.' : `GitHub respondeu ${r.status}.`);
  return r.json();
}

export async function pushRemote(state, { token, pass, gistId }) {
  const content = JSON.stringify(await encrypt(state, pass));
  if (gistId) {
    await gh(`/gists/${gistId}`, token, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content } } }) });
    return gistId;
  }
  const g = await gh('/gists', token, { method: 'POST', body: JSON.stringify({ description: 'Rumo – dados criptografados', public: false, files: { [FILE]: { content } } }) });
  return g.id;
}

export async function pullRemote({ token, gistId }) {
  const g = await gh(`/gists/${gistId}`, token);
  const f = g.files?.[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return JSON.parse(text);
}
