import { formatBRL, parseBRL, centsToInput } from '/shared/money.js';

export { formatBRL, parseBRL, centsToInput };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export async function api(path, { method = 'GET', body } = {}) {
  const url = `/api/admin${path}`;
  if (window.NT_DEMO) return window.NT_DEMO.request(url, { method, body, admin: true });
  let r;
  try {
    r = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'nutauro-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('Sem conexão com o servidor. Verifique a internet.');
    e.network = true;
    throw e;
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') {
    window.dispatchEvent(new CustomEvent('nt:logout'));
  }
  if (!r.ok) {
    const e = new Error(data.error || 'Erro ao processar.');
    e.status = r.status;
    e.details = data.details;
    throw e;
  }
  return data;
}

// ---------- Navegação
let handler = () => {};
export function onNav(fn) { handler = fn; }
export function go(path, { replace = false } = {}) {
  const full = path.startsWith('/admin') ? path : `/admin${path}`;
  if (window.NT_DEMO) {
    history[replace ? 'replaceState' : 'pushState'](null, '', `#${full}`);
  } else history[replace ? 'replaceState' : 'pushState'](null, '', full);
  handler();
}
export function current() {
  const raw = window.NT_DEMO ? (location.hash.slice(1) || '/admin') : location.pathname + location.search;
  const u = new URL(raw, 'http://x');
  return { path: u.pathname.replace(/^\/admin/, '') || '/', query: Object.fromEntries(u.searchParams) };
}
export const link = (p) => (window.NT_DEMO ? `#/admin${p}` : `/admin${p}`);

// ---------- Ícones
const I = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  box: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  stock: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  banner: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h6M7 14h4"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  csv: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14l3 3 3-3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  store: '<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  archive: '<path d="M3 5h18v4H3zM5 9v11h14V9M10 13h4"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

// ---------- Toast e modal
let tt;
export function toast(msg, { bad = false } = {}) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('toast--bad', bad);
  t.classList.add('is-on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('is-on'), bad ? 5000 : 2800);
}

export function modal({ title, html, onMount, onClose }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="row row--between" style="margin-bottom:8px"><h2 style="margin:0">${esc(title)}</h2><button class="top__back" style="background:#eee;color:#000" data-close aria-label="Fechar">${icon('x')}</button></div>${html}</div>`;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    root.innerHTML = '';
    root.onclick = null;
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.onclick = (e) => { if (e.target.closest('[data-close]')) close(); };
  onMount?.($('.modal', root), close);
  setTimeout(() => $('.modal input, .modal select, .modal textarea, .modal .btn', root)?.focus(), 30);
  return close;
}

export function confirmBox(text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title: 'Confirmar',
      html: `<p style="margin:0 0 16px">${esc(text)}</p><div class="row"><button class="btn btn--ghost grow" data-no>Voltar</button><button class="btn ${danger ? 'btn--danger' : 'btn--dark'} grow" data-yes>${esc(ok)}</button></div>`,
      onMount(m, close) {
        m.querySelector('[data-yes]').onclick = () => { close(); resolve(true); };
        m.querySelector('[data-no]').onclick = () => { close(); resolve(false); };
      },
    });
  });
}

// ---------- Datas
export function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${String(iso).replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }) }).format(d);
}

// ---------- Imagens: redimensiona no aparelho antes de enviar (máx. 1200 px, WebP/JPEG)
export async function resizeImage(file, max = 1200) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.82);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.85);
  return url;
}

export async function uploadImage(file) {
  const data_url = await resizeImage(file);
  const r = await api('/uploads', { method: 'POST', body: { data_url } });
  return r.url;
}

export function moneyInput(name, cents, { placeholder = '0,00', attrs = '' } = {}) {
  return `<div class="money"><input class="input" name="${name}" inputmode="decimal" placeholder="${placeholder}" value="${esc(centsToInput(cents))}" ${attrs}></div>`;
}

export function statusPill(status) {
  const m = { active: ['Publicado', 'ok'], draft: ['Rascunho', 'warn'], archived: ['Arquivado', ''] }[status] || [status, ''];
  return `<span class="pill ${m[1] ? `pill--${m[1]}` : ''}">${m[0]}</span>`;
}

export function downloadFile(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
