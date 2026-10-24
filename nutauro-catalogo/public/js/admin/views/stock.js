import { api, $, $$, esc, icon, link, current, toast, modal, fmtDate, parseBRL, moneyInput, formatBRL } from '../lib.js';

const TYPE_LABEL = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda', devolucao: 'Devolução' };

/** Entrada, saída (com motivo) ou ajuste de inventário (saldo contado). */
export function openMoveModal(v, onDone, { initialType = 'entrada' } = {}) {
  let type = initialType;
  const label = [v.flavor, v.size].filter(Boolean).join(' · ');
  modal({
    title: 'Movimentar estoque',
    html: `
      <p style="margin:0 0 4px"><b>${esc(v.product_name || '')}</b>${label ? ` — ${esc(label)}` : ''}</p>
      <p class="small muted" style="margin:0 0 12px">Saldo atual: <b>${v.stock}</b>${v.reserved ? ` · ${v.reserved} reservado(s) em pedidos` : ''}</p>
      <div class="seg" role="group" aria-label="Tipo de movimento">
        ${['entrada', 'saida', 'ajuste'].map((t) => `<button type="button" data-t="${t}" aria-pressed="${t === type}">${TYPE_LABEL[t]}</button>`).join('')}
      </div>
      <div class="stack" style="margin-top:12px" data-fields></div>
      <p class="err" data-err role="alert"></p>
      <button class="btn btn--dark btn--block" data-ok>Registrar</button>`,
    onMount(m, close) {
      const fields = () => {
        $('[data-fields]', m).innerHTML = type === 'ajuste'
          ? `<div class="field"><label>Saldo contado na prateleira</label><input class="input" data-target inputmode="numeric" value="${v.stock}"><small>O sistema registra a diferença como ajuste.</small></div>
             <div class="field"><label>Motivo</label><input class="input" data-reason placeholder="Ex.: inventário mensal"></div>`
          : `<div class="field"><label>Quantidade</label><input class="input" data-qty inputmode="numeric" placeholder="0"></div>
             ${type === 'entrada' ? `<div class="field"><label>Custo unitário desta compra <small>(opcional, atualiza o custo)</small></label>${moneyInput('cost', null, { placeholder: 'opcional' })}</div>
               <div class="field"><label>Observação</label><input class="input" data-reason placeholder="Ex.: NF 1234, fornecedor"></div>`
              : '<div class="field"><label>Motivo *</label><input class="input" data-reason placeholder="Ex.: avaria, vencido, uso interno"></div>'}`;
        $('[data-fields] input', m)?.focus();
      };
      fields();
      m.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-t]');
        if (t) { type = t.dataset.t; $$('[data-t]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === t))); fields(); return; }
        if (!e.target.closest('[data-ok]')) return;
        const body = { variant_id: v.id, type, reason: $('[data-reason]', m)?.value || '' };
        if (type === 'ajuste') body.target = Number($('[data-target]', m).value.replace(/\D/g, ''));
        else body.qty = Number(($('[data-qty]', m).value || '').replace(/\D/g, ''));
        if (type === 'entrada') { const c = parseBRL($('[name="cost"]', m).value); if (c != null) body.unit_cost_cents = c; }
        try {
          const r = await api('/stock/move', { method: 'POST', body });
          close();
          toast(`Estoque atualizado. Novo saldo: ${r.balance}.`);
          onDone?.(r.balance);
        } catch (err) { $('[data-err]', m).textContent = err.message; }
      });
    },
  });
}

export async function renderStock(el) {
  const { query } = current();
  const productId = query.produto || '';
  const [{ items: low }, { movements }, { products }] = await Promise.all([
    api('/stock/low'),
    api(`/stock/movements${productId ? `?product_id=${productId}` : ''}`),
    api('/products'),
  ]);
  el.innerHTML = `
    <h2 class="h2">Movimentar</h2>
    <input class="input" type="search" placeholder="Buscar produto ou código para movimentar" data-find aria-label="Buscar produto">
    <div class="list" data-found style="margin-top:8px" hidden></div>
    <p class="hint">Dica: na aba <a href="${link('/escanear')}" data-nav>Escanear</a>, leia o código e escolha “Entrada de estoque”.</p>

    <h2 class="h2">Abaixo do mínimo</h2>
    ${low.length ? `<div class="list">${low.map((v) => `
      <button class="li" data-move='${esc(JSON.stringify({ id: v.id, flavor: v.flavor, size: v.size, stock: v.stock, reserved: v.reserved, product_name: v.product_name }))}'>
        <div class="li__main"><div class="li__title">${esc(v.product_name)}</div><div class="li__sub">${esc([v.flavor, v.size].filter(Boolean).join(' · ') || 'Opção única')} · mínimo ${v.threshold}</div></div>
        <span class="pill ${v.available ? 'pill--warn' : 'pill--bad'}">${v.available} disp.</span></button>`).join('')}</div>` : '<div class="card empty">Tudo acima do mínimo.</div>'}

    <h2 class="h2">Histórico ${productId ? '(produto)' : 'recente'}</h2>
    ${movements.length ? `<div class="card" style="padding:4px 8px;overflow-x:auto"><table class="t">
      <thead><tr><th>Quando</th><th>Produto</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Saldo</th></tr></thead>
      <tbody>${movements.map((m) => `<tr><td class="xs">${fmtDate(m.created_at)}</td>
        <td><b class="small">${esc(m.product_name)}</b><div class="xs muted">${esc([m.flavor, m.size].filter(Boolean).join(' · '))}${m.reason ? ` — ${esc(m.reason)}` : ''}${m.order_code ? ` · ${esc(m.order_code)}` : ''}${m.user_name ? ` · ${esc(m.user_name)}` : ''}</div></td>
        <td class="small">${TYPE_LABEL[m.type] || m.type}</td><td class="num" style="color:${m.qty < 0 ? 'var(--danger)' : 'var(--success)'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="num">${m.balance_after}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Sem movimentos.</div>'}`;

  // Busca para movimentar: carrega opções do produto escolhido
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  $('[data-find]', el).addEventListener('input', (e) => {
    const q = fold(e.target.value);
    const box = $('[data-found]', el);
    if (q.length < 2) { box.hidden = true; return; }
    const res = products.filter((p) => fold([p.name, p.brand_name, ...p.gtins, ...p.skus].join(' ')).includes(q)).slice(0, 8);
    box.hidden = false;
    box.innerHTML = res.length ? res.map((p) => `<button class="li" data-pick="${p.id}"><div class="li__main"><div class="li__title">${esc(p.name)}</div><div class="li__sub">${p.stock} em estoque · ${p.variants_count} opção(ões)</div></div></button>`).join('') : '<div class="empty small">Nada encontrado.</div>';
  });
  el.onclick = async (e) => {
    const mv = e.target.closest('[data-move]');
    if (mv) return openMoveModal(JSON.parse(mv.dataset.move), () => renderStock(el));
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const { product } = await api(`/products/${pick.dataset.pick}`);
      const active = product.variants.filter((v) => v.active);
      if (active.length === 1) return openMoveModal({ ...active[0], product_name: product.name }, () => renderStock(el));
      modal({
        title: 'Qual opção?',
        html: `<div class="list">${active.map((v) => `<button class="li" data-v="${v.id}"><div class="li__main"><div class="li__title">${esc([v.flavor, v.size].filter(Boolean).join(' · '))}</div><div class="li__sub">Saldo ${v.stock}</div></div></button>`).join('')}</div>`,
        onMount(m, close) {
          m.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-v]');
            if (!b) return;
            close();
            const v = active.find((x) => x.id === Number(b.dataset.v));
            openMoveModal({ ...v, product_name: product.name }, () => renderStock(el));
          });
        },
      });
    }
  };
}

export { formatBRL };
