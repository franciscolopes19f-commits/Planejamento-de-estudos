// Ponto de entrada da demonstração em arquivo único. Loja e painel dividem a página;
// o painel abre por #/admin (ou pelo atalho #painel, que funciona em links compartilhados).
import './backend.js';
import storeHtml from '../public/index.html';
import adminHtml from '../public/admin/index.html';
import storeCss from '../public/css/store.css';
import adminCss from '../public/css/admin.css';

const body = (html) => html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const want = () => (location.hash.startsWith('#/admin') || location.hash === '#painel' ? 'admin' : 'store');
let current = null;

async function mount(app) {
  if (app === current) return;
  current = app;
  window.NT_ACTIVE = app;
  if (location.hash === '#painel') history.replaceState(null, '', '#/admin');
  const css = document.getElementById('app-css');
  if (css.parentNode !== document.head) document.head.appendChild(css); // a página publicada coloca tudo no <body>
  css.textContent = app === 'admin' ? adminCss : storeCss;
  document.body.innerHTML = body(app === 'admin' ? adminHtml : storeHtml);
  window.scrollTo(0, 0);
  const m = app === 'admin' ? await import('../public/js/admin/main.js') : await import('../public/js/store/main.js');
  m.boot();
}

window.addEventListener('hashchange', () => mount(want()));
window.addEventListener('popstate', () => mount(want()));
mount(want());
