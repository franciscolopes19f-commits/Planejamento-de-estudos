// Utilitários de interface: escape de HTML, ícones, modal, toast e gráficos simples em SVG.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function safeUrl(u) {
  if (!u) return '';
  try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; }
}
export function money(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v); if (!Number.isFinite(n)) return esc(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function pct(x, digits = 0) { return x == null ? '—' : `${(x * 100).toFixed(digits).replace('.', ',')}%`; }

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4.5-9.5-.5 2.5-2 4-3.5 5-.5-1.5-1.5-2.5-2.5-3C7.5 10 5 12 5 15a7 7 0 0 0 7 7z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.5 5.5"/>',
  star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V9M7 13.5l5-5 5 5M4 4h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 3 2 20.5h20z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  mapPin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
};
export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export const LOGO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19c3-1 4-4 6-7s4-5 10-6"/><path d="M15 5.5 20 6l-.5 5"/><circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>`;

// ---------- Modal ----------
let modalEl = null;
export function openModal(html, { onMount, onClose, dismissable = true } = {}) {
  closeModal();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-back';
  modalEl.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  modalEl._onClose = onClose;
  if (dismissable) modalEl.addEventListener('click', e => { if (e.target === modalEl || e.target.closest('[data-close]')) closeModal(); });
  else modalEl.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(modalEl);
  const first = modalEl.querySelector('input:not([type=hidden]),select,textarea');
  if (first && window.matchMedia('(min-width: 700px)').matches) first.focus();
  onMount?.(modalEl.querySelector('.modal'));
  return modalEl;
}
export function closeModal() {
  if (!modalEl) return;
  const cb = modalEl._onClose; modalEl.remove(); modalEl = null; cb?.();
}
export function modalOpen() { return !!modalEl; }
export function modalHead(title) {
  return `<div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>`;
}

export function confirmDialog(text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise(resolve => {
    let answered = false;
    openModal(`${modalHead('Confirmar')}<p>${esc(text)}</p><div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`, {
      onMount: m => m.querySelector('[data-ok]').addEventListener('click', () => { answered = true; closeModal(); resolve(true); }),
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

let toastTimer = null;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3200);
}

export function formData(form) {
  const fd = new FormData(form); const o = {};
  for (const [k, v] of fd.entries()) {
    if (k in o) o[k] = [].concat(o[k], v); else o[k] = v;
  }
  return o;
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function progressBar(frac, cls = '') {
  const w = Math.max(0, Math.min(1, frac || 0)) * 100;
  return `<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(w)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${w.toFixed(1)}%"></i></div>`;
}

// Gráfico de colunas de uma série (sem legenda: o título do cartão nomeia a série).
export function columnChart(points, { goal = null, fmt = v => String(Math.round(v)), height = 150 } = {}) {
  const W = 600, H = height, pad = { l: 8, r: 8, t: 18, b: 22 };
  const max = Math.max(goal || 0, ...points.map(p => p.v), 1);
  const bw = (W - pad.l - pad.r) / points.length;
  const y = v => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const showEvery = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  let bars = '';
  points.forEach((p, i) => {
    const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64, top = y(p.v), h = Math.max(0, H - pad.b - top);
    const r = Math.min(4, w / 2, h);
    const path = h > 0 ? `M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${H - pad.b} Z` : '';
    bars += `<g><title>${esc(p.label)}: ${esc(fmt(p.v))}</title><rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent"/>${path ? `<path class="bar-rect${goal && p.v >= goal ? ' goal-hit' : ''}" d="${path}"/>` : ''}`;
    if (i % showEvery === 0 || i === points.length - 1) bars += `<text class="lbl" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(p.short || p.label)}</text>`;
    if (p.v > 0 && points.length <= 14) bars += `<text class="val" x="${x + w / 2}" y="${top - 4}" text-anchor="middle">${esc(fmt(p.v))}</text>`;
    bars += '</g>';
  });
  const goalLine = goal ? `<line class="goal" x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}"><title>Meta: ${esc(fmt(goal))}</title></line>` : '';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img"><line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"/>${bars}${goalLine}</svg></div>`;
}
