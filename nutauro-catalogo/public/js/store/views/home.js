import { api } from '../api.js';
import { $, esc, href, icon, cardHtml, skeletonCards, errorHtml, formatBRL } from '../ui.js';

const SECTION_FILTER = {
  offers: (p) => p.has_promo && p.in_stock,
  featured: (p) => p.featured,
  new: (p) => p.is_new,
  kits: (p) => p.is_kit,
};
const SECTION_LINK = { offers: '/produtos?secao=offers', featured: '/produtos?secao=featured', new: '/produtos?secao=new', kits: '/produtos?secao=kits' };

const isProvisional = (b) => !!b.provisional || /mascote-provisorio/.test(b.image || '');

function heroHtml(banners, store, idx = 0) {
  if (!banners.length) return '';
  const b = banners[idx];
  const media = b.image
    ? `<picture>
         ${b.image_mobile ? `<source media="(max-width: 899px)" srcset="${esc(b.image_mobile)}">` : ''}
         <img src="${esc(b.image)}" alt="" fetchpriority="high" width="780" height="780">
       </picture>${isProvisional(b) ? '<span class="hero__tag">Arte provisória</span>' : ''}`
    : '<span>Espaço reservado para a arte do mascote (PNG/WebP, mín. 1600 × 1600 px)</span>';
  return `
  <section class="hero ${b.image ? '' : 'hero--placeholder'}" aria-roledescription="banner" data-hero>
    <div class="wrap hero__in">
      <div class="hero__media">${media}</div>
      <div class="hero__copy">
        <span class="eyebrow">${esc(store.store.city || 'Nutauro Suplementos')}</span>
        <h1 class="h-display hero__title" data-hero-title>${esc(b.title || store.store.name)}</h1>
        ${b.subtitle ? `<p class="hero__sub" data-hero-sub>${esc(b.subtitle)}</p>` : ''}
        <div class="hero__ctas">
          ${b.cta_label && b.cta_link ? `<a class="btn" href="${esc(b.cta_link.startsWith('/') ? href(b.cta_link) : b.cta_link)}" ${b.cta_link.startsWith('/') ? 'data-link' : 'target="_blank" rel="noopener"'} data-hero-cta>${esc(b.cta_label)} ${icon('arrow')}</a>` : ''}
          <a class="btn btn--ghost" href="${href('/produtos?secao=offers')}" data-link>Ofertas</a>
        </div>
        ${banners.length > 1 ? `<div class="hero__dots" role="tablist" aria-label="Banners">${banners.map((_, i) => `<button role="tab" aria-label="Banner ${i + 1}" aria-current="${i === idx}" data-banner="${i}"></button>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>`;
}

/** Benefícios: só o que está configurado no painel. */
function perksHtml(s) {
  const out = [];
  const z = s.delivery_summary.find((x) => x.sla?.type === 'same_day');
  if (z) out.push(['truck', `Entrega no mesmo dia em ${z.name}`, `Pedidos confirmados até ${z.sla.cutoff}, conforme disponibilidade`]);
  const h = s.delivery_summary.find((x) => x.sla?.type === 'hours');
  if (h) out.push(['clock', `${h.name}: até ${h.sla.hours}h`, 'Após a confirmação do pedido']);
  if (s.pickup.enabled) out.push(['store', 'Retire na loja', s.pickup.address ? s.pickup.address : 'Sem custo de entrega']);
  if (s.payments.pix_discount_pct > 0) out.push(['pix', `${s.payments.pix_discount_pct}% off no Pix`, 'Desconto aplicado no total dos produtos']);
  const inst = s.payments.installments;
  if (inst?.enabled && inst.max > 1) out.push(['card', `Até ${inst.max}x${inst.interest_free ? ' sem juros' : ''}`, inst.min_installment_cents ? `Parcela mínima ${formatBRL(inst.min_installment_cents)}` : 'No cartão']);
  const free = s.delivery_summary.find((x) => x.free_over_cents > 0);
  if (free) out.push(['truck', `Frete grátis em ${free.name}`, `Acima de ${formatBRL(free.free_over_cents)} em produtos`]);
  if (!out.length) return '';
  return `<div class="perks"><div class="wrap perks__in">${out.map(([ic, t, d]) => `<div class="perk">${icon(ic)}<span><b>${esc(t)}</b>${esc(d)}</span></div>`).join('')}</div></div>`;
}

function categoriesHtml(cats) {
  return `
  <section class="sec wrap" aria-labelledby="h-cats">
    <div class="sec__head"><h2 class="h-sec" id="h-cats">Categorias</h2></div>
    <div class="catgrid">
      ${cats.map((c) => `<a class="cattile" href="${href(`/categoria/${c.slug}`)}" data-link><span class="cattile__ic">${icon(c.slug)}</span>${esc(c.name)}</a>`).join('')}
      <a class="cattile cattile--all" href="${href('/produtos')}" data-link><span class="cattile__ic">${icon('all')}</span>Ver tudo</a>
    </div>
  </section>`;
}

function sectionHtml(sec, list, store, mascot) {
  if (!list.length) return '';
  const id = `h-${sec.kind}`;
  const items = list.slice(0, sec.max_items || 8).map((p) => cardHtml(p, store)).join('');
  const band = sec.kind === 'kits' && mascot
    ? `<div class="promo-band" style="margin-bottom:14px">
         <div class="promo-band__media"><img src="${esc(mascot)}" alt="" loading="lazy"></div>
         <div class="promo-band__copy"><span class="eyebrow" style="color:var(--yellow)">Kits Nutauro</span>
           <h3 class="h-sec">Combinações prontas</h3><p>Produtos que costumam ir juntos, em um só pedido.</p>
           <a class="btn btn--sm" href="${href(SECTION_LINK.kits)}" data-link>Ver kits</a></div>
       </div>` : '';
  return `
  <section class="sec wrap" aria-labelledby="${id}">
    <div class="sec__head"><h2 class="h-sec" id="${id}">${esc(sec.title)}</h2>
      <a class="sec__more" href="${href(SECTION_LINK[sec.kind] || '/produtos')}" data-link>Ver todos</a></div>
    ${band}
    <div class="rail">${items}</div>
  </section>`;
}

export async function renderHome(ctx) {
  const s = ctx.store;
  document.title = `${s.store.name} — ${s.store.tagline}`;
  const main = $('#main');
  main.innerHTML = `${heroHtml(s.banners, s)}${perksHtml(s)}${categoriesHtml(s.categories)}
    <section class="sec wrap"><div class="rail" data-home-loading>${skeletonCards(4)}</div></section>`;
  const unbind = bindHero(main, s);
  let data;
  try {
    data = await api('/api/products?limite=200');
  } catch (e) {
    main.querySelector('[data-home-loading]').outerHTML = errorHtml(e);
    return unbind;
  }
  ctx.products = data.products;
  const mascot = s.banners.find((b) => b.image)?.image;
  const sections = s.sections.map((sec) => sectionHtml(sec, data.products.filter(SECTION_FILTER[sec.kind] || (() => false)), s, mascot)).join('');
  const brands = s.brands.length
    ? `<section class="sec wrap" aria-labelledby="h-brands"><div class="sec__head"><h2 class="h-sec" id="h-brands">Marcas</h2></div>
         <div class="brands">${s.brands.map((b) => `<a class="brand-chip" href="${href(`/marca/${b.slug}`)}" data-link>${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}${esc(b.name)}</a>`).join('')}</div></section>`
    : '';
  const fallback = !sections.trim()
    ? `<section class="sec wrap"><div class="sec__head"><h2 class="h-sec">Produtos</h2></div><div class="grid">${data.products.slice(0, 12).map((p) => cardHtml(p, s)).join('')}</div></section>`
    : '';
  main.querySelector('[data-home-loading]').closest('section').outerHTML = `${sections}${fallback}${brands}
    <section class="sec wrap" style="text-align:center;padding-bottom:12px"><a class="btn btn--dark" href="${href('/produtos')}" data-link>Ver todos os produtos</a></section>`;
  return unbind;
}

function bindHero(main, s) {
  const onClick = (e) => {
    const b = e.target.closest('[data-banner]');
    if (!b) return;
    const i = Number(b.dataset.banner);
    main.querySelector('[data-hero]').outerHTML = heroHtml(s.banners, s, i);
    main.querySelector(`[data-banner="${i}"]`)?.focus();
  };
  main.addEventListener('click', onClick);
  return () => main.removeEventListener('click', onClick);
}
