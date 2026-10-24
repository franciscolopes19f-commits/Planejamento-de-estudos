import { api, esc, icon, link, formatBRL, fmtDate, toast, confirmBox, go } from '../lib.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '/shared/status.js';

const SETUP_LINK = { config: '/config/loja', entrega: '/config/entrega', paginas: '/paginas', produtos: '/produtos', banners: '/banners', pagamentos: '/config/vendas' };

export function orderRow(o) {
  const st = ORDER_STATUS[o.status]?.label || o.status;
  const cls = ['novo', 'aguardando_pagamento', 'revisar'].includes(o.status) ? 'pill--warn' : ['cancelado', 'expirado'].includes(o.status) ? '' : 'pill--ok';
  return `<a class="li" href="${link(`/pedidos/${o.id}`)}" data-nav>
    <div class="li__main">
      <div class="li__title">${esc(o.code)} · ${esc(o.customer?.name || '')}</div>
      <div class="li__sub">${fmtDate(o.created_at)} · ${o.channel === 'whatsapp' ? 'WhatsApp' : o.channel === 'site' ? 'Site' : 'Balcão'}</div>
      <div class="row" style="margin-top:4px"><span class="pill ${cls}">${esc(st)}</span><span class="pill ${o.payment_status === 'aprovado' ? 'pill--ok' : ''}">${esc(PAYMENT_STATUS[o.payment_status] || '')}</span></div>
    </div>
    <div class="li__end">${formatBRL(o.total_cents)}${o.total_is_final ? '' : '<div class="xs muted">+ frete</div>'}</div>
    ${icon('chev').replace('<svg', '<svg class="chev"')}
  </a>`;
}

export async function renderDashboard(el) {
  const d = await api('/dashboard');
  const pending = d.setup.filter((s) => !s.ok);
  const byStatus = d.orders_by_status;
  const active = d.products.find((p) => p.status === 'active')?.n || 0;
  const drafts = d.products.find((p) => p.status === 'draft')?.n || 0;
  el.innerHTML = `
    <div class="kpis">
      <a class="kpi kpi--hl" href="${link('/pedidos?status=novo')}" data-nav><b>${byStatus.novo || 0}</b><span>Pedidos novos (WhatsApp)</span></a>
      <a class="kpi" href="${link('/pedidos?status=abertos')}" data-nav><b>${d.orders_open}</b><span>Pedidos em aberto</span></a>
      <div class="kpi"><b>${formatBRL(d.paid_24h_cents)}</b><span>Recebido nas últimas 24h</span></div>
      <a class="kpi" href="${link('/produtos')}" data-nav><b>${active}</b><span>Produtos publicados${drafts ? ` · ${drafts} rascunho(s)` : ''}</span></a>
    </div>

    ${byStatus.revisar ? `<div class="card card--danger" style="margin-top:12px">${icon('alert')} <b>${byStatus.revisar} pedido(s) precisam de revisão</b> (ex.: pagamento aprovado sem estoque). <a href="${link('/pedidos?status=revisar')}" data-nav>Ver</a></div>` : ''}

    ${pending.length ? `
      <h2 class="h2">Para publicar a loja <span class="pill pill--warn">${pending.length} pendente(s)</span></h2>
      <div class="list">${pending.map((s) => `<a class="li" href="${link(SETUP_LINK[s.where] || '/mais')}" data-nav style="min-height:52px">
        <span style="color:var(--warn)">${icon('alert')}</span><div class="li__main small" style="font-weight:700">${esc(s.label)}</div>${icon('chev').replace('<svg', '<svg class="chev"')}</a>`).join('')}</div>` : ''}

    ${d.demo_products ? `<div class="card card--warn" style="margin-top:12px">
      <b>${d.demo_products} produto(s) de demonstração</b> estão no catálogo.
      <p class="small" style="margin:4px 0 10px">Eles existem só para você testar o fluxo. Remova antes de divulgar a loja.</p>
      <button class="btn btn--dark btn--sm" data-rmdemo>Remover demonstração</button></div>` : ''}

    <h2 class="h2">Últimos pedidos <a class="small" href="${link('/pedidos')}" data-nav>Ver todos</a></h2>
    ${d.recent_orders.length ? `<div class="list">${d.recent_orders.map(orderRow).join('')}</div>` : '<div class="card empty">Nenhum pedido ainda.</div>'}

    <h2 class="h2">Estoque baixo <a class="small" href="${link('/estoque')}" data-nav>Movimentar</a></h2>
    ${d.low_stock.length ? `<div class="list">${d.low_stock.map((v) => `
      <a class="li" href="${link(`/produtos/${v.product_id}`)}" data-nav style="min-height:54px">
        <div class="li__main"><div class="li__title">${esc(v.product_name)}</div><div class="li__sub">${esc([v.flavor, v.size].filter(Boolean).join(' · ') || 'Opção única')}${v.reserved ? ` · ${v.reserved} reservado(s)` : ''}</div></div>
        <span class="pill ${v.available === 0 ? 'pill--bad' : 'pill--warn'}">${v.available === 0 ? 'Esgotado' : `${v.available} disp.`}</span>
      </a>`).join('')}</div>` : '<div class="card empty">Nenhum item abaixo do mínimo.</div>'}
  `;
  el.querySelector('[data-rmdemo]')?.addEventListener('click', async () => {
    if (!(await confirmBox('Remover todos os produtos de demonstração? Produtos com pedidos serão apenas arquivados.', { ok: 'Remover', danger: true }))) return;
    const r = await api('/demo/remove', { method: 'POST' });
    toast(`${r.removed} removido(s), ${r.archived} arquivado(s).`);
    go('/', { replace: true });
  });
}
