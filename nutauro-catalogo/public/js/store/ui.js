import { formatBRL } from '/shared/money.js';
import { pixPrice, installmentInfo } from '/shared/pricing.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Navegação (history API; hash no modo demonstração estático)
const HASH_MODE = !!window.NT_DEMO;

export function loc() {
  if (HASH_MODE) {
    const h = location.hash.slice(1) || '/';
    const u = new URL(h, 'http://x');
    return { path: u.pathname, query: Object.fromEntries(u.searchParams), href: h };
  }
  return { path: location.pathname, query: Object.fromEntries(new URLSearchParams(location.search)), href: location.pathname + location.search };
}

export function href(path) {
  return HASH_MODE ? `#${path}` : path;
}

export function absoluteUrl(path) {
  return HASH_MODE ? `${location.origin}${location.pathname}#${path}` : `${location.origin}${path}`;
}

let navHandler = () => {};
export function onNavigate(fn) { navHandler = fn; }
export function nav(path, { replace = false } = {}) {
  if (HASH_MODE) {
    if (replace) history.replaceState(null, '', `#${path}`);
    else history.pushState(null, '', `#${path}`);
  } else if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  navHandler({ replace });
}

export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && v !== false) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---------- Ícones (traço simples, herdam a cor)
const I = {
  whey: '<path d="M7 7h10l-1 13H8z"/><path d="M6 4h12v3H6z"/><path d="M9.5 11h5"/>',
  creatina: '<rect x="6" y="6" width="12" height="15" rx="3"/><path d="M8 3h8v3H8z"/><path d="M9 12h6M9 15h4"/>',
  'pre-treino': '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
  vitaminas: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="m9.5 8.5 5 7"/>',
  hipercaloricos: '<path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M12 10v6M9 13h6"/>',
  'barras-e-snacks': '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 8v8M11 8v8M15 8v8"/>',
  acessorios: '<path d="M8 3h8l-1 4H9z"/><path d="M9 7h6l1 14H8z"/><path d="M8.5 12h7"/>',
  all: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  pix: '<path d="m12 3 9 9-9 9-9-9z"/><path d="m8 12 4-4 4 4-4 4z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  store: '<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6z"/><path d="M10 20v-5h4v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  cart: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[name] || I.all}</svg>`;
export const WA_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.8 5 2.1.9 3 1 4 .8.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5l-.4-.3Z"/></svg>';

// ---------- Preço
export function maxDiscountPct(p) {
  let best = 0;
  for (const v of p.variants) {
    if (v.promo_price_cents != null) best = Math.max(best, Math.round((1 - v.promo_price_cents / v.price_cents) * 100));
  }
  return best;
}

/** Bloco de preço. Mostra Pix e parcelamento somente se configurados na loja. */
export function priceHtml({ unit, regular, from = false, payments, out = false }) {
  const pix = !out ? pixPrice(unit, payments) : null;
  const inst = !out ? installmentInfo(unit, payments) : null;
  return `
    ${from ? '<span class="price__from">a partir de</span>' : ''}
    ${regular != null && regular > unit ? `<span class="price__old">${formatBRL(regular)}</span>` : ''}
    <span class="price__main">${formatBRL(unit)}</span>
    ${pix != null ? `<span class="price__pix"><b>${formatBRL(pix)}</b> no Pix (${payments.pix_discount_pct}% off)</span>` : ''}
    ${inst ? `<span class="price__inst">ou ${inst.n}x de ${formatBRL(inst.value_cents)}${inst.interest_free ? ' sem juros' : ''}</span>` : ''}`;
}

export function cardHtml(p, store) {
  const off = maxDiscountPct(p);
  const badges = [
    off > 0 && p.in_stock ? `<span class="tag tag--offer">Oferta −${off}%</span>` : '',
    p.is_kit ? '<span class="tag">Kit</span>' : '',
    p.is_new ? '<span class="tag">Novo</span>' : '',
    !p.in_stock ? '<span class="tag tag--out">Esgotado</span>' : '',
    p.is_demo ? '<span class="tag tag--demo">Demo</span>' : '',
  ].join('');
  const cheapestRegular = p.has_promo ? p.regular_from_cents : null;
  const link = href(`/produto/${p.slug}`);
  const action = !p.in_stock
    ? `<a class="btn btn--ghost btn--sm btn--block" href="${link}" data-link>Ver detalhes</a>`
    : p.needs_choice
      ? `<button class="btn btn--dark btn--sm btn--block" data-quick="${esc(p.slug)}">Escolher opção</button>`
      : `<button class="btn btn--sm btn--block" data-add="${p.variants[0].id}" data-slug="${esc(p.slug)}">${icon('cart')} Adicionar</button>`;
  return `
  <article class="card ${p.in_stock ? '' : 'card--out'}">
    <a class="card__media" href="${link}" data-link tabindex="-1" aria-hidden="true">
      ${p.images[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy" decoding="async" width="600" height="600">` : '<span class="card__nophoto">Foto em breve</span>'}
      <span class="card__badges">${badges}</span>
    </a>
    <div class="card__body">
      ${p.brand ? `<span class="card__brand">${esc(p.brand.name)}</span>` : ''}
      <h3 class="card__name"><a href="${link}" data-link>${esc(p.name)}</a></h3>
      ${p.presentation ? `<span class="card__pres">${esc(p.presentation)}</span>` : ''}
      <div class="card__price">
        ${p.price_from_cents != null ? priceHtml({ unit: p.price_from_cents, regular: cheapestRegular, from: p.price_varies, payments: store.payments, out: !p.in_stock }) : ''}
      </div>
      ${action}
    </div>
  </article>`;
}

export function skeletonCards(n = 4) {
  return Array.from({ length: n }, () => '<div class="sk sk-card" aria-hidden="true"></div>').join('');
}

export function emptyHtml({ title, text, actions = '', ic = 'search' }) {
  return `<div class="empty"><div class="empty__ic">${icon(ic)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>${actions}</div>`;
}

export function errorHtml(err, retryLabel = 'Tentar novamente') {
  return emptyHtml({
    ic: err?.network ? 'wifi' : 'alert',
    title: err?.network ? 'Sem conexão' : 'Algo deu errado',
    text: err?.message || 'Não foi possível carregar.',
    actions: `<button class="btn btn--dark" data-retry>${esc(retryLabel)}</button>`,
  });
}

// ---------- Toast
let toastTimer;
export function toast(html, { ms = 3500 } = {}) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.toggle('has-bar', !!document.querySelector('.buybar, .checkout-bar'));
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), ms);
}

// ---------- Bottom sheet acessível
export function openSheet({ title, html, onMount }) {
  const root = $('#sheet-root');
  const prevFocus = document.activeElement;
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet__grip"></div>
      <div class="sheet__head"><h2 id="sheet-title">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>
      <div class="sheet__body">${html}</div>
    </div>`;
  document.body.style.overflow = 'hidden';
  const sheet = $('.sheet', root);
  const close = () => {
    root.innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = $$('button, a[href], input, select, textarea', sheet).filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  onMount?.(sheet, close);
  setTimeout(() => $('button:not([data-close]), input', sheet)?.focus(), 50);
  return close;
}

// ---------- Seletor de variações (sabor/tamanho)
/**
 * Mantém a seleção e informa a variação escolhida.
 * Opções sem estoque aparecem riscadas, mas podem ser escolhidas para ver o aviso.
 */
export function variantPicker(p, { onChange, initialVariantId } = {}) {
  const dims = [];
  if (p.flavors.length) dims.push({ key: 'flavor', label: p.flavors.length > 1 ? 'Sabor' : 'Sabor', values: p.flavors });
  if (p.sizes.length) dims.push({ key: 'size', label: 'Tamanho', values: p.sizes });
  const sel = { flavor: null, size: null };
  const init = p.variants.find((v) => v.id === Number(initialVariantId));
  if (init) { sel.flavor = init.flavor; sel.size = init.size; }
  for (const d of dims) if (d.values.length === 1) sel[d.key] = d.values[0];

  const current = () => {
    if (p.variants.length === 1) return p.variants[0];
    return p.variants.find((v) => dims.every((d) => v[d.key] === sel[d.key])) || null;
  };
  const missing = () => dims.filter((d) => d.values.length > 1 && !sel[d.key]).map((d) => d.label.toLowerCase());
  const exists = (key, val) => p.variants.some((v) => v[key] === val && dims.every((d) => d.key === key || !sel[d.key] || v[d.key] === sel[d.key]));
  const inStock = (key, val) => p.variants.some((v) => v[key] === val && v.in_stock && dims.every((d) => d.key === key || !sel[d.key] || v[d.key] === sel[d.key]));

  function html() {
    return dims.filter((d) => d.values.length > 1 || p.variants.length > 1).map((d) => `
      <fieldset class="opt">
        <legend>${d.label}${sel[d.key] ? `: <span>${esc(sel[d.key])}</span>` : ''}</legend>
        <div class="opt__list">
          ${d.values.map((val) => `
            <button type="button" class="opt__btn" data-dim="${d.key}" data-val="${esc(val)}"
              aria-pressed="${sel[d.key] === val}" data-out="${!inStock(d.key, val)}"
              ${!exists(d.key, val) && sel[d.key] !== val ? 'title="Combinação indisponível"' : ''}>
              ${esc(val)}${!inStock(d.key, val) ? '<span class="sr"> (esgotado)</span>' : ''}
            </button>`).join('')}
        </div>
      </fieldset>`).join('');
  }

  function mount(el) {
    const render = () => {
      el.innerHTML = html();
      onChange?.(current(), missing());
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.opt__btn');
      if (!b) return;
      const key = b.dataset.dim;
      sel[key] = b.dataset.val;
      // Se a combinação não existe, limpa a outra dimensão para o cliente escolher de novo.
      for (const d of dims) {
        if (d.key !== key && sel[d.key] && !p.variants.some((v) => v[key] === sel[key] && v[d.key] === sel[d.key])) {
          sel[d.key] = d.values.length === 1 ? d.values[0] : null;
        }
      }
      render();
      el.querySelector(`[data-dim="${key}"][aria-pressed="true"]`)?.focus();
    });
    render();
  }
  return { mount, current, missing };
}

export function qtyHtml(value, max) {
  return `<div class="qty" role="group" aria-label="Quantidade">
    <button type="button" data-q="-1" aria-label="Diminuir" ${value <= 1 ? 'disabled' : ''}>−</button>
    <input type="number" inputmode="numeric" min="1" max="${max}" value="${value}" aria-label="Quantidade">
    <button type="button" data-q="1" aria-label="Aumentar" ${value >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

export function bindQty(el, { get, set, max }) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    set(Math.max(1, Math.min(max(), get() + Number(b.dataset.q))));
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('input')) set(Math.max(1, Math.min(max(), Math.floor(Number(e.target.value) || 1))));
  });
}

export function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || '';
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}

export { formatBRL };
