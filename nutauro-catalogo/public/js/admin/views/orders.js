import { api, $, $$, esc, icon, link, go, current, toast, modal, confirmBox, formatBRL, parseBRL, moneyInput, fmtDate } from '../lib.js';
import { ORDER_STATUS, PAYMENT_STATUS, STOCK_STATE, ADMIN_TRANSITIONS } from '/shared/status.js';
import { PAYMENT_LABELS, waLink, formatPhoneBR } from '/shared/whatsapp.js';
import { formatCep } from '/shared/shipping.js';
import { orderRow } from './dashboard.js';

const FILTERS = [['abertos', 'Em aberto'], ['novo', 'Novos'], ['aguardando_pagamento', 'Aguard. pagamento'], ['revisar', 'Revisar'], ['confirmado', 'Confirmados'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados'], ['expirado', 'Expirados'], ['', 'Todos']];

export async function renderOrders(el) {
  const { query } = current();
  let status = query.status ?? 'abertos';
  let q = '';
  el.innerHTML = `
    <input class="input" type="search" placeholder="Buscar por número ou cliente" data-q aria-label="Buscar pedidos" style="margin-bottom:10px">
    <div class="filters">${FILTERS.map(([v, l]) => `<button class="fchip" data-s="${v}" aria-pressed="${status === v}">${l}</button>`).join('')}</div>
    <div data-list></div>`;
  async function load() {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    const { orders } = await api(`/orders?${p}`);
    $('[data-list]', el).innerHTML = orders.length ? `<div class="list">${orders.map(orderRow).join('')}</div>` : '<div class="card empty">Nenhum pedido neste filtro.</div>';
  }
  el.onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    status = b.dataset.s;
    $$('[data-s]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  };
  let t;
  $('[data-q]', el).oninput = (e) => { q = e.target.value.trim(); clearTimeout(t); t = setTimeout(load, 250); };
  await load();
}

const TRANSITION_LABEL = {
  confirmado: 'Confirmar venda (baixa no estoque)', em_separacao: 'Em separação', pronto_retirada: 'Pronto para retirada',
  saiu_entrega: 'Saiu para entrega', entregue: 'Marcar como entregue', cancelado: 'Cancelar pedido',
};

export async function renderOrder(el, id) {
  const { order: o } = await api(`/orders/${id}`);
  const S = ORDER_STATUS[o.status] || { label: o.status };
  const next = ADMIN_TRANSITIONS[o.status] || [];
  const a = o.address;
  const t = o.totals;
  const chatUrl = waLink(o.customer.phone, `Olá, ${o.customer.name.split(' ')[0]}! Sobre o seu pedido ${o.code} na Nutauro:`);
  el.innerHTML = `
    <div class="card card--dark">
      <div class="row row--between"><b style="font-size:18px">${esc(o.code)}</b><span class="pill pill--dark">${o.channel === 'whatsapp' ? 'WhatsApp' : o.channel === 'site' ? 'Site' : 'Balcão'}</span></div>
      <div class="small" style="color:#cfcdc3;margin-top:4px">${fmtDate(o.created_at)}</div>
      <div class="row" style="margin-top:10px;gap:6px">
        <span class="pill ${['novo', 'aguardando_pagamento', 'revisar'].includes(o.status) ? 'pill--warn' : ['cancelado', 'expirado'].includes(o.status) ? 'pill--bad' : 'pill--ok'}">${esc(S.label)}</span>
        <span class="pill ${o.payment_status === 'aprovado' ? 'pill--ok' : o.payment_status === 'estornado' ? 'pill--bad' : ''}">${esc(PAYMENT_STATUS[o.payment_status])}</span>
        <span class="pill">${esc(STOCK_STATE[o.stock_state])}${o.reservation_expires_at ? ` até ${fmtDate(o.reservation_expires_at)}` : ''}</span>
      </div>
    </div>

    ${o.status === 'revisar' ? `<div class="card card--danger">${icon('alert')} <b>Requer revisão.</b> Veja o histórico abaixo para o motivo.</div>` : ''}
    ${o.status === 'cancelado' && o.payment_status === 'aprovado' ? `<div class="card card--danger">${icon('alert')} Pedido cancelado com pagamento recebido. Devolva o valor e registre o estorno.</div>` : ''}

    <h2 class="h2">Ações</h2>
    <div class="stack">
      ${next.map((s) => `<button class="btn ${s === 'cancelado' ? 'btn--danger' : s === 'confirmado' ? '' : 'btn--dark'} btn--block" data-to="${s}">${esc(TRANSITION_LABEL[s] || s)}</button>`).join('')}
      ${o.payment_status !== 'aprovado' && o.payment_status !== 'estornado' && o.status !== 'cancelado' ? `<button class="btn btn--ghost btn--block" data-pay>${icon('card')} Registrar recebimento</button>` : ''}
      ${o.payment_status === 'aprovado' ? `<button class="btn btn--ghost btn--block" data-refund>Registrar estorno</button>` : ''}
      ${chatUrl ? `<a class="btn btn--wa btn--block" href="${esc(chatUrl)}" target="_blank" rel="noopener">Conversar com o cliente</a>` : ''}
    </div>
    ${o.status === 'novo' ? '<p class="hint">“Confirmar venda” baixa o estoque. Faça isso depois de combinar com o cliente. Recebimento do dinheiro é registrado separadamente.</p>' : ''}

    <h2 class="h2">Cliente</h2>
    <div class="card"><b>${esc(o.customer.name)}</b><div class="small">${esc(formatPhoneBR(o.customer.phone))}${o.customer.email ? ` · ${esc(o.customer.email)}` : ''}</div>
      <a class="small" href="${link(`/pedidos?customer=${o.customer_id}`)}" data-nav hidden>Outros pedidos</a></div>

    <h2 class="h2">${o.fulfillment === 'pickup' ? 'Retirada na loja' : 'Entrega'}</h2>
    <div class="card small">${o.fulfillment === 'pickup' ? 'Cliente vai retirar na loja.' : `
      ${esc([a.street, a.number].filter(Boolean).join(', '))}${a.complement ? ` — ${esc(a.complement)}` : ''}<br>
      ${esc(a.district)} · ${esc(a.city)}/${esc(a.uf)} · CEP ${esc(formatCep(a.cep))}${a.reference ? `<br>Ref.: ${esc(a.reference)}` : ''}
      <div class="muted" style="margin-top:6px">${esc(o.shipping?.label || '')} — ${esc(o.shipping?.estimate_text || '')}</div>`}</div>

    <h2 class="h2">Itens</h2>
    <div class="card" style="padding:4px 10px"><table class="t"><thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Total</th></tr></thead><tbody>
      ${o.items.map((i) => `<tr><td><b class="small">${esc(i.product_name)}</b><div class="xs muted">${esc([i.brand, i.variant_label, i.sku].filter(Boolean).join(' · '))}</div>
        <div class="xs muted">${formatBRL(i.unit_cents)} un.${i.unit_cost_cents != null ? ` · custo ${formatBRL(i.unit_cost_cents)}` : ''}</div></td>
        <td class="num">${i.qty}</td><td class="num">${formatBRL(i.total_cents)}</td></tr>`).join('')}
    </tbody></table>
    <dl class="kv" style="padding:10px 4px">
      <dt>Subtotal</dt><dd>${formatBRL(t.subtotal_cents)}</dd>
      ${t.promo_discount_cents ? `<dt>Ofertas</dt><dd>−${formatBRL(t.promo_discount_cents)}</dd>` : ''}
      ${t.pix_discount_cents ? `<dt>Desconto Pix</dt><dd>−${formatBRL(t.pix_discount_cents)}</dd>` : ''}
      <dt>Frete</dt><dd>${o.fulfillment === 'pickup' ? 'Retirada' : t.shipping_status === 'free' ? 'Grátis' : t.shipping_status === 'fixed' ? formatBRL(t.shipping_cents) : 'A confirmar'}</dd>
      <dt><b>Total</b></dt><dd><b>${formatBRL(t.total_cents)}</b>${t.total_is_final ? '' : ' + frete'}</dd>
      <dt>Margem bruta est.</dt><dd>${formatBRL(o.margin.gross_cents)}${o.margin.missing_cost ? ' <span class="xs muted">(custo incompleto)</span>' : ''}</dd>
      ${o.payment_method ? `<dt>Pagamento</dt><dd>${esc(PAYMENT_LABELS[o.payment_method] || o.payment_method)}</dd>` : ''}
    </dl></div>
    ${o.notes ? `<div class="card small"><b>Observação do cliente:</b> ${esc(o.notes)}</div>` : ''}

    ${o.payments.length ? `<h2 class="h2">Pagamentos</h2><div class="list">${o.payments.map((p) => `<div class="li" style="min-height:50px"><div class="li__main"><div class="li__title small">${esc(p.provider === 'manual' ? 'Registro manual' : p.provider)} · ${esc(PAYMENT_LABELS[p.method] || p.method || '')}</div><div class="li__sub">${fmtDate(p.updated_at)}${p.provider_ref && p.provider !== 'manual' ? ` · ref. ${esc(p.provider_ref)}` : ''}</div></div><div class="li__end">${formatBRL(p.amount_cents)}<div class="xs muted">${esc(p.status)}</div></div></div>`).join('')}</div>` : ''}

    <h2 class="h2">Observação interna</h2>
    <textarea class="textarea" data-notes placeholder="Visível só no painel">${esc(o.admin_notes || '')}</textarea>
    <button class="btn btn--ghost btn--sm" style="margin-top:6px" data-savenotes>Salvar observação</button>

    <h2 class="h2">Histórico</h2>
    <ul class="timeline card">${o.events.map((ev) => `<li><span><b>${fmtDate(ev.created_at)}</b> — ${esc(ev.message || ORDER_STATUS[ev.type?.replace('status:', '')]?.label || ev.type)}</span></li>`).join('')}</ul>
    <p class="xs muted">Link do cliente: <a href="${esc(o.status_url)}" target="_blank" rel="noopener">acompanhar pedido</a></p>`;

  const reload = () => go(`/pedidos/${id}`, { replace: true });
  el.onclick = async (e) => {
    const to = e.target.closest('[data-to]');
    if (to) {
      const s = to.dataset.to;
      if (s === 'cancelado' && !(await confirmBox(`Cancelar o pedido ${o.code}? ${o.stock_state === 'committed' ? 'Os itens voltam ao estoque.' : 'A reserva é liberada.'}`, { ok: 'Cancelar pedido', danger: true }))) return;
      try { await api(`/orders/${id}/status`, { method: 'POST', body: { to: s } }); toast(ORDER_STATUS[s]?.label || 'Atualizado'); reload(); }
      catch (err) {
        const short = err.details?.short;
        toast(short ? `${err.message} ${short.map((x) => `${x.name} ${x.label || ''}: ${x.available} disp.`).join('; ')}` : err.message, { bad: true });
      }
    }
    if (e.target.closest('[data-pay]')) {
      modal({
        title: 'Registrar recebimento',
        html: `<p class="small muted" style="margin:0 0 10px">Use quando o dinheiro entrou fora do site (Pix na conta, dinheiro, maquininha).</p>
          <div class="stack"><div class="field"><label>Forma</label><select class="select" data-m>${['pix', 'cash', 'card_on_delivery', 'card'].map((m) => `<option value="${m}" ${o.payment_method === m ? 'selected' : ''}>${PAYMENT_LABELS[m]}</option>`).join('')}</select></div>
          <div class="field"><label>Valor recebido</label>${moneyInput('amount', t.total_cents)}</div>
          ${t.total_is_final ? '' : '<p class="hint">Inclua o frete combinado, se houver.</p>'}
          <p class="err" data-err></p><button class="btn btn--dark" data-ok>Registrar</button></div>`,
        onMount(m, close) {
          $('[data-ok]', m).onclick = async () => {
            try {
              await api(`/orders/${id}/payment`, { method: 'POST', body: { method: $('[data-m]', m).value, amount_cents: parseBRL($('[name=amount]', m).value) } });
              close(); toast('Recebimento registrado.'); reload();
            } catch (err) { $('[data-err]', m).textContent = err.message; }
          };
        },
      });
    }
    if (e.target.closest('[data-refund]')) {
      modal({
        title: 'Registrar estorno',
        html: `<div class="stack"><div class="field"><label>Valor devolvido</label>${moneyInput('amount', t.total_cents)}</div>
          <div class="field"><label>Motivo</label><input class="input" data-r></div><p class="err" data-err></p><button class="btn btn--danger" data-ok>Registrar estorno</button></div>`,
        onMount(m, close) {
          $('[data-ok]', m).onclick = async () => {
            try {
              await api(`/orders/${id}/refund`, { method: 'POST', body: { amount_cents: parseBRL($('[name=amount]', m).value), reason: $('[data-r]', m).value } });
              close(); toast('Estorno registrado.'); reload();
            } catch (err) { $('[data-err]', m).textContent = err.message; }
          };
        },
      });
    }
    if (e.target.closest('[data-savenotes]')) {
      await api(`/orders/${id}/notes`, { method: 'POST', body: { admin_notes: $('[data-notes]', el).value } });
      toast('Observação salva.');
    }
  };
}
