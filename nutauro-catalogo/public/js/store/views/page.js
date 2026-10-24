import { api } from '../api.js';
import { $, esc, href } from '../ui.js';

export async function renderPage(ctx, slug) {
  const main = $('#main');
  const p = await api(`/api/pages/${encodeURIComponent(slug)}`);
  document.title = `${p.title} | ${ctx.store.store.name}`;
  main.innerHTML = `<div class="wrap">
    <div class="page-head"><nav class="crumbs"><a href="${href('/')}" data-link>Início</a><span>›</span><span>${esc(p.title)}</span></nav>
    <h1 class="h-display" style="font-size:24px">${esc(p.title)}</h1></div>
    <article class="prose">${esc(p.body)}</article></div>`;
}
