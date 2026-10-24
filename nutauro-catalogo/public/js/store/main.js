import { api, onNetChange } from './api.js';
import { cart } from './cart.js';
import { $, esc, href, loc, nav, onNavigate, icon, toast, openSheet, variantPicker, qtyHtml, bindQty, priceHtml, formatPhone, errorHtml } from './ui.js';
import { waLink } from '/shared/whatsapp.js';
import { renderHome } from './views/home.js';
import { renderCatalog } from './views/catalog.js';
import { renderProduct } from './views/product.js';
import { renderCart } from './views/cart.js';
import { renderCheckout } from './views/checkout.js';
import { renderOrder } from './views/order.js';
import { renderPage } from './views/page.js';

export const ctx = { store: null, products: null };

const routes = [
  [/^\/$/, renderHome],
  [/^\/produtos$/, renderCatalog],
  [/^\/categoria\/([^/]+)$/, (c, m) => renderCatalog(c, { category: m[1] })],
  [/^\/marca\/([^/]+)$/, (c, m) => renderCatalog(c, { brand: m[1] })],
  [/^\/produto\/([^/]+)$/, (c, m) => renderProduct(c, m[1])],
  [/^\/carrinho$/, renderCart],
  [/^\/finalizar$/, renderCheckout],
  [/^\/pedido\/([^/]+)$/, (c, m) => renderOrder(c, m[1])],
  [/^\/pagina\/([^/]+)$/, (c, m) => renderPage(c, m[1])],
];

let cleanup = null;

async function route({ replace } = {}) {
  const { path } = loc();
  const main = $('#main');
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  document.body.classList.remove('no-fab');
  updateCatNav(path);
  for (const [re, fn] of routes) {
    const m = re.exec(path);
    if (m) {
      try {
        cleanup = await fn(ctx, m.map((x) => (x ? decodeURIComponent(x) : x)));
      } catch (e) {
        main.innerHTML = `<div class="wrap" style="padding:32px 0">${errorHtml(e)}</div>`;
      }
      updateFab();
      if (!replace) window.scrollTo(0, 0);
      return;
    }
  }
  document.title = `Página não encontrada | ${ctx.store?.store.name || 'Nutauro'}`;
  main.innerHTML = `<div class="wrap" style="padding:32px 0">
    <div class="empty"><div class="empty__ic">${icon('search')}</div><h2>Página não encontrada</h2>
    <p>O link pode estar incorreto ou o produto saiu do catálogo.</p><a class="btn" href="${href('/produtos')}" data-link>Ver produtos</a></div></div>`;
}

function updateCatNav(path) {
  for (const a of document.querySelectorAll('#cat-nav a')) {
    const target = a.getAttribute('data-path');
    if (target === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/** Botão flutuante só aparece onde não há barra fixa de ação (produto, carrinho, finalização). */
function updateFab() {
  const fab = $('#wa-fab');
  const hasBar = !!document.querySelector('.buybar, .checkout-bar') || document.body.classList.contains('no-fab');
  const url = waLink(ctx.store?.store.whatsapp, `Olá! Vim pelo catálogo da ${ctx.store?.store.name || 'Nutauro'} e tenho uma dúvida.`);
  const show = !!url && !hasBar;
  fab.hidden = !show;
  document.body.classList.toggle('has-fab', show);
  if (url) fab.href = url;
}

function renderChrome() {
  const s = ctx.store;
  const cats = s.categories.map((c) => `<a href="${href(`/categoria/${c.slug}`)}" data-link data-path="/categoria/${esc(c.slug)}">${esc(c.name)}</a>`).join('');
  $('#cat-nav .cats__in').innerHTML = `<a href="${href('/produtos')}" data-link data-path="/produtos">Todos</a>${cats}`;
  if (s.has_demo_products) {
    const r = $('#demo-ribbon');
    r.hidden = false;
    r.innerHTML = window.NT_DEMO
      ? 'Demonstração navegável: dados ilustrativos salvos só neste navegador · <a href="#/admin">Abrir painel</a> · <a href="#" data-demo-reset>Reiniciar</a>'
      : 'Demonstração: produtos e preços ilustrativos.';
    r.querySelector('[data-demo-reset]')?.addEventListener('click', (e) => { e.preventDefault(); window.NT_DEMO.reset(); });
  }
  const st = s.store;
  const wa = waLink(st.whatsapp, 'Olá! Vim pelo catálogo.');
  const deliveryLines = s.delivery_summary.map((z) => {
    const sla = z.sla?.type === 'same_day' ? `possibilidade de entrega no mesmo dia (pedidos confirmados até ${z.sla.cutoff})`
      : z.sla?.type === 'hours' ? `até ${z.sla.hours} horas após a confirmação`
        : z.sla?.type === 'business_days' ? `até ${z.sla.days} dia(s) útil(eis)` : 'prazo e frete conforme CEP';
    return `<li>${esc(z.name)}: ${esc(sla)}</li>`;
  }).join('');
  $('#ftr').innerHTML = `
    <div class="wrap">
      <div class="ftr__grid">
        <div>
          <a class="ftr__logo" href="${href('/')}" data-link><img src="/assets/brand/logo-fundo-escuro-200.png" alt="Nutauro — Suplementação e nutrição esportiva" width="247" height="200" loading="lazy"></a>
          <p style="margin:14px 0 0">${esc(st.city || '')}</p>
          ${st.address ? `<p style="margin:4px 0 0">${esc(st.address)}</p>` : ''}
          ${st.hours_text ? `<p style="margin:4px 0 0">${esc(st.hours_text)}</p>` : ''}
        </div>
        <div>
          <h3>Atendimento</h3>
          <ul>
            ${wa ? `<li><a href="${wa}" target="_blank" rel="noopener">WhatsApp ${esc(formatPhone(st.whatsapp))}</a></li>` : ''}
            ${st.email ? `<li><a href="mailto:${esc(st.email)}">${esc(st.email)}</a></li>` : ''}
            ${st.instagram ? `<li><a href="https://instagram.com/${esc(st.instagram.replace('@', ''))}" target="_blank" rel="noopener">Instagram ${esc(st.instagram)}</a></li>` : ''}
            ${s.pickup.enabled ? '<li>Retirada na loja</li>' : ''}
          </ul>
        </div>
        ${deliveryLines ? `<div><h3>Entregas</h3><ul class="small">${deliveryLines}</ul></div>` : ''}
        ${s.pages.length ? `<div><h3>Informações</h3><ul>${s.pages.map((p) => `<li><a href="${href(`/pagina/${p.slug}`)}" data-link>${esc(p.title)}</a></li>`).join('')}</ul></div>` : ''}
      </div>
      <div class="ftr__legal">
        © ${new Date().getFullYear()} ${esc(st.name)}${st.cnpj ? ` · CNPJ ${esc(st.cnpj)}` : ''}.
        A Nutauro é revendedora: marcas e embalagens pertencem aos respectivos fabricantes.
        Suplementos não substituem uma alimentação equilibrada; consulte um nutricionista ou médico.
      </div>
    </div>`;
}

function updateCartCount() {
  const b = $('#cart-count');
  const n = cart.count();
  b.hidden = n === 0;
  b.textContent = n > 99 ? '99+' : String(n);
  $('.hdr__cart').setAttribute('aria-label', `Carrinho, ${n} ${n === 1 ? 'item' : 'itens'}`);
}

function measureHeader() {
  document.documentElement.style.setProperty('--hdr-h', `${$('#hdr').offsetHeight}px`);
}

// ---------- Adição rápida (lista de produtos)
export async function quickAdd(slug) {
  let data;
  try {
    data = await api(`/api/products/${encodeURIComponent(slug)}`);
  } catch (e) {
    toast(esc(e.message));
    return;
  }
  const p = data.product;
  let qty = 1;
  let variant = null;
  openSheet({
    title: 'Escolha a opção',
    html: `
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
        <div class="citem__img" style="width:72px;height:72px">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}</div>
        <div><div class="card__brand">${esc(p.brand?.name || '')}</div><b>${esc(p.name)}</b><div class="small muted">${esc(p.presentation || '')}</div></div>
      </div>
      <div data-picker></div>
      <div data-price style="margin:4px 0 12px"></div>
      <div class="buy-row"><span data-qty></span><button class="btn" data-confirm>Adicionar</button></div>
      <p class="opt__hint" data-hint hidden></p>
      <a class="link small" href="${href(`/produto/${p.slug}`)}" data-link data-close>Ver detalhes do produto</a>`,
    onMount(sheet, close) {
      const picker = variantPicker(p, {
        onChange(v, missing) {
          variant = v;
          qty = Math.min(qty, Math.max(1, v?.available || 1));
          $('[data-price]', sheet).innerHTML = v
            ? priceHtml({ unit: v.unit_cents, regular: v.promo_price_cents != null ? v.price_cents : null, payments: ctx.store.payments, out: !v.in_stock })
            : priceHtml({ unit: p.price_from_cents, from: p.price_varies, payments: ctx.store.payments });
          renderQty();
          const btn = $('[data-confirm]', sheet);
          const hint = $('[data-hint]', sheet);
          btn.disabled = !v || !v.in_stock;
          btn.textContent = v && !v.in_stock ? 'Esgotado' : 'Adicionar';
          hint.hidden = !(missing.length || (v && !v.in_stock));
          hint.textContent = missing.length ? `Escolha ${missing.join(' e ')}.` : v && !v.in_stock ? 'Esta opção está esgotada. Escolha outra.' : '';
        },
      });
      const renderQty = () => { $('[data-qty]', sheet).innerHTML = qtyHtml(qty, Math.max(1, variant?.available || 1)); };
      picker.mount($('[data-picker]', sheet));
      bindQty($('[data-qty]', sheet), { get: () => qty, set: (n) => { qty = n; renderQty(); }, max: () => Math.max(1, variant?.available || 1) });
      $('[data-confirm]', sheet).addEventListener('click', () => {
        if (!variant || !variant.in_stock) return;
        const r = cart.add(p, variant, qty);
        close();
        addedToast(r);
      });
    },
  });
}

export function addedToast(r) {
  if (r.added > 0) {
    toast(`${icon('check')} Adicionado ao carrinho${r.limited ? ' (limite do estoque)' : ''} <a href="${href('/carrinho')}" data-link>Ver carrinho</a>`);
  } else {
    toast('Você já tem no carrinho toda a quantidade disponível.');
  }
}

async function addSingle(btn) {
  const slug = btn.dataset.slug;
  const id = Number(btn.dataset.add);
  const p = ctx.products?.find((x) => x.slug === slug) || (await api(`/api/products/${encodeURIComponent(slug)}`)).product;
  const v = p.variants.find((x) => x.id === id);
  if (!v?.in_stock) return toast('Produto esgotado.');
  addedToast(cart.add(p, v, 1));
}

// ---------- Inicialização
async function boot() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !a.target && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.origin === location.origin) {
      const raw = a.getAttribute('href');
      if (raw.startsWith('#/') && !raw.startsWith('#/admin')) { e.preventDefault(); nav(raw.slice(1)); return; }
      if (raw.startsWith('/') && !raw.startsWith('/admin') && !raw.startsWith('/api') && !/\.\w{2,5}$/.test(raw)) {
        e.preventDefault();
        nav(raw);
        return;
      }
    }
    if (e.target.closest('[data-retry]') && !e.defaultPrevented) { route({ replace: true }); return; }
    const q = e.target.closest('[data-quick]');
    if (q) { e.preventDefault(); quickAdd(q.dataset.quick); }
    const add = e.target.closest('[data-add]');
    if (add) { e.preventDefault(); addSingle(add); }
  });
  window.addEventListener('popstate', () => route({ replace: true }));
  if (window.NT_DEMO) window.addEventListener('hashchange', () => route({ replace: true }));
  onNavigate(route);
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    $('#q').blur();
    nav(`/produtos${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  });
  onNetChange((off) => {
    const n = $('#net-status');
    n.hidden = !off;
    n.textContent = 'Você está sem conexão. Algumas informações podem estar desatualizadas.';
  });
  cart.subscribe(updateCartCount);
  updateCartCount();
  window.addEventListener('resize', measureHeader);
  measureHeader();

  const main = $('#main');
  main.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
  try {
    ctx.store = await api('/api/store');
  } catch (e) {
    main.innerHTML = `<div class="wrap" style="padding:32px 0">${errorHtml(e)}</div>`;
    main.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
    return;
  }
  renderChrome();
  measureHeader();
  const { query } = loc();
  if (query.q) $('#q').value = query.q;
  route({ replace: true });
}

boot();
