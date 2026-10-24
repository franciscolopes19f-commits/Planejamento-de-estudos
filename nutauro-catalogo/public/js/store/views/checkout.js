import { api } from '../api.js';
import { cart } from '../cart.js';
import { $, $$, esc, href, icon, nav, emptyHtml, formatBRL, WA_SVG } from '../ui.js';
import { summaryHtml } from './cart.js';
import { PAYMENT_LABELS, normalizePhoneBR } from '/shared/whatsapp.js';
import { formatCep } from '/shared/shipping.js';

const DRAFT_KEY = 'nt_checkout_v1';

function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}
function saveDraft(d) {
  const keep = { ...d, quote: undefined, error: undefined, busy: undefined };
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(keep));
    // Nome, telefone e endereço ficam salvos neste aparelho para a próxima compra.
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: d.name, phone: d.phone, email: d.email, address: d.address, fulfillment: d.fulfillment }));
  } catch {}
}

export async function renderCheckout(ctx) {
  const store = ctx.store;
  const main = $('#main');
  document.title = `Finalizar pedido | ${store.store.name}`;
  if (!cart.items.length) {
    main.innerHTML = `<div class="wrap" style="padding:24px 0 40px">${emptyHtml({ ic: 'cart', title: 'Seu carrinho está vazio', text: 'Adicione produtos para finalizar um pedido.', actions: `<a class="btn" href="${href('/produtos')}" data-link>Ver produtos</a>` })}</div>`;
    return;
  }
  const ch = store.channels;
  if (!ch.whatsapp && !ch.site) {
    main.innerHTML = `<div class="wrap" style="padding:24px 0 40px">${emptyHtml({ ic: 'info', title: 'Pedidos indisponíveis no momento', text: 'A loja ainda está configurando os canais de pedido. Tente novamente mais tarde.', actions: `<a class="btn btn--dark" href="${href('/carrinho')}" data-link>Voltar ao carrinho</a>` })}</div>`;
    return;
  }

  // Revalida carrinho no servidor antes de mostrar valores
  let lines = cart.items;
  try {
    const r = await api('/api/cart/price', { method: 'POST', body: { items: cart.payload() } });
    cart.sync(r.lines);
    lines = cart.items;
    if (r.problems.length) { nav('/carrinho'); return; }
  } catch { /* segue com retrato local; o servidor valida ao registrar */ }

  const draft = loadDraft();
  const st = {
    channel: ch.whatsapp && ch.site ? draft.channel || 'whatsapp' : ch.whatsapp ? 'whatsapp' : 'site',
    fulfillment: draft.fulfillment === 'pickup' && !store.pickup.enabled ? '' : draft.fulfillment || '',
    name: draft.name || '', phone: draft.phone || '', email: draft.email || '',
    address: draft.address || { cep: '' },
    payment_method: draft.payment_method || '',
    notes: draft.notes || '',
    quote: null, error: null, busy: false, cepMsg: '',
  };
  if (st.channel === 'site' && !['pix', 'card'].includes(st.payment_method)) st.payment_method = 'pix';

  const shipping = () => {
    if (st.fulfillment === 'pickup') return { status: 'pickup', fee_cents: 0 };
    if (st.fulfillment === 'delivery') {
      const o = st.quote?.options.find((x) => x.kind === 'delivery');
      return o ? { status: o.status, fee_cents: o.fee_cents } : { status: 'none' };
    }
    return { status: 'none' };
  };
  const deliveryOpt = () => st.quote?.options.find((x) => x.kind === 'delivery');

  function stepChannel() {
    if (!(ch.whatsapp && ch.site)) return '';
    return `<section class="step"><h2><i>•</i>Como prefere finalizar?</h2><div class="choices">
      <label class="choice"><input type="radio" name="channel" value="whatsapp" ${st.channel === 'whatsapp' ? 'checked' : ''}>
        <span><b>Pelo WhatsApp</b><small>A equipe confirma disponibilidade, frete e forma de pagamento com você.</small></span></label>
      <label class="choice"><input type="radio" name="channel" value="site" ${st.channel === 'site' ? 'checked' : ''}>
        <span><b>Pagar pelo site</b><small>Pix ou cartão em ambiente seguro do provedor de pagamento.</small></span></label>
    </div></section>`;
  }

  function stepFulfillment(n) {
    const o = deliveryOpt();
    return `<section class="step"><h2><i>${n}</i>Recebimento</h2><div class="choices">
      ${store.pickup.enabled ? `<label class="choice"><input type="radio" name="fulfillment" value="pickup" ${st.fulfillment === 'pickup' ? 'checked' : ''}>
        <span><b>Retirar na loja</b><small>${esc(store.pickup.address || store.store.address || 'Endereço informado na confirmação')}</small>
        ${store.pickup.estimate_text ? `<small>${esc(store.pickup.estimate_text)}</small>` : ''}</span><span class="choice__price">Grátis</span></label>` : ''}
      <label class="choice"><input type="radio" name="fulfillment" value="delivery" ${st.fulfillment === 'delivery' ? 'checked' : ''}>
        <span><b>Receber em casa</b><small>${o ? esc(o.estimate.text) : 'Informe o CEP para ver prazo e frete'}</small></span>
        ${o ? `<span class="choice__price">${o.status === 'free' ? 'Grátis' : o.status === 'fixed' ? formatBRL(o.fee_cents) : 'A confirmar'}</span>` : ''}</label>
    </div></section>`;
  }

  function stepContact(n) {
    const privacy = store.pages.find((p) => p.slug === 'privacidade');
    return `<section class="step"><h2><i>${n}</i>Seus dados</h2><div class="fields">
      <div class="field"><label for="f-name">Nome completo</label><input class="input" id="f-name" name="name" autocomplete="name" value="${esc(st.name)}" required></div>
      <div class="field field--sm-3"><label for="f-phone">WhatsApp com DDD</label><input class="input" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" value="${esc(st.phone)}" required></div>
      ${st.channel === 'site' ? `<div class="field field--sm-3"><label for="f-email">E-mail <small>(opcional, para o comprovante)</small></label><input class="input" id="f-email" name="email" type="email" autocomplete="email" value="${esc(st.email)}"></div>` : ''}
    </div>
    <p class="small muted" style="margin:10px 0 0">Usamos seus dados apenas para processar e entregar este pedido.${privacy ? ` <a href="${href('/pagina/privacidade')}" data-link>Privacidade</a>.` : ''}</p>
    </section>`;
  }

  function stepAddress(n) {
    if (st.fulfillment !== 'delivery') return '';
    const a = st.address;
    const o = deliveryOpt();
    return `<section class="step"><h2><i>${n}</i>Endereço de entrega</h2><div class="fields">
      <div class="field field--sm-3"><label for="f-cep">CEP</label>
        <input class="input" id="f-cep" name="cep" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="${esc(a.cep ? formatCep(a.cep) : '')}">
        <small data-cepmsg>${esc(st.cepMsg)}</small></div>
      <div class="field field--4"><label for="f-street">Rua / avenida</label><input class="input" id="f-street" name="street" autocomplete="address-line1" value="${esc(a.street || '')}"></div>
      <div class="field field--2"><label for="f-number">Número</label><input class="input" id="f-number" name="number" inputmode="numeric" value="${esc(a.number || '')}"></div>
      <div class="field field--sm-3"><label for="f-compl">Complemento <small>(opcional)</small></label><input class="input" id="f-compl" name="complement" autocomplete="address-line2" value="${esc(a.complement || '')}"></div>
      <div class="field field--sm-3"><label for="f-district">Bairro</label><input class="input" id="f-district" name="district" value="${esc(a.district || '')}"></div>
      <div class="field field--4"><label for="f-city">Cidade</label><input class="input" id="f-city" name="city" autocomplete="address-level2" value="${esc(a.city || '')}"></div>
      <div class="field field--2"><label for="f-uf">UF</label><input class="input" id="f-uf" name="uf" maxlength="2" autocomplete="address-level1" value="${esc(a.uf || '')}"></div>
      <div class="field"><label for="f-ref">Ponto de referência <small>(opcional)</small></label><input class="input" id="f-ref" name="reference" value="${esc(a.reference || '')}"></div>
    </div>
    ${st.quote?.message ? `<div class="notice notice--info">${icon('info')}<span>${esc(st.quote.message)}</span></div>` : ''}
    ${o ? `<div class="notice ${o.status === 'to_confirm' ? '' : 'notice--ok'}">${icon(o.status === 'to_confirm' ? 'info' : 'truck')}<span><b>${esc(o.label)}</b> — ${esc(o.estimate.text)}.
      ${o.status === 'to_confirm' ? ' O valor do frete será informado pela loja.' : ''}${o.note ? ` ${esc(o.note)}` : ''}</span></div>` : ''}
    ${o && o.status === 'to_confirm' && st.channel === 'site' ? `<div class="notice notice--danger">${icon('alert')}<span>Para este CEP o frete precisa ser combinado. Escolha finalizar pelo WhatsApp ou retirar na loja.</span></div>` : ''}
    </section>`;
  }

  function stepPayment(n) {
    if (st.channel === 'site') {
      const pct = store.payments.pix_discount_pct;
      return `<section class="step"><h2><i>${n}</i>Pagamento</h2><div class="choices">
        <label class="choice"><input type="radio" name="payment_method" value="pix" ${st.payment_method === 'pix' ? 'checked' : ''}>
          <span><b>Pix</b><small>Aprovação em instantes${pct > 0 ? ` · ${pct}% de desconto nos produtos` : ''}</small></span></label>
        <label class="choice"><input type="radio" name="payment_method" value="card" ${st.payment_method === 'card' ? 'checked' : ''}>
          <span><b>Cartão de crédito</b><small>Dados do cartão digitados apenas no ambiente do provedor${store.payments.installments?.enabled && store.payments.installments.max > 1 ? ` · até ${store.payments.installments.max}x` : ''}</small></span></label>
      </div>
      ${store.channels.payment_demo ? `<div class="notice">${icon('info')}<span><b>Pagamento de demonstração.</b> Nenhum valor é cobrado; a aprovação é simulada.</span></div>` : ''}
      </section>`;
    }
    const methods = store.payments.whatsapp_methods || [];
    if (!methods.length) return '';
    return `<section class="step"><h2><i>${n}</i>Pagamento preferido <span class="small muted" style="text-transform:none;font-weight:600">(combinado no atendimento)</span></h2>
      <div class="pills">${methods.map((m) => `<label class="pill"><input type="radio" name="payment_method" value="${m}" ${st.payment_method === m ? 'checked' : ''}><span>${esc(PAYMENT_LABELS[m] || m)}</span></label>`).join('')}</div>
      ${store.payments.pix_discount_pct > 0 ? `<p class="small muted" style="margin:10px 0 0">Pagando no Pix: ${store.payments.pix_discount_pct}% de desconto nos produtos.</p>` : ''}
      <div class="field" style="margin-top:14px"><label for="f-notes">Observações <small>(opcional)</small></label><textarea class="input" id="f-notes" name="notes" maxlength="500">${esc(st.notes)}</textarea></div>
    </section>`;
  }

  function reviewHtml() {
    const sh = shipping();
    const o = deliveryOpt();
    const ready = validate(true).length === 0;
    const siteBlocked = st.channel === 'site' && sh.status === 'to_confirm';
    const resMin = st.channel === 'site' ? store.checkout.site_reservation_minutes : store.checkout.whatsapp_reservation_minutes;
    return `
      <ul class="mini-items">${lines.map((l) => `<li><span>${l.qty}× ${esc(l.product_name)}${[l.flavor, l.size].filter(Boolean).length ? ` <span class="muted">(${esc([l.flavor, l.size].filter(Boolean).join(' · '))})</span>` : ''}</span><b>${formatBRL(l.unit_cents * l.qty)}</b></li>`).join('')}</ul>
      ${summaryHtml(lines, store, { shipping: sh, paymentMethod: st.payment_method, title: 'Resumo do pedido' })}
      ${st.fulfillment === 'delivery' && o ? `<p class="sumnote">${esc(o.estimate.text)}</p>` : ''}
      ${st.error ? `<div class="notice notice--danger" role="alert">${icon('alert')}<span>${esc(st.error)}</span></div>` : ''}
      <div class="checkout-bar">
        ${st.channel === 'whatsapp'
          ? `<button class="btn btn--wa btn--block" data-submit ${st.busy ? 'disabled' : ''}>${st.busy ? '<span class="spinner"></span>' : WA_SVG} Continuar para o WhatsApp</button>
             <p class="sumnote" style="margin:0">Registramos o pedido e reservamos os itens por ${resMin >= 60 ? `${Math.round(resMin / 60)}h` : `${resMin} min`}. Em seguida você envia a mensagem pronta pelo WhatsApp; o pedido é confirmado pela loja.</p>`
          : `<button class="btn btn--block" data-submit ${st.busy || siteBlocked ? 'disabled' : ''}>${st.busy ? '<span class="spinner"></span>' : icon('card')} Ir para o pagamento</button>
             <p class="sumnote" style="margin:0">Itens reservados por ${resMin} min enquanto você paga. A venda é confirmada quando o provedor aprovar o pagamento.</p>`}
        ${!ready ? '<p class="sumnote" style="margin:0" data-missing></p>' : ''}
      </div>`;
  }

  function validate(silent = false) {
    const errs = [];
    if (!st.fulfillment) errs.push('escolha retirada ou entrega');
    if (!st.name || st.name.trim().length < 2) errs.push('informe seu nome');
    if (!normalizePhoneBR(st.phone)) errs.push('informe um WhatsApp válido com DDD');
    if (st.channel === 'site' && st.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(st.email)) errs.push('confira o e-mail');
    if (st.fulfillment === 'delivery') {
      const a = st.address;
      if (String(a.cep || '').replace(/\D/g, '').length !== 8) errs.push('informe o CEP');
      for (const [k, l] of [['street', 'a rua'], ['number', 'o número'], ['district', 'o bairro'], ['city', 'a cidade'], ['uf', 'a UF']]) if (!a[k]) errs.push(`informe ${l}`);
      if (!deliveryOpt() && String(a.cep || '').replace(/\D/g, '').length === 8) errs.push('entrega indisponível para este CEP');
    }
    if (st.channel === 'site' && !['pix', 'card'].includes(st.payment_method)) errs.push('escolha a forma de pagamento');
    return errs;
  }

  function draw() {
    let n = 0;
    main.innerHTML = `
      <div class="wrap">
        <div class="page-head"><nav class="crumbs"><a href="${href('/carrinho')}" data-link>Carrinho</a><span>›</span><span>Finalizar</span></nav>
          <h1 class="h-display" style="font-size:24px">Finalizar pedido</h1></div>
        <form class="cart-layout" data-form novalidate>
          <div class="steps">
            ${stepChannel()}${stepFulfillment(++n)}${stepContact(++n)}${st.fulfillment === 'delivery' ? stepAddress(++n) : ''}${stepPayment(++n)}
          </div>
          <aside class="summary" data-review aria-label="Resumo">${reviewHtml()}</aside>
        </form>
      </div>`;
    updateMissing();
  }

  function redrawReview() {
    $('[data-review]', main).innerHTML = reviewHtml();
    updateMissing();
  }
  function updateMissing() {
    const m = $('[data-missing]', main);
    if (m) {
      const errs = validate(true);
      m.textContent = errs.length ? `Para continuar: ${errs.join(', ')}.` : '';
    }
  }

  async function lookupCep() {
    const cep = String(st.address.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return;
    st.cepMsg = 'Consultando CEP…';
    const msg = $('[data-cepmsg]', main);
    if (msg) msg.textContent = st.cepMsg;
    // 1) Endereço (ViaCEP, serviço público). Se falhar, o cliente preenche manualmente.
    if (!window.NT_DEMO) {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
        const j = await r.json();
        if (!j.erro) {
          st.address = { ...st.address, street: st.address.street || j.logradouro, district: st.address.district || j.bairro, city: j.localidade || st.address.city, uf: j.uf || st.address.uf };
          st.cepMsg = 'Endereço encontrado. Confira e corrija se necessário.';
        } else st.cepMsg = 'CEP não encontrado na base pública. Preencha o endereço manualmente.';
      } catch {
        st.cepMsg = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
      }
    } else st.cepMsg = 'Demonstração: preencha o endereço manualmente.';
    // 2) Frete e prazo (regras da loja, no servidor)
    try {
      st.quote = await api('/api/shipping/quote', { method: 'POST', body: { cep, items: cart.payload() } });
    } catch (e) {
      st.quote = null;
      st.cepMsg = e.message;
    }
    saveDraft(st);
    draw();
  }

  const onInput = (e) => {
    const t = e.target;
    if (!t.name) return;
    if (['name', 'phone', 'email', 'notes'].includes(t.name)) st[t.name] = t.value;
    else if (['street', 'number', 'complement', 'district', 'city', 'uf', 'reference'].includes(t.name)) st.address = { ...st.address, [t.name]: t.name === 'uf' ? t.value.toUpperCase() : t.value };
    else if (t.name === 'cep') {
      const d = t.value.replace(/\D/g, '').slice(0, 8);
      t.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
      const changed = d !== String(st.address.cep || '');
      st.address = { ...st.address, cep: d };
      if (changed) st.quote = null;
      if (d.length === 8 && changed) { lookupCep(); return; }
    }
    saveDraft(st);
    if (t.type !== 'radio') { redrawReview(); return; }
  };
  const onChange = (e) => {
    const t = e.target;
    if (t.type !== 'radio') return;
    st[t.name] = t.value;
    if (t.name === 'channel' && t.value === 'site' && !['pix', 'card'].includes(st.payment_method)) st.payment_method = 'pix';
    if (t.name === 'channel' && t.value === 'whatsapp' && ['card'].includes(st.payment_method)) st.payment_method = '';
    st.error = null;
    saveDraft(st);
    draw();
    if (t.name === 'fulfillment' && t.value === 'delivery' && String(st.address.cep || '').length === 8 && !st.quote) lookupCep();
    main.querySelector(`input[name="${t.name}"][value="${t.value}"]`)?.focus();
  };
  const onSubmit = async (e) => {
    const btn = e.target.closest?.('[data-submit]');
    if (e.type === 'click' && !btn) return;
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      st.error = `Para continuar: ${errs.join(', ')}.`;
      redrawReview();
      return;
    }
    st.busy = true;
    st.error = null;
    redrawReview();
    try {
      const body = {
        channel: st.channel, items: cart.payload(), fulfillment: st.fulfillment,
        customer: { name: st.name, phone: st.phone, email: st.email },
        address: st.fulfillment === 'delivery' ? st.address : null,
        payment_method: st.payment_method || null, notes: st.notes,
      };
      const { order, token } = await api('/api/orders', { method: 'POST', body });
      cart.clear();
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      if (st.channel === 'site') {
        try {
          const pay = await api(`/api/orders/${order.code}/pay`, { method: 'POST', body: { t: token } });
          if (pay.redirect_url) { location.href = pay.redirect_url; return; }
        } catch { /* a página do pedido permite tentar o pagamento de novo */ }
      }
      nav(`/pedido/${order.code}?t=${encodeURIComponent(token)}&novo=1`);
    } catch (err) {
      st.busy = false;
      st.error = err.status === 409 && err.details?.problems
        ? 'Alguns itens mudaram de disponibilidade. Volte ao carrinho para revisar.'
        : err.message;
      redrawReview();
      if (err.status === 409) {
        const a = document.createElement('a');
        a.href = href('/carrinho'); a.dataset.link = ''; a.className = 'btn btn--dark btn--block'; a.textContent = 'Revisar carrinho';
        $('[data-review] .checkout-bar', main)?.prepend(a);
      }
    }
  };

  main.addEventListener('input', onInput);
  main.addEventListener('change', onChange);
  main.addEventListener('click', onSubmit);
  main.addEventListener('submit', onSubmit);
  draw();
  if (st.fulfillment === 'delivery' && String(st.address.cep || '').length === 8) lookupCep();
  return () => {
    main.removeEventListener('input', onInput);
    main.removeEventListener('change', onChange);
    main.removeEventListener('click', onSubmit);
    main.removeEventListener('submit', onSubmit);
  };
}
