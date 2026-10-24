// Ponto de entrada da demonstração em arquivo único. Escolhe loja ou painel pelo endereço (#/admin).
import './backend.js';
import storeHtml from '../public/index.html';
import adminHtml from '../public/admin/index.html';
import storeCss from '../public/css/store.css';
import adminCss from '../public/css/admin.css';

const isAdmin = location.hash.startsWith('#/admin');
const body = (html) => html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
document.getElementById('app-css').textContent = isAdmin ? adminCss : storeCss;
document.body.innerHTML = body(isAdmin ? adminHtml : storeHtml);
document.title = isAdmin ? 'Painel Nutauro (demonstração)' : 'Nutauro Suplementos (demonstração)';
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#/admin') !== isAdmin) location.reload();
});
if (isAdmin) import('../public/js/admin/main.js');
else import('../public/js/store/main.js');
