// Estado da aplicação: um único objeto JSON persistido no aparelho (localStorage).
// Nada é enviado a servidores, a não ser que a sincronização criptografada seja ativada.
import { createSeed } from './seed.js';
import { now } from './time.js';
import { applyDemo } from './demo.js';

const KEY = 'rumo:estado:v1';
export const SCHEMA_VERSION = 1;

let state = null;
const listeners = new Set();
let memoryOnly = false;

export function uid(prefix = 'id') {
  const rnd = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
  return `${prefix}_${rnd.replace(/-/g, '').slice(0, 12)}`;
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    profile: { name: '', dailyGoalMin: 120, weeklyGoalMin: 720, sessionMin: 50, inactivityMin: 25, planMode: 'calendario', notify: true, quietStart: '22:30', quietEnd: '07:00' },
    prefs: { areas: [], locais: [], excluirLocais: [], cargos: [] },
    contests: [],      // concursos cadastrados manualmente ou "fixados" do radar
    radarHidden: [],   // ids do radar que o usuário ocultou
    my: {},            // acompanhamento: contestId -> {status, ...}
    subjects: [],      // matérias com assuntos do edital
    availability: [],  // janelas livres para estudar {id,dow,start,end}
    events: [],        // compromissos {id,title,type,dows|date,start,end,remind}
    tasks: [],         // tarefas/lembretes simples {id,title,date,dows,done}
    plan: { sessions: [], generatedAt: null, lastRecoverAt: null },
    cycle: { startedAt: null, items: [] },
    logs: [],          // sessões de estudo registradas
    reviews: [],       // revisões programadas
    simulados: [],
    appTime: {},       // 'YYYY-MM-DD' -> segundos com o app aberto e em uso
    alertsSeen: {},    // chave de alerta -> data em que foi notificado
    sync: { enabled: false, gistId: '', lastSyncAt: null },
    timer: null,
  };
}

export function load() {
  if (globalThis.RUMO_DEMO || (typeof location !== 'undefined' && /[?&]demo=1/.test(location.search))) {
    memoryOnly = true;
    state = emptyState(); Object.assign(state, createSeed(uid)); applyDemo(state, uid);
    return state;
  }
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { memoryOnly = true; }
  if (raw) {
    try { state = migrate(JSON.parse(raw)); } catch { state = null; }
  }
  if (!state) {
    state = emptyState();
    Object.assign(state, createSeed(uid));
    save();
  }
  return state;
}

function migrate(s) {
  const base = emptyState();
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  s.profile = { ...base.profile, ...s.profile };
  s.prefs = { ...base.prefs, ...s.prefs };
  s.version = SCHEMA_VERSION;
  return s;
}

export function get() { return state || load(); }

export function save() {
  state.updatedAt = now().toISOString();
  if (!memoryOnly) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { memoryOnly = true; }
  }
}

// Aplica uma mudança, salva e avisa a interface.
export function update(fn, { silent = false } = {}) {
  fn(state);
  save();
  if (!silent) listeners.forEach(l => l(state));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function isMemoryOnly() { return memoryOnly; }

export function exportJSON() { return JSON.stringify(state, null, 2); }

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.subjects)) throw new Error('Arquivo não parece um backup do Rumo.');
  state = migrate(parsed);
  save();
  listeners.forEach(l => l(state));
}

export function replaceState(next) { state = migrate(next); save(); listeners.forEach(l => l(state)); }

export function resetAll() {
  state = emptyState();
  Object.assign(state, createSeed(uid));
  save();
  listeners.forEach(l => l(state));
}

// Pede ao navegador para não apagar os dados em caso de pouco espaço.
export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}

// Para testes em Node
export function _setState(s) { state = migrate(s); }
export function _empty() { return emptyState(); }
