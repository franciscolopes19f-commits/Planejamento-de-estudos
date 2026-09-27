import * as store from './store.js';
import { todayISO, fmtDur } from './time.js';
import { mergeContests } from './radar.js';
import { computeAlerts, notifyNew } from './alerts.js';
import { elapsedMs, tick, awayDecision, confirmActive, pause } from './timer.js';
import { scheduleReviews, generatePlan } from './planner.js';
import { icon, LOGO, openModal, closeModal, modalHead, toast, modalOpen } from './ui.js';
import * as sync from './sync.js';

import todayView from './views/today.js';
import planView from './views/plan.js';
import studyView from './views/study.js';
import contestsView from './views/contests.js';
import evolutionView from './views/evolution.js';
import reviewsView from './views/reviews.js';
import subjectsView from './views/subjects.js';
import routineView from './views/routine.js';
import settingsView from './views/settings.js';
import moreView from './views/more.js';

const ROUTES = {
  hoje: todayView, plano: planView, estudar: studyView, concursos: contestsView, evolucao: evolutionView,
  revisoes: reviewsView, materias: subjectsView, rotina: routineView, config: settingsView, mais: moreView,
};
const NAV = [
  ['hoje', 'Hoje', 'home'], ['plano', 'Plano', 'calendar'], ['estudar', 'Estudar', 'play'], ['concursos', 'Concursos', 'trophy'], ['mais', 'Mais', 'grid'],
];
const SIDE = [
  ['hoje', 'Hoje', 'home'], ['plano', 'Plano de estudos', 'calendar'], ['concursos', 'Concursos', 'trophy'], ['materias', 'Edital e matérias', 'list'],
  ['revisoes', 'Revisões', 'repeat'], ['evolucao', 'Evolução', 'chart'], ['rotina', 'Minha rotina', 'briefcase'], ['config', 'Configurações', 'settings'],
];
const MORE_ROUTES = ['evolucao', 'revisoes', 'materias', 'rotina', 'config', 'mais'];

const radar = { atualizadoEm: null, concursos: [], noticias: [], fontes: [], loaded: false, error: null };

export const app = {
  get state() { return store.get(); },
  radar,
  route: 'hoje', params: [],
  get today() { return todayISO(); },
  contests() { return mergeContests(radar.concursos, store.get().contests, store.get().radarHidden); },
  update(fn, opts) { store.update(fn, opts); },
  go(path) { if (location.hash !== '#/' + path) location.hash = '#/' + path; else render(); },
  render: () => render(),
  subject(id) { return store.get().subjects.find(s => s.id === id); },
  topic(subjectId, topicId) { return app.subject(subjectId)?.topics.find(t => t.id === topicId); },
  contest(id) { return app.contests().find(c => c.id === id); },
  uid: store.uid,
  addLog,
  regenerate(opts = {}) { store.update(s => generatePlan(s, app.contests(), { uid: store.uid, ...opts })); },
};

function addLog(log, { markTopicDone = false } = {}) {
  store.update(s => {
    const entry = { id: store.uid('log'), createdAt: new Date().toISOString(), questoes: 0, acertos: 0, erros: 0, ...log };
    s.logs.push(entry);
    if (entry.planSessionId) {
      const ps = s.plan.sessions.find(x => x.id === entry.planSessionId);
      if (ps) { ps.status = 'feito'; ps.logId = entry.id; }
    }
    if (markTopicDone && entry.topicId) {
      const t = s.subjects.find(x => x.id === entry.subjectId)?.topics.find(t => t.id === entry.topicId);
      if (t && !t.done) { t.done = true; t.doneAt = entry.date; }
    }
    scheduleReviews(s, entry, store.uid);
  });
}

// ---------- Shell ----------
function shell() {
  const t = store.get().timer;
  const running = t ? `<a class="running-pill" href="#/estudar">${icon(t.running ? 'clock' : 'pause')}<span data-live-timer>${fmtDur(elapsedMs(t) / 1000, { showSec: true })}</span></a>` : '';
  const active = MORE_ROUTES.includes(app.route) ? 'mais' : app.route;
  return `
  <div class="shell">
    <aside class="sidebar" aria-label="Menu">
      <a class="brand" href="#/hoje"><span class="brand-mark">${LOGO}</span><span>Rumo<small>estudos para concursos</small></span></a>
      <a class="btn primary block side-cta" href="#/estudar">${icon('play')} ${t ? 'Voltar ao estudo' : 'Iniciar estudo'}</a>
      ${SIDE.map(([r, l, i]) => `<a class="nav ${app.route === r ? 'active' : ''}" href="#/${r}">${icon(i)}${l}</a>`).join('')}
      <div class="side-foot">Dados salvos neste aparelho${store.get().sync.enabled ? ' · sincronização ativa' : ''}.</div>
    </aside>
    <div>
      <main class="main" id="view">
        <div class="topbar"><a class="brand" href="#/hoje"><span class="brand-mark">${LOGO}</span>Rumo</a><div class="row">${running}</div></div>
        <div id="page"></div>
      </main>
    </div>
    <nav class="bottom-nav" aria-label="Navegação principal">
      ${NAV.map(([r, l, i]) => r === 'estudar'
        ? `<a class="nav-play ${t ? 'running' : ''} ${active === r ? 'active' : ''}" href="#/estudar" aria-label="Estudar"><span class="fab">${icon(t?.running ? 'pause' : 'play')}</span>${t ? 'Em curso' : l}</a>`
        : `<a class="${active === r ? 'active' : ''}" href="#/${r}">${icon(i)}${l}</a>`).join('')}
    </nav>
  </div>`;
}

let currentView = null;
function render() {
  const [route, ...params] = (location.hash.replace(/^#\/?/, '') || 'hoje').split('/');
  app.route = ROUTES[route] ? route : 'hoje';
  app.params = params.map(decodeURIComponent);
  currentView = ROUTES[app.route];
  const root = document.getElementById('app');
  const scroll = window.scrollY;
  const sameRoute = root.dataset.route === location.hash;
  root.innerHTML = shell();
  root.dataset.route = location.hash;
  const page = document.getElementById('page');
  page.innerHTML = currentView.render(app);
  currentView.mount?.(page, app);
  document.title = `${currentView.title || 'Rumo'} · Rumo`;
  window.scrollTo(0, sameRoute ? scroll : 0);
}

// ---------- Cronômetro global (funciona em qualquer tela) ----------
let lastInteraction = Date.now();
['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { lastInteraction = Date.now(); }, { passive: true }));

function askStillStudying() {
  openModal(`${modalHead('Ainda estudando?')}
    <p>Faz ${store.get().profile.inactivityMin} minutos desde a última confirmação. Se não houver resposta em 3 minutos, o cronômetro pausa sozinho e esse intervalo não conta.</p>
    <div class="modal-actions"><button class="btn" data-a="pause">Pausar</button><button class="btn primary" data-a="yes">Sim, continuo estudando</button></div>`, {
    dismissable: false,
    onMount: m => m.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      store.update(s => { if (a === 'yes') confirmActive(s.timer); else pause(s.timer); }, { silent: true });
      closeModal(); render();
    }),
  });
}

function askAway(minutes) {
  openModal(`${modalHead('Bem-vindo de volta')}
    <p>O cronômetro ficou rodando por <b>${minutes} min</b> com o app em segundo plano. Você estava estudando nesse período (por exemplo, no livro ou resolvendo questões no papel)?</p>
    <div class="modal-actions"><button class="btn" data-a="no">Não, descontar esse tempo</button><button class="btn primary" data-a="yes">Sim, contar</button></div>`, {
    dismissable: false,
    onMount: m => m.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      store.update(s => awayDecision(s.timer, a === 'yes'), { silent: true });
      closeModal(); render();
    }),
  });
}

document.addEventListener('visibilitychange', () => {
  const s = store.get();
  if (!s.timer?.running) return;
  if (document.visibilityState === 'hidden') {
    store.update(st => { st.timer.hiddenAt = Date.now(); }, { silent: true });
  } else if (s.timer.hiddenAt) {
    const awayMin = Math.round((Date.now() - s.timer.hiddenAt) / 60000);
    if (awayMin >= Math.min(10, s.profile.inactivityMin)) askAway(awayMin);
    else store.update(st => { st.timer.hiddenAt = null; }, { silent: true });
  }
});

setInterval(() => {
  const s = store.get();
  const t = s.timer;
  if (t) {
    const txt = fmtDur(elapsedMs(t) / 1000, { showSec: true });
    document.querySelectorAll('[data-live-timer]').forEach(el => { el.textContent = txt; });
    if (t.running && !t.hiddenAt && document.visibilityState === 'visible') {
      const r = tick(t, s.profile.inactivityMin);
      if (r) store.update(() => {}, { silent: true });
      if (r === 'ask' && !modalOpen()) askStillStudying();
      if (r === 'auto-paused') { closeModal(); toast('Cronômetro pausado por inatividade.'); render(); }
    }
  }
}, 1000);

// Tempo de permanência no app (separado do tempo estudado): conta só com a tela visível e uso recente.
setInterval(() => {
  if (document.visibilityState !== 'visible' || Date.now() - lastInteraction > 120000) return;
  store.update(s => { const d = todayISO(); s.appTime[d] = (s.appTime[d] || 0) + 15; }, { silent: true });
}, 15000);

// ---------- Radar ----------
async function loadRadar() {
  const CACHE = 'rumo:radar-cache';
  try {
    const r = await fetch('data/radar.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    Object.assign(radar, data, { loaded: true, error: null });
    try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* ignore */ }
  } catch (e) {
    try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) Object.assign(radar, c, { loaded: true }); } catch { /* ignore */ }
    radar.error = 'Não foi possível atualizar o radar agora (sem conexão?). Exibindo a última versão salva.';
  }
}

// ---------- Alertas (no máximo 2 notificações do sistema por dia) ----------
function checkAlerts() {
  const alerts = computeAlerts(store.get(), app.contests());
  notifyNew(store.get(), alerts, (k, d) => store.update(s => { s.alertsSeen[k] = d; }, { silent: true }));
}

// ---------- Sincronização automática (se ativada) ----------
let syncTimer = null;
async function syncPullIfNewer() {
  const sec = sync.getSecrets(); const s = store.get();
  if (!s.sync.enabled || !sec.token || !sec.pass || !s.sync.gistId) return;
  try {
    const remote = await sync.pullRemote({ token: sec.token, gistId: s.sync.gistId });
    if (remote && remote.updatedAt > s.updatedAt) {
      const data = await sync.decrypt(remote, sec.pass);
      data.timer = s.timer; // não sobrescreve um cronômetro em andamento neste aparelho
      store.replaceState(data); toast('Dados atualizados a partir do outro aparelho.');
    }
  } catch (e) { console.warn('sync pull', e); }
}
function schedulePush() {
  const s = store.get(); if (!s.sync.enabled) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const sec = sync.getSecrets(); if (!sec.token || !sec.pass) return;
    try {
      const id = await sync.pushRemote(store.get(), { token: sec.token, pass: sec.pass, gistId: store.get().sync.gistId });
      store.update(st => { st.sync.gistId = id; st.sync.lastSyncAt = new Date().toISOString(); }, { silent: true });
    } catch (e) { console.warn('sync push', e); }
  }, 20000);
}

// ---------- Inicialização ----------
async function init() {
  store.load();
  store.requestPersistence();
  const theme = localStorage.getItem('rumo:tema');
  if (theme) document.documentElement.dataset.theme = theme;
  store.subscribe(() => { render(); schedulePush(); });
  window.addEventListener('hashchange', render);
  render();
  await loadRadar();
  // Primeiro uso ou plano sem sessões futuras: gera o plano automaticamente.
  const s = store.get();
  if (!s.plan.generatedAt || !s.plan.sessions.some(x => x.date >= todayISO())) app.regenerate({ days: 14 });
  else render();
  checkAlerts();
  setInterval(checkAlerts, 30 * 60 * 1000);
  syncPullIfNewer();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.rumo = app; // útil para depuração e testes automatizados
init();

