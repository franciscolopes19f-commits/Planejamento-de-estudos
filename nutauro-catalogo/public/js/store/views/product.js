import { api } from '../api.js';
import { cart } from '../cart.js';
import { addedToast } from '../main.js';
import { $, $$, esc, href, icon, cardHtml, priceHtml, variantPicker, qtyHtml, bindQty, absoluteUrl, WA_SVG, formatBRL, loc } from '../ui.js';
import { waLink, buildProductQuestion } from '/shared/whatsapp.js';
import { formatCep } from '/shared/shipping.js';

function galleryHtml(p) {
  const imgs = p.images.length ? p.images : [];
  if (!imgs.length) return '<div class="gallery"><div class="gallery__main"><figure><span class="muted small">Foto em breve</span></figure></div></div>';
  return `
    <div class="gallery">
      <div class="gallery__main" data-gal tabindex="0" aria-label="Fotos do produto">
        ${imgs.map((src, i) => `<figure><img src="${esc(src)}" alt="${esc(p.name)}${imgs.length > 1 ? ` — foto ${i + 1} de ${imgs.length}` : ''}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="600" height="600"></figure>`).join('')}
      </div>
      ${imgs.length > 1 ? `
        <div class="gallery__dots" aria-hidden="true">${imgs.map((_, i) => `<span aria-current="${i === 0}"></span>`).join('')}</div>
        <div class="gallery__thumbs hide-sm">${imgs.map((src, i) => `<button type="button" data-thumb="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
    </div>`;
}

function nutritionHtml(p) {
  const n = p.nutrition;
  if (!n || !Array.isArray(n.rows) || !n.rows.length) return '';
  return `
    <details class="details"><summary>Tabela nutricional</summary><div>
      ${n.serving ? `<p class="small" style="margin:0 0 8px">Porção: ${esc(n.serving)}</p>` : ''}
      <table class="nutri"><thead><tr><th>Nutriente</th><th>Por porção</th>${n.rows.some((r) => r.vd) ? '<th>%VD*</th>' : ''}</tr></thead>
      <tbody>${n.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td>${n.rows.some((x) => x.vd) ? `<td>${esc(r.vd || '')}</td>` : ''}</tr>`).join('')}</tbody></table>
      ${p.nutrition_source ? `<p class="source-note">Fonte: ${esc(p.nutrition_source)}</p>` : ''}
    </div></details>`;
}

export async function renderProduct(ctx, slug) {
  const main = $('#main');
  const store = ctx.store;
  main.innerHTML = `<div class="wrap pdp"><div class="sk" style="aspect-ratio:1"></div><div><div class="sk" style="height:28px;width:60%;margin-bottom:12px"></div><div class="sk" style="height:120px"></div></div></div>`;
  const { product: p, related } = await api(`/api/products/${encodeURIComponent(slug)}`);
  document.title = `${p.name}${p.brand ? ` — ${p.brand.name}` : ''} | ${store.store.name}`;
  const { query } = loc();
  let qty = 1;
  let variant = null;
  let missing = [];
  const pageUrl = absoluteUrl(`/produto/${p.slug}`);

  main.innerHTML = `
    <div class="wrap">
      <nav class="crumbs" aria-label="Você está em" style="padding-top:12px">
        <a href="${href('/')}" data-link>Início</a><span>›</span>
        ${p.category ? `<a href="${href(`/categoria/${p.category.slug}`)}" data-link>${esc(p.category.name)}</a><span>›</span>` : ''}
        <span>${esc(p.name)}</span>
      </nav>
      <div class="pdp">
        ${galleryHtml(p)}
        <div>
          ${p.brand ? `<a class="pdp__brand" href="${href(`/marca/${p.brand.slug}`)}" data-link>${esc(p.brand.name)}</a>` : ''}
          <h1 class="pdp__name">${esc(p.name)}</h1>
          ${p.presentation ? `<p class="pdp__pres">${esc(p.presentation)}</p>` : ''}
          ${p.is_demo ? '<div class="notice"><span>' + icon('info') + '</span><span>Produto ilustrativo de demonstração. Preço, estoque e imagem não são reais.</span></div>' : ''}
          <div class="pdp__price" data-price aria-live="polite"></div>
          <div data-picker></div>
          <div class="stock-line" data-stock></div>
          <div class="buy-row"><span data-qty></span></div>
          <div class="buybar" data-buybar>
            <div class="buybar__price" data-barprice></div>
            <button class="btn" data-addcart>${icon('cart')} Adicionar ao carrinho</button>
            <a class="btn btn--wa-icon" data-ask target="_blank" rel="noopener" aria-label="Tirar dúvida pelo WhatsApp" hidden>${WA_SVG}</a>
          </div>
          <p class="opt__hint" data-hint hidden></p>
          <a class="btn btn--ghost btn--block hide-sm" data-ask2 target="_blank" rel="noopener" style="margin-bottom:14px" hidden><span style="color:var(--wa);display:inline-flex">${WA_SVG}</span> Tirar dúvida pelo WhatsApp</a>

          <section class="box" aria-labelledby="h-ship">
            <h2 id="h-ship">Consultar entrega</h2>
            <form class="cep-form" data-cep>
              <label class="sr" for="cep-pdp">CEP</label>
              <input class="input" id="cep-pdp" name="cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" maxlength="9">
              <button class="btn btn--dark btn--sm" type="submit">Consultar</button>
            </form>
            <div data-ship aria-live="polite"></div>
          </section>

          ${p.description ? `<details class="details" open><summary>Descrição</summary><div>${esc(p.description)}</div></details>` : ''}
          ${p.ingredients ? `<details class="details"><summary>Ingredientes</summary><div>${esc(p.ingredients)}</div></details>` : ''}
          ${p.allergens ? `<details class="details"><summary>Alergênicos</summary><div>${esc(p.allergens)}</div></details>` : ''}
          ${nutritionHtml(p)}
          <p class="source-note">Informações e embalagem são de responsabilidade do fabricante. Em caso de divergência, vale o rótulo do produto.</p>
        </div>
      </div>
      ${related.length ? `<section class="sec" aria-labelledby="h-rel" style="padding-bottom:120px"><div class="sec__head"><h2 class="h-sec" id="h-rel">Você também pode gostar</h2></div>
        <div class="rail">${related.map((r) => cardHtml(r, store)).join('')}</div></section>` : ''}
    </div>`;

  // Barra fixa no celular substitui o botão flutuante de WhatsApp
  const picker = variantPicker(p, {
    initialVariantId: query.opcao,
    onChange(v, miss) {
      variant = v;
      missing = miss;
      if (v) qty = Math.max(1, Math.min(qty, v.available || 1));
      update();
    },
  });

  function update() {
    const v = variant;
    const out = v ? !v.in_stock : !p.in_stock;
    $('[data-price]', main).innerHTML = v
      ? priceHtml({ unit: v.unit_cents, regular: v.promo_price_cents != null ? v.price_cents : null, payments: store.payments, out })
        + (v.promo_ends_at ? `<span class="price__inst">Oferta válida até ${new Date(v.promo_ends_at).toLocaleDateString('pt-BR')}</span>` : '')
      : priceHtml({ unit: p.price_from_cents, regular: p.has_promo ? p.regular_from_cents : null, from: p.price_varies, payments: store.payments, out });
    $('[data-barprice]', main).innerHTML = `<span class="price__main">${formatBRL(v ? v.unit_cents : p.price_from_cents)}</span><small>${v ? esc([v.flavor, v.size].filter(Boolean).join(' · ')) : missing.length ? `Escolha ${missing.join(' e ')}` : ''}</small>`;
    const stock = $('[data-stock]', main);
    if (!v) {
      stock.className = `stock-line ${p.in_stock ? 'stock-line--pending' : 'stock-line--out'}`;
      stock.textContent = p.in_stock ? `Escolha ${missing.join(' e ') || 'a opção'} para ver a disponibilidade` : 'Produto esgotado no momento';
    } else {
      stock.className = `stock-line ${v.in_stock ? '' : 'stock-line--out'}`;
      stock.textContent = v.in_stock ? 'Disponível em estoque' : 'Esta opção está esgotada';
    }
    const max = Math.max(1, v?.available || 1);
    $('[data-qty]', main).innerHTML = qtyHtml(qty, max);
    const btn = $('[data-addcart]', main);
    btn.disabled = !!v && !v.in_stock || (!v && !p.in_stock);
    btn.innerHTML = btn.disabled ? 'Esgotado' : `${icon('cart')} ${missing.length ? 'Escolher opção' : '<span>Adicionar<span class="only-lg"> ao carrinho</span></span>'}`;
    const ask = waLink(store.store.whatsapp, buildProductQuestion({ ...p, brand_name: p.brand?.name }, v, pageUrl));
    for (const a of $$('[data-ask], [data-ask2]', main)) {
      a.hidden = !ask;
      if (ask) a.href = ask;
    }
    $('[data-hint]', main).hidden = true;
    // Link compartilhável com a opção escolhida
    if (v && p.variants.length > 1) history.replaceState(history.state, '', window.NT_DEMO ? `#/produto/${p.slug}?opcao=${v.id}` : `/produto/${p.slug}?opcao=${v.id}`);
  }

  picker.mount($('[data-picker]', main));
  bindQty($('[data-qty]', main), { get: () => qty, set: (n) => { qty = n; update(); }, max: () => Math.max(1, variant?.available || 1) });

  $('[data-addcart]', main).addEventListener('click', () => {
    const hint = $('[data-hint]', main);
    if (!variant) {
      hint.hidden = false;
      hint.textContent = `Escolha ${missing.join(' e ')} antes de adicionar.`;
      $('[data-picker] .opt__btn', main)?.focus();
      $('[data-picker]', main).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!variant.in_stock) return;
    addedToast(cart.add(p, variant, qty));
  });

  // Galeria: miniaturas e indicadores
  const gal = $('[data-gal]', main);
  const onThumb = (e) => {
    const t = e.target.closest('[data-thumb]');
    if (t && gal) gal.scrollTo({ left: gal.clientWidth * Number(t.dataset.thumb), behavior: 'smooth' });
  };
  main.addEventListener('click', onThumb);
  if (gal && p.images.length > 1) {
    gal.addEventListener('scroll', () => {
      const i = Math.round(gal.scrollLeft / gal.clientWidth);
      $$('.gallery__dots span', main).forEach((d, j) => d.setAttribute('aria-current', String(i === j)));
      $$('[data-thumb]', main).forEach((d, j) => d.setAttribute('aria-current', String(i === j)));
    }, { passive: true });
  }

  // Consulta de entrega
  const cepInput = $('#cep-pdp', main);
  try { cepInput.value = localStorage.getItem('nt_cep') || ''; } catch {}
  cepInput.addEventListener('input', () => {
    const d = cepInput.value.replace(/\D/g, '').slice(0, 8);
    cepInput.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  });
  $('[data-cep]', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('[data-ship]', main);
    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) { out.innerHTML = '<p class="err">Informe um CEP com 8 dígitos.</p>'; return; }
    out.innerHTML = '<div class="loading-block" style="padding:14px 0"><div class="spinner"></div></div>';
    try {
      try { localStorage.setItem('nt_cep', cep); } catch {}
      const items = variant ? [{ variant_id: variant.id, qty }] : [];
      const q = await api('/api/shipping/quote', { method: 'POST', body: { cep, items } });
      out.innerHTML = shippingListHtml(q);
    } catch (err) {
      out.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  });
  return () => main.removeEventListener('click', onThumb);
}

export function shippingListHtml(q) {
  if (q.error) return `<p class="err">${esc(q.error)}</p>`;
  const opts = q.options.map((o) => {
    const price = o.status === 'pickup' ? 'Grátis' : o.status === 'free' ? 'Grátis' : o.status === 'fixed' ? formatBRL(o.fee_cents) : 'A confirmar';
    return `<li><span><b>${esc(o.label)}</b><br><span class="small muted">${esc(o.estimate?.text || '')}</span>
      ${o.status === 'to_confirm' ? '<br><span class="small muted">O valor do frete é informado pela loja no atendimento.</span>' : ''}</span><b>${price}</b></li>`;
  }).join('');
  return `${q.cep ? `<p class="small muted" style="margin:10px 0 0">CEP ${esc(formatCep(q.cep))}${q.zone ? ` · ${esc(q.zone.name)}` : ''}</p>` : ''}
    ${q.message ? `<p class="small" style="margin:8px 0 0">${esc(q.message)}</p>` : ''}
    <ul class="ship-opts">${opts}</ul>
    <p class="source-note">Prazos contam a partir da confirmação do pedido e dependem de estoque, horário e dias de funcionamento.</p>`;
}
