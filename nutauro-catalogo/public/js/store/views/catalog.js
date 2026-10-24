import { api } from '../api.js';
import { $, $$, esc, href, icon, cardHtml, skeletonCards, emptyHtml, errorHtml, loc, nav, qs, openSheet, formatBRL } from '../ui.js';

const SORTS = [
  ['relevance', 'Mais relevantes'], ['price_asc', 'Menor preço'], ['price_desc', 'Maior preço'], ['newest', 'Recentes'], ['name', 'Nome (A–Z)'],
];
const SECTION_TITLES = { offers: 'Ofertas', featured: 'Destaques', new: 'Novidades', kits: 'Kits' };

/** Estado dos filtros vive na URL: links compartilháveis e botão voltar funcionando. */
function readState(fixed) {
  const { query } = loc();
  return {
    q: query.q || '',
    categoria: fixed.category || query.categoria || '',
    marca: fixed.brand || query.marca || '',
    min: query.min || '',
    max: query.max || '',
    disponivel: query.disponivel === '1',
    promo: query.promo === '1',
    secao: query.secao || '',
    ordem: query.ordem || 'relevance',
  };
}

function basePath(fixed) {
  if (fixed.category) return `/categoria/${fixed.category}`;
  if (fixed.brand) return `/marca/${fixed.brand}`;
  return '/produtos';
}

function stateToQuery(st, fixed) {
  return qs({
    q: st.q, categoria: fixed.category ? '' : st.categoria, marca: fixed.brand ? '' : st.marca,
    min: st.min, max: st.max, disponivel: st.disponivel ? '1' : '', promo: st.promo ? '1' : '', secao: st.secao,
    ordem: st.ordem !== 'relevance' ? st.ordem : '',
  });
}

function filtersHtml(f, st, fixed, store) {
  const brandsSel = new Set(st.marca.split(',').filter(Boolean));
  const cats = fixed.category ? [] : store.categories;
  return `
    <form data-filters>
      ${cats.length ? `<h3>Categoria</h3>
        <label class="check"><input type="radio" name="categoria" value="" ${!st.categoria ? 'checked' : ''}> Todas</label>
        ${cats.map((c) => {
          const n = f.categories.find((x) => x.slug === c.slug)?.count || 0;
          return `<label class="check"><input type="radio" name="categoria" value="${esc(c.slug)}" ${st.categoria === c.slug ? 'checked' : ''}> ${esc(c.name)} <span class="n">${n}</span></label>`;
        }).join('')}` : ''}
      ${!fixed.brand && f.brands.length ? `<h3>Marca</h3>
        ${f.brands.map((b) => `<label class="check"><input type="checkbox" name="marca" value="${esc(b.slug)}" ${brandsSel.has(b.slug) ? 'checked' : ''}> ${esc(b.name)} <span class="n">${b.count}</span></label>`).join('')}` : ''}
      <h3>Preço (R$)</h3>
      <div class="price-range">
        <input class="input" name="min" inputmode="numeric" placeholder="${f.price ? Math.floor(f.price.min / 100) : 'Mín.'}" value="${esc(st.min)}" aria-label="Preço mínimo em reais">
        <span>–</span>
        <input class="input" name="max" inputmode="numeric" placeholder="${f.price ? Math.ceil(f.price.max / 100) : 'Máx.'}" value="${esc(st.max)}" aria-label="Preço máximo em reais">
      </div>
      <h3>Disponibilidade</h3>
      <label class="check"><input type="checkbox" name="disponivel" ${st.disponivel ? 'checked' : ''}> Somente com estoque</label>
      <label class="check"><input type="checkbox" name="promo" ${st.promo ? 'checked' : ''}> Somente ofertas</label>
      <button type="submit" class="btn btn--dark btn--block" style="margin-top:14px" data-apply>Aplicar</button>
    </form>`;
}

function formToState(form, st) {
  const fd = new FormData(form);
  const num = (v) => String(v || '').replace(/\D/g, '');
  return {
    ...st,
    categoria: fd.has('categoria') ? fd.get('categoria') : st.categoria,
    marca: fd.getAll('marca').join(','),
    min: num(fd.get('min')), max: num(fd.get('max')),
    disponivel: fd.has('disponivel'), promo: fd.has('promo'),
  };
}

function chipsHtml(st, fixed, f, store) {
  const chips = [];
  if (st.q) chips.push(['q', `Busca: “${st.q}”`]);
  if (st.categoria && !fixed.category) chips.push(['categoria', store.categories.find((c) => c.slug === st.categoria)?.name || st.categoria]);
  for (const b of st.marca.split(',').filter(Boolean)) if (!fixed.brand) chips.push([`marca:${b}`, f.brands.find((x) => x.slug === b)?.name || b]);
  if (st.min) chips.push(['min', `A partir de R$ ${st.min}`]);
  if (st.max) chips.push(['max', `Até R$ ${st.max}`]);
  if (st.disponivel) chips.push(['disponivel', 'Com estoque']);
  if (st.promo) chips.push(['promo', 'Ofertas']);
  if (st.secao) chips.push(['secao', SECTION_TITLES[st.secao] || st.secao]);
  if (!chips.length) return '';
  return `<div class="chips">${chips.map(([k, label]) => `<span class="chip">${esc(label)} <button type="button" data-unset="${esc(k)}" aria-label="Remover filtro ${esc(label)}">×</button></span>`).join('')}
    <button type="button" class="link small" data-clear>Limpar filtros</button></div>`;
}

export async function renderCatalog(ctx, fixed = {}) {
  const store = ctx.store;
  const main = $('#main');
  let st = readState(fixed);
  const catName = fixed.category ? store.categories.find((c) => c.slug === fixed.category)?.name : null;
  let title = catName || (st.secao ? SECTION_TITLES[st.secao] : st.q ? 'Resultados da busca' : 'Todos os produtos');
  document.title = `${title} | ${store.store.name}`;

  main.innerHTML = `
    <div class="wrap">
      <div class="page-head">
        <nav class="crumbs" aria-label="Você está em"><a href="${href('/')}" data-link>Início</a><span>›</span><span>${esc(title)}</span></nav>
        <h1 class="h-display" style="font-size:24px" data-title>${esc(title)}</h1>
      </div>
      <div class="layout">
        <aside class="filters" aria-label="Filtros" data-side></aside>
        <div>
          <div class="toolbar">
            <button class="btn btn--ghost btn--sm filter-open" data-open-filters>${icon('filter')} Filtrar</button>
            <span class="toolbar__count" data-count aria-live="polite"></span>
            <label class="sr" for="sort">Ordenar</label>
            <select id="sort" data-sort>${SORTS.map(([v, l]) => `<option value="${v}" ${st.ordem === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </div>
          <div data-chips></div>
          <div class="grid" data-results>${skeletonCards(8)}</div>
        </div>
      </div>
    </div>`;

  let lastFacets = { brands: [], categories: [], price: null };
  let seq = 0;

  async function load() {
    const my = ++seq;
    const params = qs({
      q: st.q, categoria: st.categoria, marca: st.marca,
      min: st.min ? Number(st.min) * 100 : '', max: st.max ? Number(st.max) * 100 : '',
      disponivel: st.disponivel ? '1' : '', promo: st.promo ? '1' : '', secao: st.secao, ordem: st.ordem, limite: 200,
    });
    const results = $('[data-results]', main);
    let data;
    try {
      data = await api(`/api/products${params}`);
    } catch (e) {
      if (my !== seq) return;
      results.outerHTML = `<div data-results>${errorHtml(e)}</div>`;
      $('[data-results] [data-retry]', main)?.addEventListener('click', () => { $('[data-results]', main).outerHTML = `<div class="grid" data-results>${skeletonCards(4)}</div>`; load(); });
      return;
    }
    if (my !== seq) return;
    lastFacets = data.facets;
    $('[data-count]', main).textContent = `${data.total} ${data.total === 1 ? 'produto' : 'produtos'}`;
    $('[data-chips]', main).innerHTML = chipsHtml(st, fixed, data.facets, store);
    $('[data-side]', main).innerHTML = filtersHtml(data.facets, st, fixed, store);
    const hasFilters = !!(st.q || (st.categoria && !fixed.category) || (st.marca && !fixed.brand) || st.min || st.max || st.disponivel || st.promo || st.secao);
    const res = $('[data-results]', main);
    if (!data.products.length) {
      res.outerHTML = `<div data-results>${emptyHtml({
        title: 'Nenhum produto encontrado',
        text: st.q ? `Não encontramos resultados para “${st.q}”. Confira a grafia ou tente um termo mais geral.` : 'Nenhum produto corresponde aos filtros escolhidos.',
        actions: `${hasFilters ? '<button class="btn btn--dark" data-clear>Limpar filtros</button>' : ''}`,
      })}</div>`;
    } else {
      res.outerHTML = `<div class="grid" data-results>${data.products.map((p) => cardHtml(p, store)).join('')}</div>`;
    }
    ctx.products = data.products;
  }

  function apply(next, { push = true } = {}) {
    st = next;
    const url = basePath(fixed) + stateToQuery(st, fixed);
    if (push) nav(url, { replace: true });
  }

  const onSubmit = (e) => {
    if (!e.target.matches('[data-filters]')) return;
    e.preventDefault();
    apply(formToState(e.target, st));
  };
  const onChange = (e) => {
    if (e.target.matches('[data-sort]')) return apply({ ...st, ordem: e.target.value });
    const form = e.target.closest('[data-filters]');
    // Na lateral (desktop) aplica ao marcar; os campos de preço aplicam ao sair do campo.
    if (form && form.closest('[data-side]') && e.target.type !== 'text') apply(formToState(form, st));
    if (form && form.closest('[data-side]') && (e.target.name === 'min' || e.target.name === 'max')) apply(formToState(form, st));
  };
  const onClick = (e) => {
    const un = e.target.closest('[data-unset]');
    if (un) {
      const k = un.dataset.unset;
      const next = { ...st };
      if (k.startsWith('marca:')) next.marca = st.marca.split(',').filter((b) => b !== k.slice(6)).join(',');
      else next[k] = k === 'disponivel' || k === 'promo' ? false : '';
      if (k === 'q') $('#q').value = '';
      return apply(next);
    }
    if (e.target.closest('[data-clear]')) {
      $('#q').value = '';
      return apply({ ...readState({}), q: '', categoria: fixed.category || '', marca: fixed.brand || '', min: '', max: '', disponivel: false, promo: false, secao: '', ordem: st.ordem });
    }
    if (e.target.closest('[data-open-filters]')) {
      openSheet({
        title: 'Filtrar produtos',
        html: filtersHtml(lastFacets, st, fixed, store),
        onMount(sheet, close) {
          sheet.addEventListener('submit', (ev) => {
            ev.preventDefault();
            close();
            apply(formToState(ev.target, st));
          });
        },
      });
    }
  };
  main.addEventListener('submit', onSubmit);
  main.addEventListener('change', onChange);
  main.addEventListener('click', onClick);
  await load();
  return () => {
    main.removeEventListener('submit', onSubmit);
    main.removeEventListener('change', onChange);
    main.removeEventListener('click', onClick);
  };
}
