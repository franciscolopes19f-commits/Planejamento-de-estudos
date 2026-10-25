import { api, $, esc, icon, go, current, onNav, link, toast } from './lib.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProducts, renderProductEditor } from './views/products.js';
import { renderScan } from './views/scan.js';
import { renderStock } from './views/stock.js';
import { renderOrders, renderOrder } from './views/orders.js';
import { renderMore, renderStoreSettings, renderSalesSettings, renderDelivery, renderBanners, renderTaxonomy, renderPages, renderCsv, renderCustomers, renderAccount } from './views/more.js';

const state = { user: null, cleanup: null };

const routes = [
  [/^\/$/, renderDashboard, { tab: 'home', title: 'Início' }],
  [/^\/produtos$/, renderProducts, { tab: 'produtos', title: 'Produtos' }],
  [/^\/produtos\/novo$/, (el) => renderProductEditor(el, null), { tab: 'produtos', title: 'Novo produto', back: '/produtos' }],
  [/^\/produtos\/(\d+)$/, (el, m) => renderProductEditor(el, Number(m[1])), { tab: 'produtos', title: 'Editar produto', back: '/produtos' }],
  [/^\/escanear$/, renderScan, { tab: 'escanear', title: 'Código de barras' }],
  [/^\/estoque$/, renderStock, { tab: 'mais', title: 'Estoque', back: '/mais' }],
  [/^\/pedidos$/, renderOrders, { tab: 'pedidos', title: 'Pedidos' }],
  [/^\/pedidos\/(\d+)$/, (el, m) => renderOrder(el, Number(m[1])), { tab: 'pedidos', title: 'Pedido', back: '/pedidos' }],
  [/^\/mais$/, renderMore, { tab: 'mais', title: 'Mais' }],
  [/^\/config\/loja$/, renderStoreSettings, { tab: 'mais', title: 'Dados da loja', back: '/mais' }],
  [/^\/config\/vendas$/, renderSalesSettings, { tab: 'mais', title: 'Vendas e pagamentos', back: '/mais' }],
  [/^\/config\/entrega$/, renderDelivery, { tab: 'mais', title: 'Entrega e retirada', back: '/mais' }],
  [/^\/banners$/, renderBanners, { tab: 'mais', title: 'Banners e vitrine', back: '/mais' }],
  [/^\/categorias$/, renderTaxonomy, { tab: 'mais', title: 'Categorias e marcas', back: '/mais' }],
  [/^\/paginas$/, renderPages, { tab: 'mais', title: 'Páginas da loja', back: '/mais' }],
  [/^\/csv$/, renderCsv, { tab: 'mais', title: 'Importar / exportar', back: '/mais' }],
  [/^\/clientes$/, renderCustomers, { tab: 'mais', title: 'Clientes', back: '/mais' }],
  [/^\/conta$/, renderAccount, { tab: 'mais', title: 'Conta', back: '/mais' }],
];

function shell({ tab, title, back }) {
  const tabs = [
    ['home', '/', 'home', 'Início'], ['produtos', '/produtos', 'box', 'Produtos'], ['escanear', '/escanear', 'scan', 'Escanear'],
    ['pedidos', '/pedidos', 'orders', 'Pedidos'], ['mais', '/mais', 'more', 'Mais'],
  ];
  $('#app').innerHTML = `
    <div class="shell">
      <header class="top">
        ${back ? `<a class="top__back" href="${link(back)}" data-nav aria-label="Voltar">${icon('back')}</a>` : `<a class="top__logo" href="${link('/')}" data-nav><img src="/assets/brand/logo-fundo-escuro-200.png" alt="Nutauro" width="49" height="40"></a>`}
        <h1 class="top__title">${esc(title)}</h1>
        <a class="top__link" href="${window.NT_DEMO ? '#/' : '/'}" ${window.NT_DEMO ? '' : 'target="_blank" rel="noopener"'}>Ver loja ${icon('ext')}</a>
      </header>
      <main class="content" id="view" tabindex="-1"></main>
      <nav class="tabbar" aria-label="Menu do painel">
        ${tabs.map(([k, p, ic, l]) => `<a href="${link(p)}" data-nav class="${k === 'escanear' ? 'tab-scan' : ''}" ${tab === k ? 'aria-current="page"' : ''}>
          ${k === 'escanear' ? `<span class="ic">${icon(ic)}</span>` : icon(ic)}<span>${l}</span>${k === 'pedidos' ? '<b class="badge" data-orders-badge hidden></b>' : ''}</a>`).join('')}
      </nav>
    </div>`;
  return $('#view');
}

async function route() {
  if (typeof state.cleanup === 'function') state.cleanup();
  state.cleanup = null;
  if (!$('#app')) return;
  if (!state.user) return renderLogin();
  const { path } = current();
  for (const [re, fn, meta] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    const el = shell(meta);
    el.innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
    try {
      state.cleanup = await fn(el, m);
    } catch (e) {
      el.innerHTML = `<div class="card card--danger"><b>Não foi possível carregar.</b><p class="small">${esc(e.message)}</p><button class="btn btn--dark btn--sm" data-reload>Tentar novamente</button></div>`;
      el.querySelector('[data-reload]').onclick = route;
    }
    refreshBadge();
    window.scrollTo(0, 0);
    return;
  }
  go('/', { replace: true });
}

async function refreshBadge() {
  try {
    const d = await api('/orders?status=novo');
    const b = $('[data-orders-badge]');
    if (b) { b.hidden = !d.orders.length; b.textContent = d.orders.length; }
  } catch {}
}

function renderLogin(msg = '') {
  $('#app').innerHTML = `
    <div class="login">
      <form data-login>
        <img src="/assets/brand/logo-fundo-claro-200.png" alt="Nutauro" width="136" height="110">
        <h1 style="font-size:16px;text-transform:uppercase;font-weight:900;text-align:center">Painel da loja</h1>
        <div class="field"><label for="l-email">E-mail</label><input class="input" id="l-email" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="l-pass">Senha</label><input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
        <p class="err" data-err role="alert">${esc(msg)}</p>
        <button class="btn btn--dark btn--block" type="submit">Entrar</button>
      </form>
    </div>`;
  $('[data-login]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      state.user = r.user;
      route();
    } catch (err) {
      $('[data-err]').textContent = err.message;
    }
  });
  $('#l-email').focus();
}

const isActive = () => !window.NT_ACTIVE || window.NT_ACTIVE === 'admin';
let listening = false;

export async function boot() {
  if (!listening) {
    listening = true;
    listen();
  }
  try {
    const r = await api('/me');
    state.user = r.user;
  } catch { state.user = null; }
  route();
}

function listen() {
  document.addEventListener('click', (e) => {
    if (!isActive()) return;
    const a = e.target.closest('a[data-nav]');
    if (a && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const h = a.getAttribute('href');
      go(h.replace(/^#?\/admin/, '') || '/');
    }
  });
  window.addEventListener('popstate', () => { if (isActive()) route(); });
  window.addEventListener('nt:logout', () => { if (state.user) { state.user = null; renderLogin('Sua sessão expirou. Entre novamente.'); } });
  onNav(route);
}

export async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  state.user = null;
  toast('Você saiu do painel.');
  go('/', { replace: true });
}

if (!window.NT_DEMO) boot();
