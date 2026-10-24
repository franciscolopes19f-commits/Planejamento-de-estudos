import { api } from '../api.js';
import { cart } from '../cart.js';
import { $, esc, href, icon, emptyHtml, qtyHtml, formatBRL } from '../ui.js';
import { cartTotals, pixPrice } from '/shared/pricing.js';

export function summaryHtml(lines, store, { shipping, paymentMethod, title = 'Resumo' } = {}) {
  const t = cartTotals({ lines, shipping, paymentMethod, payments: store.payments });
  const shipText = !shipping || shipping.status === 'none' ? 'Calculado na finalização'
    : shipping.status === 'pickup' ? 'Retirada (grátis)'
      : shipping.status === 'free' ? 'Grátis'
        : shipping.status === 'fixed' ? formatBRL(shipping.fee_cents) : 'A confirmar';
  const pix = !paymentMethod && store.payments.pix_discount_pct > 0 ? pixPrice(t.total_cents, store.payments) : null;
  return `
    <h2>${esc(title)}</h2>
    <div class="sumrow"><span>Subtotal (${lines.reduce((s, l) => s + l.qty, 0)} ${lines.reduce((s, l) => s + l.qty, 0) === 1 ? 'item' : 'itens'})</span><span>${formatBRL(t.subtotal_cents)}</span></div>
    ${t.promo_discount_cents ? `<div class="sumrow sumrow--discount"><span>Descontos de ofertas</span><span>−${formatBRL(t.promo_discount_cents)}</span></div>` : ''}
    ${t.pix_discount_cents ? `<div class="sumrow sumrow--discount"><span>Desconto no Pix (${store.payments.pix_discount_pct}%)</span><span>−${formatBRL(t.pix_discount_cents)}</span></div>` : ''}
    <div class="sumrow"><span>Frete</span><span>${shipText}</span></div>
    <div class="sumrow sumrow--total"><span>${t.total_is_final ? 'Total' : 'Total dos produtos'}</span><span data-total>${formatBRL(t.total_cents)}</span></div>
    ${!t.total_is_final && shipping && shipping.status === 'to_confirm' ? '<p class="sumnote">O frete para este endereço é confirmado pela loja antes do pagamento.</p>' : ''}
    ${!shipping || shipping.status === 'none' ? '<p class="sumnote">Frete ou retirada são escolhidos na próxima etapa.</p>' : ''}
    ${pix != null ? `<p class="sumnote">No Pix: <b>${formatBRL(pix)}</b> nos produtos.</p>` : ''}`;
}

function itemHtml(it, problem) {
  const label = [it.flavor, it.size].filter(Boolean).join(' · ');
  const max = Math.max(1, Math.min(50, it.available ?? 50));
  return `
  <article class="citem" data-v="${it.variant_id}">
    <a class="citem__img" href="${href(`/produto/${it.slug}?opcao=${it.variant_id}`)}" data-link aria-hidden="true" tabindex="-1">${it.image ? `<img src="${esc(it.image)}" alt="">` : ''}</a>
    <div>
      <a class="citem__name" href="${href(`/produto/${it.slug}?opcao=${it.variant_id}`)}" data-link>${esc(it.product_name)}</a>
      <div class="citem__meta">${esc([it.brand, label].filter(Boolean).join(' · '))}</div>
      <div class="citem__meta">${formatBRL(it.unit_cents)} un.${it.regular_cents > it.unit_cents ? ` <s>${formatBRL(it.regular_cents)}</s>` : ''}</div>
      <div class="citem__row">
        ${qtyHtml(it.qty, max)}
        <span class="citem__price">${formatBRL(it.unit_cents * it.qty)}</span>
        <button class="link small" data-remove aria-label="Remover ${esc(it.product_name)}">Remover</button>
      </div>
    </div>
    ${problem ? `<div class="citem__warn" role="alert">${esc(problem.message)}${problem.code === 'insufficient' ? ' Reduza a quantidade para continuar.' : problem.code === 'out_of_stock' || problem.code === 'unavailable' ? ' Remova o item para continuar.' : ''}</div>` : ''}
  </article>`;
}

export async function renderCart(ctx) {
  const store = ctx.store;
  const main = $('#main');
  document.title = `Carrinho | ${store.store.name}`;
  let problems = new Map();

  function draw() {
    const items = cart.items;
    if (!items.length) {
      main.innerHTML = `<div class="wrap" style="padding:24px 0 40px">${emptyHtml({
        ic: 'cart', title: 'Seu carrinho está vazio',
        text: 'Explore o catálogo, escolha sabores e tamanhos e monte seu pedido.',
        actions: `<a class="btn" href="${href('/produtos')}" data-link>Ver produtos</a>`,
      })}</div>`;
      return;
    }
    const blocked = items.some((i) => problems.has(i.variant_id));
    main.innerHTML = `
      <div class="wrap">
        <div class="page-head"><h1 class="h-display" style="font-size:24px">Carrinho</h1></div>
        <div class="cart-layout">
          <div class="cart-items">${items.map((i) => itemHtml(i, problems.get(i.variant_id))).join('')}
            <a class="link small" href="${href('/produtos')}" data-link style="margin-top:6px">Continuar comprando</a>
          </div>
          <aside class="summary" aria-label="Resumo do pedido">
            ${summaryHtml(items, store)}
            ${blocked ? `<div class="notice notice--danger">${icon('alert')}<span>Ajuste os itens destacados para continuar.</span></div>` : ''}
            <div class="checkout-bar">
              <a class="btn btn--block" href="${href('/finalizar')}" data-link ${blocked ? 'aria-disabled="true" data-blocked' : ''}>Finalizar pedido ${icon('arrow')}</a>
            </div>
          </aside>
        </div>
      </div>`;
  }

  async function revalidate() {
    if (!cart.items.length) return;
    try {
      const r = await api('/api/cart/price', { method: 'POST', body: { items: cart.payload() } });
      cart.sync(r.lines);
      problems = new Map(r.problems.map((p) => [p.variant_id, p]));
    } catch { /* mantém retrato local; finalização revalida de novo */ }
    draw();
  }

  const onClick = (e) => {
    const row = e.target.closest('[data-v]');
    if (e.target.closest('[data-blocked]')) { e.preventDefault(); e.stopPropagation(); return; }
    if (!row) return;
    const id = Number(row.dataset.v);
    if (e.target.closest('[data-remove]')) { cart.remove(id); problems.delete(id); draw(); return; }
    const q = e.target.closest('[data-q]');
    if (q) {
      const it = cart.items.find((i) => i.variant_id === id);
      const max = Math.max(1, Math.min(50, it.available ?? 50));
      cart.setQty(id, Math.max(1, Math.min(max, it.qty + Number(q.dataset.q))));
      revalidate();
    }
  };
  const onChange = (e) => {
    const row = e.target.closest('[data-v]');
    if (row && e.target.matches('input')) {
      cart.setQty(Number(row.dataset.v), Number(e.target.value) || 1);
      revalidate();
    }
  };
  main.addEventListener('click', onClick, true);
  main.addEventListener('change', onChange);
  draw();
  await revalidate();
  return () => {
    main.removeEventListener('click', onClick, true);
    main.removeEventListener('change', onChange);
  };
}
