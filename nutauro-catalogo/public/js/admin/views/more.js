import { api, $, $$, esc, icon, link, go, toast, modal, confirmBox, formatBRL, parseBRL, centsToInput, moneyInput, fmtDate, uploadImage } from '../lib.js';
import { logout } from '../main.js';
import { formatCep, normalizeCep } from '/shared/shipping.js';
import { PAYMENT_LABELS, formatPhoneBR } from '/shared/whatsapp.js';

const item = (path, ic, title, sub) => `<a class="li" href="${link(path)}" data-nav><span style="width:36px;height:36px;border-radius:10px;background:var(--ink);color:var(--yellow);display:grid;place-items:center;flex:none">${icon(ic)}</span>
  <div class="li__main"><div class="li__title">${esc(title)}</div>${sub ? `<div class="li__sub">${esc(sub)}</div>` : ''}</div>${icon('chev').replace('<svg', '<svg class="chev"')}</a>`;

export async function renderMore(el) {
  el.innerHTML = `
    <h2 class="h2">Operação</h2>
    <div class="list">${item('/estoque', 'stock', 'Estoque', 'Entradas, saídas, ajustes e histórico')}${item('/clientes', 'users', 'Clientes', 'Contatos vinculados aos pedidos')}</div>
    <h2 class="h2">Loja</h2>
    <div class="list">
      ${item('/config/loja', 'store', 'Dados da loja', 'WhatsApp, endereço, CNPJ, catálogo')}
      ${item('/config/vendas', 'card', 'Vendas e pagamentos', 'WhatsApp, site, Pix, parcelamento')}
      ${item('/config/entrega', 'truck', 'Entrega e retirada', 'Regiões, CEPs, taxas, horários, feriados')}
      ${item('/banners', 'banner', 'Banners e vitrine', 'Mascote, ofertas, destaques, kits')}
      ${item('/categorias', 'tag', 'Categorias e marcas', '')}
      ${item('/paginas', 'file', 'Páginas da loja', 'Entregas, trocas, privacidade')}
    </div>
    <h2 class="h2">Dados</h2>
    <div class="list">${item('/csv', 'csv', 'Importar / exportar produtos', 'Planilha CSV e cópia de segurança')}</div>
    <h2 class="h2">Conta</h2>
    <div class="list">${item('/conta', 'lock', 'Senha de acesso', '')}<button class="li" data-logout><span style="width:36px;height:36px;display:grid;place-items:center">${icon('out')}</span><div class="li__main"><div class="li__title">Sair</div></div></button></div>
    <p class="xs muted" style="margin-top:16px">Próximos módulos planejados (ainda não disponíveis): venda no balcão com o mesmo estoque, abertura e fechamento de caixa, receitas e despesas, relatórios por período.</p>`;
  el.querySelector('[data-logout]').onclick = logout;
}

// ---------- utilidades de formulário
async function loadSettings() { return api('/settings'); }
async function saveSettings(patch) {
  const r = await api('/settings', { method: 'POST', body: patch });
  toast('Configurações salvas.');
  return r;
}
const val = (el, sel) => $(sel, el)?.value?.trim() ?? '';
const checked = (el, sel) => !!$(sel, el)?.checked;
const sw = (name, label, on, hint = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${esc(label)}</label>${hint ? `<p class="hint" style="margin:-6px 0 6px 56px">${esc(hint)}</p>` : ''}`;
const fld = (name, label, value, { hint = '', type = 'text', placeholder = '', attrs = '' } = {}) => `<div class="field"><label for="f-${name}">${esc(label)}</label><input class="input" id="f-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${attrs}>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;

// ---------- Dados da loja
export async function renderStoreSettings(el) {
  const { settings: s } = await loadSettings();
  const st = s.store;
  el.innerHTML = `
    <form data-f class="stack">
      <div class="card stack">
        ${fld('name', 'Nome da loja', st.name)}
        ${fld('tagline', 'Frase da marca', st.tagline)}
        ${fld('whatsapp', 'WhatsApp de pedidos (com DDD)', st.whatsapp ? formatPhoneBR(st.whatsapp) : '', { type: 'tel', placeholder: '(21) 9 0000-0000', hint: 'Recebe os pedidos e as dúvidas. Obrigatório para o pedido pelo WhatsApp.' })}
        ${fld('email', 'E-mail de contato', st.email, { type: 'email' })}
        ${fld('instagram', 'Instagram', st.instagram, { placeholder: '@nutauro' })}
      </div>
      <div class="card stack">
        ${fld('address', 'Endereço da loja', st.address, { hint: 'Aparece no rodapé e na retirada.' })}
        ${fld('city', 'Cidade', st.city)}
        ${fld('hours_text', 'Horário de funcionamento', st.hours_text, { placeholder: 'Seg a sáb, 9h às 19h' })}
        ${fld('cnpj', 'CNPJ', st.cnpj)}
        ${fld('public_url', 'Endereço do site (domínio)', st.public_url, { placeholder: 'https://loja.nutauro.com.br', hint: 'Usado nos links compartilhados e no retorno do pagamento.' })}
      </div>
      <h2 class="h2">Catálogo</h2>
      <div class="card">
        ${sw('show_out_of_stock', 'Mostrar produtos esgotados', s.catalog.show_out_of_stock, 'Aparecem marcados como esgotados, sem botão de compra.')}
        ${sw('brands_section_enabled', 'Mostrar seção de marcas na página inicial', s.catalog.brands_section_enabled, 'Só aparecem marcas marcadas em Categorias e marcas e que tenham produto publicado.')}
        ${fld('low_stock_default', 'Alerta de estoque mínimo (padrão)', s.catalog.low_stock_default, { attrs: 'inputmode="numeric"' })}
      </div>
      <div class="actionbar"><button class="btn" type="submit">Salvar</button></div>
    </form>`;
  $('[data-f]', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const wa = val(f, '[name=whatsapp]').replace(/\D/g, '');
    if (wa && !(wa.length === 10 || wa.length === 11 || wa.length === 12 || wa.length === 13)) return toast('WhatsApp inválido. Use DDD + número.', { bad: true });
    try {
      await saveSettings({
        store: { ...s.store, name: val(f, '[name=name]'), tagline: val(f, '[name=tagline]'), whatsapp: wa, email: val(f, '[name=email]'), instagram: val(f, '[name=instagram]'),
          address: val(f, '[name=address]'), city: val(f, '[name=city]'), hours_text: val(f, '[name=hours_text]'), cnpj: val(f, '[name=cnpj]'), public_url: val(f, '[name=public_url]') },
        catalog: { ...s.catalog, show_out_of_stock: checked(f, '[name=show_out_of_stock]'), brands_section_enabled: checked(f, '[name=brands_section_enabled]'), low_stock_default: Number(val(f, '[name=low_stock_default]')) || 0 },
      });
    } catch (err) { toast(err.message, { bad: true }); }
  };
}

// ---------- Vendas e pagamentos
export async function renderSalesSettings(el) {
  const { settings: s, integrations: integ } = await loadSettings();
  const c = s.checkout;
  const p = s.payments;
  const mp = integ.payments.mercadopago;
  const webhook = `${(s.store.public_url || integ.public_url || '').replace(/\/$/, '')}/api/webhooks/mercadopago`;
  el.innerHTML = `
    <form data-f class="stack">
      <h2 class="h2">Como o cliente finaliza</h2>
      <div class="seg" role="group" aria-label="Modo de venda">
        ${[['whatsapp', 'Só WhatsApp'], ['site', 'Só site'], ['both', 'Os dois']].map(([v, l]) => `<button type="button" data-mode="${v}" aria-pressed="${c.mode === v}">${l}</button>`).join('')}
      </div>
      <div data-mode-warn></div>
      <div class="card stack">
        <div class="grid2">
          ${fld('wa_res', 'Reserva no pedido WhatsApp (min)', c.whatsapp_reservation_minutes, { attrs: 'inputmode="numeric"', hint: 'Tempo para a loja confirmar.' })}
          ${fld('site_res', 'Reserva aguardando pagamento (min)', c.site_reservation_minutes, { attrs: 'inputmode="numeric"' })}
        </div>
        <div class="field"><label>Pedido mínimo</label>${moneyInput('min_order', c.min_order_cents || null, { placeholder: 'sem mínimo' })}</div>
        <p class="hint">O estoque fica reservado durante esse tempo e só é baixado quando a venda é confirmada (no painel ou pelo pagamento aprovado). Reservas vencidas são liberadas automaticamente.</p>
      </div>

      <h2 class="h2">Preço e condições exibidos</h2>
      <div class="card stack">
        ${fld('pix', 'Desconto no Pix (%)', p.pix_discount_pct || '', { attrs: 'inputmode="decimal"', placeholder: '0 = não exibir' })}
        ${sw('inst_on', 'Exibir parcelamento no cartão', p.installments.enabled)}
        <div class="grid2">${fld('inst_max', 'Máximo de parcelas', p.installments.max || '', { attrs: 'inputmode="numeric"' })}
          <div class="field"><label>Parcela mínima</label>${moneyInput('inst_min', p.installments.min_installment_cents || null)}</div></div>
        ${sw('inst_free', 'Sem juros', p.installments.interest_free)}
        <p class="hint">Só aparecem na loja quando configurados. Confira se as condições batem com o contrato do seu provedor/maquininha.</p>
      </div>

      <h2 class="h2">Formas aceitas no pedido pelo WhatsApp</h2>
      <div class="card">${Object.entries(PAYMENT_LABELS).filter(([k]) => k !== 'card').map(([k, l]) => sw(`wm_${k}`, l, p.whatsapp_methods.includes(k))).join('')}</div>

      <h2 class="h2">Pagamento pelo site</h2>
      <div class="card stack">
        <div class="field"><label for="f-provider">Provedor</label><select class="select" id="f-provider" name="provider">
          <option value="none" ${p.provider === 'none' ? 'selected' : ''}>Nenhum (compra pelo site desativada)</option>
          <option value="mercadopago" ${p.provider === 'mercadopago' ? 'selected' : ''}>Mercado Pago — Pix e cartão</option>
          ${integ.payments.demo_allowed ? `<option value="demo" ${p.provider === 'demo' ? 'selected' : ''}>Demonstração (não cobra nada)</option>` : ''}
        </select></div>
        <div class="small">
          <b>Mercado Pago:</b> ${mp.configured ? '<span class="pill pill--ok">credenciais configuradas</span>' : '<span class="pill pill--bad">credenciais ausentes</span>'}
          <p class="hint" style="margin:6px 0 0">As chaves ficam no servidor (variáveis MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET), nunca no painel. No painel do Mercado Pago, cadastre a URL de notificações:<br><span class="mono">${esc(webhook)}</span></p>
        </div>
      </div>
      <div class="actionbar"><button class="btn" type="submit">Salvar</button></div>
    </form>`;
  let mode = c.mode;
  const warn = () => {
    const prov = $('[name=provider]', el).value;
    const needSite = mode !== 'whatsapp';
    const siteOk = prov === 'demo' || (prov === 'mercadopago' && mp.configured);
    const waOk = !!s.store.whatsapp;
    const msgs = [];
    if (needSite && !siteOk) msgs.push('A compra pelo site só fica disponível com um provedor de pagamento configurado.');
    if (mode !== 'site' && !waOk) msgs.push('Cadastre o WhatsApp da loja em Dados da loja para receber pedidos.');
    if (prov === 'demo') msgs.push('Modo demonstração: a loja mostra “nenhum valor é cobrado”. Não use com clientes reais.');
    $('[data-mode-warn]', el).innerHTML = msgs.map((m) => `<div class="card card--warn small" style="margin-top:8px">${icon('alert')} ${esc(m)}</div>`).join('');
  };
  warn();
  el.onclick = (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    $$('[data-mode]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    warn();
  };
  $('[name=provider]', el).onchange = warn;
  $('[data-f]', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await saveSettings({
        checkout: { ...c, mode, whatsapp_reservation_minutes: Number(val(f, '[name=wa_res]')) || 120, site_reservation_minutes: Number(val(f, '[name=site_res]')) || 30, min_order_cents: parseBRL(val(f, '[name=min_order]')) || 0 },
        payments: {
          ...p, pix_discount_pct: Number(val(f, '[name=pix]').replace(',', '.')) || 0, provider: val(f, '[name=provider]'),
          installments: { enabled: checked(f, '[name=inst_on]'), max: Number(val(f, '[name=inst_max]')) || 0, min_installment_cents: parseBRL(val(f, '[name=inst_min]')) || 0, interest_free: checked(f, '[name=inst_free]') },
          whatsapp_methods: Object.keys(PAYMENT_LABELS).filter((k) => checked(f, `[name=wm_${k}]`)),
        },
      });
    } catch (err) { toast(err.message, { bad: true }); }
  };
}

// ---------- Entrega e retirada
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ymdToBr = (s) => s.split('-').reverse().join('/');
const brToYmd = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

function zoneHtml(z, i) {
  const sla = z.sla || { type: 'carrier' };
  return `<div class="variant" data-z="${i}">
    <div class="variant__head"><b>${esc(z.name || 'Nova região')}</b><button type="button" class="btn btn--ghost btn--sm" data-zrm="${i}" aria-label="Remover região">${icon('x')}</button></div>
    <div class="stack">
      ${fld(`z${i}_name`, 'Nome da região', z.name)}
      <div class="field"><label>Faixas de CEP (uma por linha: inicial a final)</label>
        <textarea class="textarea mono" name="z${i}_ranges" placeholder="25000-000 a 25299-999">${esc((z.cep_ranges || []).map(([a, b]) => `${formatCep(a)} a ${formatCep(b)}`).join('\n'))}</textarea>
        <small>As regiões são verificadas de cima para baixo: coloque as mais específicas primeiro.</small></div>
      <div class="grid2">
        <div class="field"><label>Taxa de entrega</label>${moneyInput(`z${i}_fee`, z.fee_cents, { placeholder: 'a confirmar' })}<small>Em branco = “a confirmar” (não inventa valor).</small></div>
        <div class="field"><label>Frete grátis acima de</label>${moneyInput(`z${i}_free`, z.free_over_cents, { placeholder: 'não oferecer' })}</div>
      </div>
      <div class="field"><label>Prazo</label><select class="select" name="z${i}_sla">
        <option value="same_day" ${sla.type === 'same_day' ? 'selected' : ''}>Mesmo dia (com horário limite)</option>
        <option value="hours" ${sla.type === 'hours' ? 'selected' : ''}>Em até X horas corridas</option>
        <option value="business_days" ${sla.type === 'business_days' ? 'selected' : ''}>Em até X dias úteis</option>
        <option value="carrier" ${sla.type === 'carrier' ? 'selected' : ''}>Conforme transportadora (a confirmar)</option></select></div>
      <div class="grid2">
        ${fld(`z${i}_cutoff`, 'Horário limite (mesmo dia)', sla.cutoff || '', { type: 'time' })}
        ${fld(`z${i}_n`, 'Horas / dias úteis', sla.hours || sla.days || '', { attrs: 'inputmode="numeric"' })}
      </div>
      ${fld(`z${i}_note`, 'Aviso para o cliente (opcional)', z.note || '')}
      ${fld(`z${i}_admin`, 'Anotação interna', z.admin_note || '')}
      ${sw(`z${i}_active`, 'Região ativa', z.active !== false)}
      ${sw(`z${i}_blocked`, 'Não entregamos nesta faixa (exceção)', !!z.blocked)}
    </div></div>`;
}

export async function renderDelivery(el) {
  const { settings: s } = await loadSettings();
  const d = s.delivery;
  let zones = d.zones.map((z) => ({ ...z }));
  function draw() {
    el.innerHTML = `
      <form data-f class="stack">
        <div class="card small">Fuso: <b>America/Sao_Paulo</b>. “Horas corridas” contam o relógio direto; “dias úteis” pulam dias sem operação e feriados. A entrega no mesmo dia só é oferecida para região configurada, dentro do horário limite, em dia de operação e com todos os itens em estoque.</div>
        <h2 class="h2">Operação</h2>
        <div class="card stack">
          <div class="field"><span class="lbl">Dias de operação</span><div class="row">${DAYS.map((n, i) => `<label class="pill" style="padding:8px 10px"><input type="checkbox" name="day${i}" ${d.operating_days.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
          ${fld('prep', 'Tempo de preparação (min)', d.prep_minutes, { attrs: 'inputmode="numeric"', hint: 'Somado ao horário atual para verificar o limite do mesmo dia.' })}
          <div class="field"><label for="f-hol">Feriados e dias sem expediente (dd/mm/aaaa, um por linha)</label><textarea class="textarea mono" id="f-hol" name="holidays">${esc(d.holidays.map(ymdToBr).join('\n'))}</textarea></div>
        </div>
        <h2 class="h2">Regiões de entrega <button type="button" class="btn btn--ghost btn--sm" data-zadd>${icon('plus')} Região</button></h2>
        <div>${zones.map(zoneHtml).join('')}</div>
        <h2 class="h2">Retirada na loja</h2>
        <div class="card stack">
          ${sw('pk_on', 'Oferecer retirada na loja', s.pickup.enabled)}
          ${fld('pk_addr', 'Endereço de retirada', s.pickup.address, { placeholder: s.store.address || 'Endereço completo' })}
          ${fld('pk_est', 'Prazo informado', s.pickup.estimate_text, { placeholder: 'Ex.: pronto em até 1 hora após a confirmação' })}
          ${fld('pk_inst', 'Instruções', s.pickup.instructions, { placeholder: 'Ex.: apresentar o número do pedido' })}
        </div>
        <h2 class="h2">Testar um CEP</h2>
        <div class="card"><div class="row"><input class="input grow" data-test inputmode="numeric" placeholder="00000-000"><button type="button" class="btn btn--dark btn--sm" data-testbtn>Testar</button></div><div data-testout class="small" style="margin-top:8px"></div><p class="hint">Usa as regras salvas e o horário atual.</p></div>
        <div class="actionbar"><button class="btn" type="submit">Salvar</button></div>
      </form>`;
  }
  function collect(f) {
    return zones.map((z, i) => {
      const ranges = val(f, `[name=z${i}_ranges]`).split('\n').map((l) => l.split(/\s*(?:a|até|-{2}|—|–)\s*/i).map((x) => normalizeCep(x))).filter((r) => r.length === 2 && r[0] && r[1]);
      const type = val(f, `[name=z${i}_sla]`);
      const n = Number(val(f, `[name=z${i}_n]`)) || 0;
      const sla = type === 'same_day' ? { type, cutoff: val(f, `[name=z${i}_cutoff]`) || '15:00', fallback_business_days: 1 }
        : type === 'hours' ? { type, hours: n || 48 } : type === 'business_days' ? { type, days: n || 1 } : { type: 'carrier' };
      return {
        id: z.id || `z${Date.now()}${i}`, name: val(f, `[name=z${i}_name]`) || `Região ${i + 1}`, active: checked(f, `[name=z${i}_active]`), blocked: checked(f, `[name=z${i}_blocked]`),
        cep_ranges: ranges, fee_cents: parseBRL(val(f, `[name=z${i}_fee]`)), free_over_cents: parseBRL(val(f, `[name=z${i}_free]`)), sla,
        note: val(f, `[name=z${i}_note]`), admin_note: val(f, `[name=z${i}_admin]`),
      };
    });
  }
  draw();
  el.onclick = async (e) => {
    const f = $('[data-f]', el);
    if (e.target.closest('[data-zadd]')) { zones = collect(f); zones.push({ id: '', name: '', active: true, cep_ranges: [], fee_cents: null, free_over_cents: null, sla: { type: 'hours', hours: 48 } }); draw(); return; }
    const rm = e.target.closest('[data-zrm]');
    if (rm) { zones = collect(f); zones.splice(Number(rm.dataset.zrm), 1); draw(); return; }
    if (e.target.closest('[data-testbtn]')) {
      const out = $('[data-testout]', el);
      try {
        const body = { cep: val(el, '[data-test]') };
        const q = window.NT_DEMO ? await window.NT_DEMO.request('/api/shipping/quote', { method: 'POST', body })
          : await fetch('/api/shipping/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
        out.innerHTML = q.error ? esc(q.error) : `${q.zone ? `<b>${esc(q.zone.name)}</b>` : 'Nenhuma região'}${q.message ? ` — ${esc(q.message)}` : ''}<ul>${q.options.map((o) => `<li>${esc(o.label)}: ${o.status === 'fixed' ? formatBRL(o.fee_cents) : o.status === 'to_confirm' ? 'a confirmar' : 'grátis'} — ${esc(o.estimate?.text || '')}</li>`).join('')}</ul>`;
      } catch { out.textContent = 'Falha ao testar.'; }
    }
  };
  el.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const holidays = val(f, '[name=holidays]').split('\n').map((x) => x.trim()).filter(Boolean).map(brToYmd);
    if (holidays.some((h) => !h)) return toast('Feriado em formato inválido. Use dd/mm/aaaa.', { bad: true });
    try {
      await saveSettings({
        delivery: { ...d, operating_days: DAYS.map((_, i) => i).filter((i) => checked(f, `[name=day${i}]`)), prep_minutes: Number(val(f, '[name=prep]')) || 0, holidays, zones: collect(f) },
        pickup: { enabled: checked(f, '[name=pk_on]'), address: val(f, '[name=pk_addr]'), estimate_text: val(f, '[name=pk_est]'), instructions: val(f, '[name=pk_inst]') },
      });
      renderDelivery(el);
    } catch (err) { toast(err.message, { bad: true }); }
  };
}

// ---------- Banners e seções
export async function renderBanners(el) {
  const [{ banners }, { sections }] = await Promise.all([api('/banners'), api('/sections')]);
  const KIND = { offers: 'Ofertas (produtos com promoção)', featured: 'Destaques', new: 'Novidades', kits: 'Kits (com o mascote)' };
  el.innerHTML = `
    <h2 class="h2">Banners <button class="btn btn--ghost btn--sm" data-bnew>${icon('plus')} Banner</button></h2>
    <div class="list">${banners.map((b) => `<button class="li" data-bedit="${b.id}">
      <div class="li__img">${b.image ? `<img src="${esc(b.image)}" alt="">` : icon('img')}</div>
      <div class="li__main"><div class="li__title">${esc(b.title || '(sem título)')}</div><div class="li__sub">${b.active ? 'Ativo' : 'Inativo'} · ordem ${b.sort}</div>
      ${/mascote-provisorio/.test(b.image || '') ? '<span class="pill pill--warn">Arte provisória</span>' : ''}</div></button>`).join('') || '<div class="empty">Nenhum banner.</div>'}</div>
    <p class="hint">O texto e o botão ficam separados da imagem. Use a arte do mascote (PNG/WebP, mín. 1600×1600 px, fundo transparente ou preto). No celular a imagem é recortada pelo topo/centro; envie uma versão específica para celular se precisar.</p>

    <h2 class="h2">Seções da página inicial</h2>
    <form data-sec class="card stack">${sections.map((s) => `<div class="row" data-sid="${s.id}" style="flex-wrap:nowrap">
      <label class="switch" style="flex:none"><input type="checkbox" name="active" ${s.active ? 'checked' : ''} aria-label="Ativa"></label>
      <div class="grow"><input class="input" name="title" value="${esc(s.title)}" aria-label="Título"><div class="xs muted">${esc(KIND[s.kind] || s.kind)}</div></div>
      <input class="input" name="sort" value="${s.sort}" style="width:58px" inputmode="numeric" aria-label="Ordem">
      <input class="input" name="max_items" value="${s.max_items}" style="width:58px" inputmode="numeric" aria-label="Máx. itens"></div>`).join('')}
      <p class="hint">Ordem e quantidade máxima de produtos. Seções sem produtos não aparecem.</p>
      <button class="btn btn--dark">Salvar seções</button></form>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-bedit]');
    if (b) return bannerModal(banners.find((x) => x.id === Number(b.dataset.bedit)), () => renderBanners(el));
    if (e.target.closest('[data-bnew]')) bannerModal({ active: 1, sort: banners.length + 1, image_position: 'right' }, () => renderBanners(el));
  };
  $('[data-sec]', el).onsubmit = async (e) => {
    e.preventDefault();
    const list = $$('[data-sid]', el).map((r) => ({ id: Number(r.dataset.sid), title: $('[name=title]', r).value, active: $('[name=active]', r).checked, sort: Number($('[name=sort]', r).value), max_items: Number($('[name=max_items]', r).value) }));
    await api('/sections', { method: 'POST', body: { sections: list } });
    toast('Seções salvas.');
  };
}

function bannerModal(b, done) {
  modal({
    title: b.id ? 'Editar banner' : 'Novo banner',
    html: `<form class="stack" data-bf>
      ${fld('title', 'Título', b.title)}${fld('subtitle', 'Texto de apoio', b.subtitle)}
      <div class="grid2">${fld('cta_label', 'Texto do botão', b.cta_label)}${fld('cta_link', 'Link do botão', b.cta_link, { placeholder: '/produtos?secao=offers' })}</div>
      <div class="field"><label>Imagem (computador)</label><div class="row"><input class="input grow" name="image" value="${esc(b.image || '')}"><label class="btn btn--ghost btn--sm">${icon('img')}<input type="file" accept="image/*" data-up="image" hidden></label></div></div>
      <div class="field"><label>Imagem para celular (opcional)</label><div class="row"><input class="input grow" name="image_mobile" value="${esc(b.image_mobile || '')}"><label class="btn btn--ghost btn--sm">${icon('img')}<input type="file" accept="image/*" data-up="image_mobile" hidden></label></div></div>
      ${b.image_note ? `<div class="card card--warn small">${esc(b.image_note)}</div>` : ''}
      <div class="grid2">${fld('starts_at', 'Início (opcional)', b.starts_at?.slice(0, 10) || '', { type: 'date' })}${fld('ends_at', 'Fim (opcional)', b.ends_at?.slice(0, 10) || '', { type: 'date' })}</div>
      <div class="grid2">${fld('sort', 'Ordem', b.sort ?? 1, { attrs: 'inputmode="numeric"' })}<div>${sw('active', 'Ativo', b.active)}</div></div>
      <div class="row">${b.id ? '<button type="button" class="btn btn--danger" data-del>Excluir</button>' : ''}<button class="btn btn--dark grow">Salvar</button></div></form>`,
    onMount(m, close) {
      m.addEventListener('change', async (e) => {
        const up = e.target.closest('[data-up]');
        if (!up?.files[0]) return;
        try { toast('Enviando imagem…'); $(`[name=${up.dataset.up}]`, m).value = await uploadImage(up.files[0]); toast('Imagem enviada.'); } catch (err) { toast(err.message, { bad: true }); }
      });
      $('[data-del]', m)?.addEventListener('click', async () => {
        await api(`/banners/${b.id}/delete`, { method: 'POST' });
        close(); done();
      });
      $('[data-bf]', m).onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const image = val(f, '[name=image]');
        try {
          await api('/banners', { method: 'POST', body: {
            id: b.id, title: val(f, '[name=title]'), subtitle: val(f, '[name=subtitle]'), cta_label: val(f, '[name=cta_label]'), cta_link: val(f, '[name=cta_link]'),
            image, image_mobile: val(f, '[name=image_mobile]'), image_note: image === b.image ? b.image_note : null, image_position: b.image_position || 'right',
            active: checked(f, '[name=active]'), sort: Number(val(f, '[name=sort]')) || 0,
            starts_at: val(f, '[name=starts_at]') ? `${val(f, '[name=starts_at]')}T00:00:00-03:00` : null, ends_at: val(f, '[name=ends_at]') ? `${val(f, '[name=ends_at]')}T23:59:59-03:00` : null,
          } });
          close(); toast('Banner salvo.'); done();
        } catch (err) { toast(err.message, { bad: true }); }
      };
    },
  });
}

// ---------- Categorias e marcas
export async function renderTaxonomy(el) {
  const { categories, brands } = await api('/taxonomy');
  el.innerHTML = `
    <h2 class="h2">Categorias <button class="btn btn--ghost btn--sm" data-cnew>${icon('plus')} Categoria</button></h2>
    <div class="list">${categories.map((c) => `<button class="li" data-c="${c.id}"><div class="li__main"><div class="li__title">${esc(c.name)}</div><div class="li__sub">${c.n} produto(s) · ordem ${c.sort}${c.active ? '' : ' · oculta'}</div></div></button>`).join('')}</div>
    <h2 class="h2">Marcas <button class="btn btn--ghost btn--sm" data-bnew>${icon('plus')} Marca</button></h2>
    <p class="hint" style="margin-top:0">Cadastre apenas marcas que a loja realmente vende. A seção de marcas na página inicial é opcional (Dados da loja).</p>
    <div class="list">${brands.map((b) => `<button class="li" data-b="${b.id}"><div class="li__img">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}</div><div class="li__main"><div class="li__title">${esc(b.name)}${b.is_demo ? ' <span class="pill pill--demo">Demo</span>' : ''}</div><div class="li__sub">${b.n} produto(s)${b.show_in_home ? ' · na página inicial' : ''}</div></div></button>`).join('') || '<div class="empty">Nenhuma marca.</div>'}</div>`;
  el.onclick = (e) => {
    const c = e.target.closest('[data-c], [data-cnew]');
    if (c) {
      const cat = categories.find((x) => x.id === Number(c.dataset.c)) || { name: '', sort: categories.length + 1, active: 1 };
      return modal({
        title: cat.id ? 'Editar categoria' : 'Nova categoria',
        html: `<form class="stack">${fld('name', 'Nome', cat.name)}${cat.id ? fld('sort', 'Ordem', cat.sort, { attrs: 'inputmode="numeric"' }) + sw('active', 'Visível na loja', cat.active) : ''}<button class="btn btn--dark">Salvar</button></form>`,
        onMount(m, close) {
          $('form', m).onsubmit = async (ev) => {
            ev.preventDefault();
            try { await api('/categories', { method: 'POST', body: { id: cat.id, name: val(m, '[name=name]'), sort: Number(val(m, '[name=sort]')) || cat.sort, active: cat.id ? checked(m, '[name=active]') : true } }); close(); renderTaxonomy(el); }
            catch (err) { toast(err.message, { bad: true }); }
          };
        },
      });
    }
    const b = e.target.closest('[data-b], [data-bnew]');
    if (b) {
      const br = brands.find((x) => x.id === Number(b.dataset.b)) || { name: '', active: 1, show_in_home: 0 };
      modal({
        title: br.id ? 'Editar marca' : 'Nova marca',
        html: `<form class="stack">${fld('name', 'Nome', br.name)}
          <div class="field"><label>Logo (opcional)</label><div class="row"><input class="input grow" name="logo" value="${esc(br.logo || '')}"><label class="btn btn--ghost btn--sm">${icon('img')}<input type="file" accept="image/*" data-up hidden></label></div><small>Use a logo oficial do fabricante, sem alterações.</small></div>
          ${sw('show_in_home', 'Mostrar na seção de marcas', br.show_in_home)}${sw('active', 'Ativa', br.active)}<button class="btn btn--dark">Salvar</button></form>`,
        onMount(m, close) {
          m.addEventListener('change', async (ev) => { const up = ev.target.closest('[data-up]'); if (up?.files[0]) $('[name=logo]', m).value = await uploadImage(up.files[0]); });
          $('form', m).onsubmit = async (ev) => {
            ev.preventDefault();
            try { await api('/brands', { method: 'POST', body: { id: br.id, name: val(m, '[name=name]'), logo: val(m, '[name=logo]'), show_in_home: checked(m, '[name=show_in_home]'), active: checked(m, '[name=active]') } }); close(); renderTaxonomy(el); }
            catch (err) { toast(err.message, { bad: true }); }
          };
        },
      });
    }
  };
}

// ---------- Páginas
export async function renderPages(el) {
  const { pages } = await api('/pages');
  el.innerHTML = `<p class="hint" style="margin-top:0">Textos institucionais. Os modelos vêm em rascunho: escreva e valide as regras da loja (de preferência com seu contador/advogado) antes de publicar.</p>
    <div class="list">${pages.map((p) => `<button class="li" data-p="${p.id}"><div class="li__main"><div class="li__title">${esc(p.title)}</div><div class="li__sub">${p.published ? 'Publicada' : 'Rascunho'} · /pagina/${esc(p.slug)}</div></div><span class="pill ${p.published ? 'pill--ok' : 'pill--warn'}">${p.published ? 'No ar' : 'Rascunho'}</span></button>`).join('')}</div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const p = pages.find((x) => x.id === Number(b.dataset.p));
    modal({
      title: p.title,
      html: `<form class="stack">${fld('title', 'Título', p.title)}<div class="field"><label>Texto</label><textarea class="textarea" name="body" style="min-height:240px">${esc(p.body)}</textarea></div>${sw('published', 'Publicada na loja', p.published)}<button class="btn btn--dark">Salvar</button></form>`,
      onMount(m, close) {
        $('form', m).onsubmit = async (ev) => {
          ev.preventDefault();
          try { await api('/pages', { method: 'POST', body: { id: p.id, title: val(m, '[name=title]'), body: $('[name=body]', m).value, published: checked(m, '[name=published]') } }); close(); toast('Página salva.'); renderPages(el); }
          catch (err) { toast(err.message, { bad: true }); }
        };
      },
    });
  };
}

// ---------- CSV e backup
export async function renderCsv(el) {
  el.innerHTML = `${window.NT_DEMO ? '<div class="card card--warn small">Na demonstração sem servidor, exportação, importação e backup ficam desativados.</div>' : ''}
    <h2 class="h2">Exportar</h2>
    <div class="card stack">
      <p class="small" style="margin:0">Planilha com uma linha por opção (sabor/tamanho), incluindo custo e estoque. Abre no Excel/Google Planilhas.</p>
      <a class="btn btn--dark" href="/api/admin/export.csv" download>${icon('csv')} Baixar produtos (CSV)</a>
    </div>
    <h2 class="h2">Importar</h2>
    <div class="card stack">
      <p class="small" style="margin:0">Use o arquivo exportado como modelo. Colunas obrigatórias: <span class="mono">produto</span> e <span class="mono">preco</span>. As opções são casadas por código de barras, SKU ou produto+sabor+tamanho. Diferenças de estoque viram ajustes no histórico. Produtos novos entram como rascunho, a menos que <span class="mono">status</span> = publicado e o cadastro esteja completo.</p>
      <input type="file" accept=".csv,text/csv" class="input" style="padding-top:10px" data-file>
      <div data-preview></div>
    </div>
    <h2 class="h2">Cópia de segurança</h2>
    <div class="card stack">
      <p class="small" style="margin:0">Baixa uma cópia completa do banco (produtos, pedidos, clientes, estoque). Guarde em local seguro: contém dados pessoais de clientes.</p>
      <a class="btn btn--ghost" href="/api/admin/backup" download>${icon('db')} Baixar backup</a>
    </div>`;
  let text = '';
  $('[data-file]', el).onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    text = await f.text();
    preview();
  };
  async function preview() {
    const out = $('[data-preview]', el);
    try {
      const r = await api('/import', { method: 'POST', body: { csv: text, apply: false } });
      out.innerHTML = `<div class="card ${r.errors.length ? 'card--danger' : ''}">
        <b>${r.total} linha(s):</b> ${r.create} nova(s), ${r.update} atualização(ões).
        ${r.errors.length ? `<ul class="small">${r.errors.slice(0, 20).map((x) => `<li>Linha ${x.line}: ${esc(x.message)}</li>`).join('')}</ul><p class="small">Corrija a planilha e envie de novo. Nada foi alterado.</p>` : '<button class="btn btn--dark btn--block" style="margin-top:10px" data-apply>Confirmar importação</button>'}</div>`;
      $('[data-apply]', out)?.addEventListener('click', async () => {
        if (!(await confirmBox(`Aplicar ${r.total} linha(s) ao catálogo?`, { ok: 'Importar' }))) return;
        const res = await api('/import', { method: 'POST', body: { csv: text, apply: true } });
        out.innerHTML = `<div class="card">${icon('check')} Importação concluída: ${res.create} criada(s), ${res.update} atualizada(s).</div>`;
      });
    } catch (err) { out.innerHTML = `<div class="card card--danger">${esc(err.message)}</div>`; }
  }
}

// ---------- Clientes
export async function renderCustomers(el) {
  const { customers } = await api('/customers');
  el.innerHTML = `<p class="hint" style="margin-top:0">Somente clientes que fizeram pedidos. Use os dados apenas para atender esses pedidos (LGPD).</p>
    ${customers.length ? `<div class="list">${customers.map((c) => `<div class="li"><div class="li__main"><div class="li__title">${esc(c.name)}</div><div class="li__sub">${esc(formatPhoneBR(c.phone))} · ${c.orders} pedido(s)${c.last_order ? ` · último ${fmtDate(c.last_order, false)}` : ''}</div></div><div class="li__end">${formatBRL(c.paid_cents || 0)}<div class="xs muted">pago</div></div></div>`).join('')}</div>` : '<div class="card empty">Nenhum cliente ainda.</div>'}`;
}

// ---------- Conta
export async function renderAccount(el) {
  el.innerHTML = `<form class="card stack" data-f>
    ${fld('current', 'Senha atual', '', { type: 'password', attrs: 'autocomplete="current-password"' })}
    ${fld('next', 'Nova senha (mín. 8 caracteres)', '', { type: 'password', attrs: 'autocomplete="new-password"' })}
    <button class="btn btn--dark">Trocar senha</button></form>`;
  $('[data-f]', el).onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/password', { method: 'POST', body: { current: val(el, '[name=current]'), next: val(el, '[name=next]') } }); toast('Senha alterada.'); e.target.reset(); }
    catch (err) { toast(err.message, { bad: true }); }
  };
}

export { centsToInput, go };
