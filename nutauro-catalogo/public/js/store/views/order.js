import { api } from '../api.js';
import { $, esc, href, icon, loc, emptyHtml, errorHtml, formatBRL, fmtDateTime, WA_SVG, toast } from '../ui.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '/shared/status.js';
import { PAYMENT_LABELS } from '/shared/whatsapp.js';
import { formatCep } from '/shared/shipping.js';

function stClass(o) {
  if (['cancelado', 'expirado', 'revisar'].includes(o.status)) return 'st--bad';
  if (['confirmado', 'em_separacao', 'pronto_retirada', 'saiu_entrega', 'entregue'].includes(o.status)) return 'st--ok';
  return 'st--wait';
}

export async function renderOrder(ctx, code) {
  const store = ctx.store;
  const main = $('#main');
  const { query } = loc();
  const token = query.t;
  document.title = `Pedido ${code} | ${store.store.name}`;
  document.body.classList.add('no-fab');
  if (!token) {
    main.innerHTML = `<div class="wrap" style="padding:24px 0">${emptyHtml({ ic: 'info', title: 'Link incompleto', text: 'Use o link completo recebido ao fazer o pedido.' })}</div>`;
    return;
  }
  let timer = null;
  let polls = 0;

  async function load() {
    let data;
    try {
      data = await api(`/api/orders/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`);
    } catch (e) {
      main.innerHTML = `<div class="wrap" style="padding:24px 0">${errorHtml(e)}</div>`;
      main.querySelector('[data-retry]')?.addEventListener('click', load);
      return;
    }
    draw(data);
    // Pagamento pelo site: acompanha até a confirmação chegar do provedor.
    const o = data.order;
    clearTimeout(timer);
    if (o.channel === 'site' && o.payment_status !== 'aprovado' && o.status === 'aguardando_pagamento' && polls++ < 60) {
      timer = setTimeout(load, 5000);
    }
  }

  function draw({ order: o, payment_demo, can_pay }) {
    const isNew = query.novo === '1';
    const S = ORDER_STATUS[o.status] || { label: o.status, hint: '' };
    const wa = o.channel === 'whatsapp';
    const a = o.address;
    const t = o.totals;
    const resUntil = o.reservation_expires_at ? fmtDateTime(o.reservation_expires_at) : null;

    let action = '';
    if (wa && ['novo', 'expirado'].includes(o.status)) {
      action = `
        <section class="box" aria-labelledby="h-send">
          <h2 id="h-send">${isNew ? 'Falta 1 passo: envie o pedido' : 'Enviar pedido pelo WhatsApp'}</h2>
          <p style="margin:0 0 12px">${o.status === 'expirado'
            ? 'A reserva expirou. Você ainda pode enviar o pedido; a loja confirma o que estiver disponível.'
            : `Toque no botão para abrir o WhatsApp com a mensagem pronta e <b>envie a mensagem</b>. Os itens ficam reservados até <b>${esc(resUntil)}</b>.`}</p>
          ${o.whatsapp_url
            ? `<a class="btn btn--wa btn--block" href="${esc(o.whatsapp_url)}" target="_blank" rel="noopener">${WA_SVG} Abrir WhatsApp com o pedido</a>`
            : `<div class="notice">${icon('info')}<span>O número de WhatsApp da loja ainda não foi configurado. ${window.NT_DEMO ? 'Para testar o envio, cadastre o seu próprio número no painel (Mais → Dados da loja) e faça um novo pedido. Abaixo está a mensagem que seria enviada.' : 'Copie a mensagem e envie à loja.'}</span></div>`}
          <p class="small muted" style="margin:10px 0">Abrir o WhatsApp não envia a mensagem automaticamente. O pedido só é confirmado depois da resposta da loja.</p>
          <details class="details"><summary>Ver mensagem</summary><div>
            <pre class="msg-preview" data-msg>${esc(o.whatsapp_message || '')}</pre>
            <button class="btn btn--ghost btn--sm" data-copy>Copiar mensagem</button>
          </div></details>
        </section>`;
    }
    if (!wa && o.status === 'aguardando_pagamento') {
      action = `
        <section class="box" aria-labelledby="h-pay">
          <h2 id="h-pay">Pagamento pendente</h2>
          <div class="notice notice--info">${icon('clock')}<span>Aguardando a confirmação do provedor de pagamento. Esta página atualiza sozinha.${resUntil ? ` Itens reservados até <b>${esc(resUntil)}</b>.` : ''}</span></div>
          ${o.payment_status === 'recusado' ? `<div class="notice notice--danger">${icon('alert')}<span>O último pagamento foi recusado. Você pode tentar novamente.</span></div>` : ''}
          ${payment_demo
            ? `<div class="notice">${icon('info')}<span><b>Demonstração:</b> nenhum valor é cobrado. Simule a resposta do provedor:</span></div>
               <div style="display:grid;gap:8px"><button class="btn" data-demo="approved">Simular pagamento aprovado</button><button class="btn btn--ghost" data-demo="rejected">Simular pagamento recusado</button></div>`
            : can_pay ? '<button class="btn btn--block" data-pay>Pagar agora</button>' : ''}
        </section>`;
    }
    if (o.status === 'confirmado' && o.payment_status === 'aprovado' && !wa) {
      action = `<div class="notice notice--ok">${icon('check')}<span><b>Pagamento recebido e venda confirmada.</b> Avisaremos pelo WhatsApp sobre ${o.fulfillment === 'pickup' ? 'a retirada' : 'a entrega'}.</span></div>`;
    }

    main.innerHTML = `
      <div class="order-hero"><div class="wrap">
        <span class="eyebrow">Pedido ${esc(o.code)}</span>
        <h1 class="h-display">${esc(S.label)}</h1>
        <p>${esc(S.hint)}</p>
        <div class="statusline">
          <span class="st ${stClass(o)}">${esc(S.label)}</span>
          <span class="st ${o.payment_status === 'aprovado' ? 'st--ok' : o.payment_status === 'recusado' || o.payment_status === 'estornado' ? 'st--bad' : ''}">${esc(PAYMENT_STATUS[o.payment_status] || o.payment_status)}</span>
          <span class="st">${o.channel === 'whatsapp' ? 'Pedido via WhatsApp' : 'Compra pelo site'}</span>
        </div>
      </div></div>
      <div class="wrap cart-layout" style="padding-top:16px">
        <div>
          ${action}
          <section class="box"><h2>Itens</h2>
            <ul class="mini-items">${o.items.map((i) => `<li><span>${i.qty}× ${esc(i.product_name)}${i.variant_label ? ` <span class="muted">(${esc(i.variant_label)})</span>` : ''}</span><b>${formatBRL(i.total_cents)}</b></li>`).join('')}</ul>
          </section>
          <section class="box"><h2>${o.fulfillment === 'pickup' ? 'Retirada' : 'Entrega'}</h2>
            ${o.fulfillment === 'pickup'
              ? `<p style="margin:0">${esc(store.pickup.address || store.store.address || 'Endereço informado pela loja na confirmação.')}</p>${store.pickup.instructions ? `<p class="small muted">${esc(store.pickup.instructions)}</p>` : ''}`
              : `<p style="margin:0">${esc([a.street, a.number].filter(Boolean).join(', '))}${a.complement ? ` — ${esc(a.complement)}` : ''}<br>${esc(a.district)} · ${esc(a.city)}/${esc(a.uf)} · CEP ${esc(formatCep(a.cep))}</p>
                 ${o.shipping?.estimate_text ? `<p class="small muted" style="margin:8px 0 0">${esc(o.shipping.estimate_text)}</p>` : ''}`}
          </section>
          <p class="small muted">Feito em ${esc(fmtDateTime(o.created_at))}. Guarde este link para acompanhar o pedido.</p>
        </div>
        <aside class="summary">
          <h2>Valores</h2>
          <div class="sumrow"><span>Subtotal</span><span>${formatBRL(t.subtotal_cents)}</span></div>
          ${t.promo_discount_cents ? `<div class="sumrow sumrow--discount"><span>Descontos de ofertas</span><span>−${formatBRL(t.promo_discount_cents)}</span></div>` : ''}
          ${t.pix_discount_cents ? `<div class="sumrow sumrow--discount"><span>Desconto no Pix</span><span>−${formatBRL(t.pix_discount_cents)}</span></div>` : ''}
          <div class="sumrow"><span>Frete</span><span>${o.fulfillment === 'pickup' ? 'Retirada' : t.shipping_status === 'free' ? 'Grátis' : t.shipping_status === 'fixed' ? formatBRL(t.shipping_cents) : 'A confirmar'}</span></div>
          <div class="sumrow sumrow--total"><span>${t.total_is_final ? 'Total' : 'Total dos produtos'}</span><span>${formatBRL(t.total_cents)}</span></div>
          ${!t.total_is_final ? '<p class="sumnote">Frete a confirmar pela loja.</p>' : ''}
          ${o.payment_method ? `<p class="sumnote">Pagamento: ${esc(PAYMENT_LABELS[o.payment_method] || o.payment_method)}</p>` : ''}
          <a class="btn btn--ghost btn--block" style="margin-top:14px" href="${href('/produtos')}" data-link>Continuar comprando</a>
        </aside>
      </div>`;
  }

  const onClick = async (e) => {
    if (e.target.closest('[data-copy]')) {
      try { await navigator.clipboard.writeText($('[data-msg]', main).textContent); toast(`${icon('check')} Mensagem copiada`); } catch { toast('Não foi possível copiar. Selecione o texto manualmente.'); }
    }
    const demo = e.target.closest('[data-demo]');
    if (demo) {
      demo.disabled = true;
      try { await api(`/api/orders/${encodeURIComponent(code)}/demo-pay`, { method: 'POST', body: { t: token, outcome: demo.dataset.demo } }); } catch (err) { toast(esc(err.message)); }
      polls = 0;
      load();
    }
    if (e.target.closest('[data-pay]')) {
      try {
        const pay = await api(`/api/orders/${encodeURIComponent(code)}/pay`, { method: 'POST', body: { t: token } });
        if (pay.redirect_url) location.href = pay.redirect_url;
      } catch (err) { toast(esc(err.message)); }
    }
  };
  main.addEventListener('click', onClick);
  main.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
  await load();
  return () => { clearTimeout(timer); main.removeEventListener('click', onClick); };
}
