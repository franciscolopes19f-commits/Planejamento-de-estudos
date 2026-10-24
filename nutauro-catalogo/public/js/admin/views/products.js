import { api, $, $$, esc, icon, link, go, current, toast, modal, confirmBox, formatBRL, parseBRL, centsToInput, moneyInput, statusPill, uploadImage } from '../lib.js';
import { openScanner } from '../scanner.js';
import { openMoveModal } from './stock.js';
import { validateGtin } from '/shared/gtin.js';

// ======================================================================= Lista

export async function renderProducts(el) {
  const { query } = current();
  const f = { q: query.q || '', status: query.status || '', stock: query.stock || '' };
  el.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <input class="input grow" type="search" placeholder="Buscar nome, marca ou código" value="${esc(f.q)}" data-q aria-label="Buscar produtos">
      <a class="btn" href="${link('/produtos/novo')}" data-nav>${icon('plus')} Novo</a>
    </div>
    <div class="filters" role="group" aria-label="Filtros">
      ${[['', '', 'Ativos e rascunhos'], ['status', 'active', 'Publicados'], ['status', 'draft', 'Rascunhos'], ['stock', 'incomplete', 'Incompletos'], ['stock', 'out', 'Sem estoque'], ['status', 'archived', 'Arquivados']]
        .map(([k, v, l]) => `<button class="fchip" data-f="${k}" data-v="${v}" aria-pressed="${(k === '' && !f.status && !f.stock) || f[k] === v}">${l}</button>`).join('')}
    </div>
    <div data-list><div class="empty"><div class="spinner" style="margin:auto"></div></div></div>`;

  async function load() {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const { products } = await api(`/products?${p}`);
    const list = $('[data-list]', el);
    if (!products.length) {
      list.innerHTML = `<div class="card empty">Nenhum produto encontrado.<br><br><a class="btn btn--dark btn--sm" href="${link('/produtos/novo')}" data-nav>Cadastrar produto</a>
        <a class="btn btn--ghost btn--sm" href="${link('/escanear')}" data-nav>${icon('scan')} Por código de barras</a></div>`;
      return;
    }
    list.innerHTML = `<p class="xs muted" style="margin:0 0 6px">${products.length} produto(s)</p><div class="list">${products.map((p) => `
      <a class="li" href="${link(`/produtos/${p.id}`)}" data-nav>
        <div class="li__img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : icon('img')}</div>
        <div class="li__main">
          <div class="li__title">${esc(p.name)}</div>
          <div class="li__sub">${esc([p.brand_name, p.category_name].filter(Boolean).join(' · ') || 'Sem marca/categoria')}</div>
          <div class="row" style="margin-top:4px;gap:4px">${statusPill(p.status)}
            ${p.is_demo ? '<span class="pill pill--demo">Demo</span>' : ''}
            ${p.missing_required.length ? `<span class="pill pill--bad">Falta ${p.missing_required.length}</span>` : ''}
            <span class="pill ${p.available === 0 ? 'pill--bad' : ''}">${p.available} disp.${p.variants_count > 1 ? ` · ${p.variants_count} opções` : ''}</span></div>
        </div>
        <div class="li__end">${p.price_min_cents != null ? formatBRL(p.price_min_cents) : '<span class="muted xs">sem preço</span>'}</div>
      </a>`).join('')}</div>`;
  }
  let t;
  el.querySelector('[data-q]').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(t); t = setTimeout(load, 250); });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-f]');
    if (!c) return;
    f.status = ''; f.stock = '';
    if (c.dataset.f) f[c.dataset.f] = c.dataset.v;
    $$('[data-f]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === c)));
    load();
  });
  await load();
}

// ======================================================================= Editor

const PREFILL_KEY = 'nt_prefill';

function blankVariant() {
  return { id: null, flavor: '', size: '', price_cents: null, promo_price_cents: null, promo_ends_at: '', cost_cents: null, gtin: '', sku: '', initial_stock: 0, low_stock_threshold: null, active: 1 };
}

function clientCompleteness(p) {
  const req = [];
  const rec = [];
  const vs = p.variants.filter((v) => v.active);
  if (!p.name?.trim()) req.push('nome');
  if (!p.category_id) req.push('categoria');
  if (!vs.length) req.push('ao menos uma opção ativa');
  if (vs.some((v) => !(v.price_cents > 0))) req.push('preço de venda');
  if (vs.length > 1 && vs.some((v) => !v.flavor && !v.size)) req.push('sabor ou tamanho em cada opção');
  if (!p.images.length) rec.push('foto');
  if (!p.brand_name?.trim()) rec.push('marca');
  if (!p.presentation?.trim()) rec.push('apresentação');
  if (!p.description?.trim()) rec.push('descrição');
  if (vs.some((v) => v.cost_cents == null)) rec.push('custo');
  if (vs.some((v) => !v.gtin)) rec.push('código de barras');
  return { req, rec };
}

function marginHtml(v) {
  const price = v.promo_price_cents && v.promo_price_cents < v.price_cents ? v.promo_price_cents : v.price_cents;
  if (!(price > 0) || v.cost_cents == null) return '<span class="margin muted">Margem: informe preço e custo</span>';
  const m = price - v.cost_cents;
  const pct = Math.round((m / price) * 100);
  return `<span class="margin" style="color:${m < 0 ? 'var(--danger)' : 'var(--success)'}">Margem estimada: ${formatBRL(m)} (${pct}%)${v.promo_price_cents && v.promo_price_cents < v.price_cents ? ' no preço promocional' : ''}</span>`;
}

export async function renderProductEditor(el, id) {
  const [{ categories, brands }, prod] = await Promise.all([
    api('/taxonomy'),
    id ? api(`/products/${id}`).then((r) => r.product) : Promise.resolve(null),
  ]);
  const { query } = current();
  let prefill = null;
  if (!id) { try { prefill = JSON.parse(sessionStorage.getItem(PREFILL_KEY) || 'null'); sessionStorage.removeItem(PREFILL_KEY); } catch {} }

  const p = prod
    ? { ...prod, brand_name: prod.brand_name || '', variants: prod.variants.map((v) => ({ ...v, promo_ends_at: v.promo_ends_at ? v.promo_ends_at.slice(0, 10) : '' })) }
    : {
        id: null, name: '', brand_name: '', category_id: '', presentation: '', description: '', ingredients: '', allergens: '',
        nutrition: null, nutrition_source: '', images: [], status: 'draft', featured: 0, is_new: 0, is_kit: 0, tags: '', data_source: null,
        variants: [blankVariant()],
      };
  const imported = new Set();
  if (prefill) {
    const fl = prefill.fields || {};
    if (fl.name) { p.name = fl.name; imported.add('name'); }
    if (fl.brand) { p.brand_name = fl.brand; imported.add('brand_name'); }
    if (fl.size) { p.presentation = fl.size; p.variants[0].size = fl.size; imported.add('presentation'); }
    if (fl.description) { p.description = fl.description; imported.add('description'); }
    if (fl.ingredients) { p.ingredients = fl.ingredients; imported.add('ingredients'); }
    if (fl.image_url) { p.images = [fl.image_url]; imported.add('images'); }
    if (prefill.gtin) p.variants[0].gtin = prefill.gtin;
    if (prefill.source) p.data_source = { ...prefill.source, gtin: prefill.gtin, fields: [...imported] };
  } else if (query.gtin) p.variants[0].gtin = query.gtin;

  const originTag = (k) => (imported.has(k) ? `<span class="origin" title="Importado de ${esc(p.data_source?.label || '')}">importado — revise</span>` : '');

  function variantHtml(v, i) {
    const isNew = !v.id;
    return `
      <div class="variant" data-vi="${i}">
        <div class="variant__head"><b>Opção ${i + 1}${v.id && !v.active ? ' · inativa' : ''}</b>
          <div class="row">
            ${p.variants.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm" data-vremove="${i}" aria-label="Remover opção ${i + 1}">${icon('x')}</button>` : ''}
          </div></div>
        <div class="grid2">
          <div class="field"><label>Sabor</label><input class="input" data-vf="flavor" value="${esc(v.flavor || '')}" placeholder="Ex.: Chocolate" list="dl-flavors"></div>
          <div class="field"><label>Tamanho / peso</label><input class="input" data-vf="size" value="${esc(v.size || '')}" placeholder="Ex.: 900 g"></div>
          <div class="field"><label>Preço de venda *</label>${moneyInput('price', v.price_cents, { attrs: 'data-vm="price_cents"' })}</div>
          <div class="field"><label>Preço promocional</label>${moneyInput('promo', v.promo_price_cents, { placeholder: 'opcional', attrs: 'data-vm="promo_price_cents"' })}</div>
          <div class="field"><label>Promoção até</label><input class="input" type="date" data-vf="promo_ends_at" value="${esc(v.promo_ends_at || '')}"></div>
          <div class="field"><label>Custo (interno)</label>${moneyInput('cost', v.cost_cents, { placeholder: 'opcional', attrs: 'data-vm="cost_cents"' })}</div>
        </div>
        <div style="margin:6px 0 10px" data-margin>${marginHtml(v)}</div>
        <div class="field"><label>Código de barras (EAN/GTIN)</label>
          <div class="row"><input class="input grow mono" data-vf="gtin" inputmode="numeric" value="${esc(v.gtin || '')}" placeholder="789…">
          <button type="button" class="btn btn--ghost btn--sm" data-vscan="${i}" aria-label="Ler código pela câmera">${icon('camera')}</button></div>
          <small data-gtin-msg></small></div>
        <div class="grid2" style="margin-top:10px">
          <div class="field"><label>SKU / código interno</label><input class="input" data-vf="sku" value="${esc(v.sku || '')}" placeholder="opcional"></div>
          <div class="field"><label>Alerta de estoque mínimo</label><input class="input" data-vf="low_stock_threshold" inputmode="numeric" value="${v.low_stock_threshold ?? ''}" placeholder="padrão da loja"></div>
        </div>
        ${isNew
          ? `<div class="field" style="margin-top:10px"><label>Estoque inicial</label><input class="input" data-vf="initial_stock" inputmode="numeric" value="${v.initial_stock || 0}"><small>Gera uma entrada no histórico de estoque.</small></div>`
          : `<div class="row row--between" style="margin-top:12px"><span class="small"><b>Saldo: ${v.stock}</b>${v.reserved ? ` · ${v.reserved} reservado(s) · ${v.available} disponível(is)` : ''}</span>
             <button type="button" class="btn btn--dark btn--sm" data-vmove="${i}">${icon('stock')} Movimentar</button></div>`}
        <label class="switch" style="margin-top:6px"><input type="checkbox" data-vf="active" ${v.active ? 'checked' : ''}> Opção ativa na loja</label>
      </div>`;
  }

  function nutritionHtml() {
    const n = p.nutrition || { serving: '', rows: [] };
    return `
      <p class="hint" style="margin:0 0 8px">Preencha somente com os dados do rótulo do fabricante. Se não tiver certeza, deixe em branco — a tabela não aparece na loja.</p>
      <div class="field"><label>Porção</label><input class="input" data-nserv value="${esc(n.serving || '')}" placeholder="Ex.: 30 g (1 dosador)"></div>
      <div data-nrows style="margin-top:8px">${(n.rows || []).map((r, i) => `
        <div class="grid3" style="margin-bottom:6px" data-nrow="${i}">
          <input class="input" data-nk="label" value="${esc(r.label)}" placeholder="Nutriente" aria-label="Nutriente">
          <input class="input" data-nk="value" value="${esc(r.value)}" placeholder="Quantidade" aria-label="Quantidade">
          <div class="row" style="flex-wrap:nowrap"><input class="input" data-nk="vd" value="${esc(r.vd || '')}" placeholder="%VD" aria-label="%VD"><button type="button" class="btn btn--ghost btn--sm" data-nrm="${i}" aria-label="Remover linha">${icon('x')}</button></div>
        </div>`).join('')}</div>
      <button type="button" class="btn btn--ghost btn--sm" data-nadd>${icon('plus')} Linha</button>
      <div class="field" style="margin-top:10px"><label>Fonte dos dados</label><input class="input" data-pf="nutrition_source" value="${esc(p.nutrition_source || '')}" placeholder="Ex.: rótulo da embalagem, lote 2026"></div>`;
  }

  function draw() {
    const c = clientCompleteness(p);
    el.innerHTML = `
      <form data-form novalidate>
        ${p.is_demo ? '<div class="card card--warn small" style="margin-bottom:10px">Produto de demonstração.</div>' : ''}
        <div class="card ${c.req.length ? 'card--warn' : ''}" data-complete>${completeHtml(c)}</div>

        ${p.data_source ? `<div class="card small" style="margin-top:10px"><b>${icon('db')} Dados importados de ${esc(p.data_source.label || p.data_source.provider)}</b>
          <div class="muted">Código ${esc(p.data_source.gtin || '')}${p.data_source.fetched_at ? ` · consultado em ${new Date(p.data_source.fetched_at).toLocaleString('pt-BR')}` : ''}</div>
          <div class="muted">${esc(p.data_source.attribution || '')} Confira tudo com a embalagem antes de publicar.</div></div>` : ''}

        <h2 class="h2">Fotos ${originTag('images')}</h2>
        <div class="photos" data-photos>
          ${p.images.map((src, i) => `<div class="photo"><img src="${esc(src)}" alt="Foto ${i + 1}">${i === 0 ? '<span class="first">CAPA</span>' : ''}
            <button type="button" data-rmimg="${i}" aria-label="Remover foto ${i + 1}">${icon('x')}</button></div>`).join('')}
          <label class="photo-add">${icon('camera')}<span>Adicionar<br>foto</span><input type="file" accept="image/*" multiple data-upload></label>
        </div>
        <p class="hint">A primeira foto é a capa. As imagens são reduzidas automaticamente antes do envio.</p>

        <h2 class="h2">Informações</h2>
        <div class="stack">
          <div class="field"><label for="p-name">Nome do produto * ${originTag('name')}</label><input class="input" id="p-name" data-pf="name" value="${esc(p.name)}" placeholder="Ex.: Whey Protein Concentrado"></div>
          <div class="grid2">
            <div class="field"><label for="p-brand">Marca (fabricante) ${originTag('brand_name')}</label><input class="input" id="p-brand" data-pf="brand_name" list="dl-brands" value="${esc(p.brand_name)}"></div>
            <div class="field"><label for="p-cat">Categoria *</label><select class="select" id="p-cat" data-pf="category_id"><option value="">Escolha…</option>
              ${categories.map((c2) => `<option value="${c2.id}" ${String(p.category_id) === String(c2.id) ? 'selected' : ''}>${esc(c2.name)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label for="p-pres">Apresentação ${originTag('presentation')}</label><input class="input" id="p-pres" data-pf="presentation" value="${esc(p.presentation || '')}" placeholder="Ex.: Pote 900 g · 30 doses"></div>
        </div>
        <datalist id="dl-brands">${brands.map((b) => `<option value="${esc(b.name)}">`).join('')}</datalist>
        <datalist id="dl-flavors">${['Chocolate', 'Baunilha', 'Morango', 'Cookies', 'Sem sabor', 'Frutas vermelhas', 'Limão', 'Uva', 'Maracujá'].map((f) => `<option value="${f}">`).join('')}</datalist>

        <h2 class="h2">Sabores, tamanhos e preços <button type="button" class="btn btn--ghost btn--sm" data-gen>Gerar combinações</button></h2>
        <div data-variants>${p.variants.map(variantHtml).join('')}</div>
        <button type="button" class="btn btn--ghost btn--block" style="margin-top:10px" data-vadd>${icon('plus')} Adicionar opção</button>

        <h2 class="h2">Vitrine</h2>
        <div class="card" style="padding:4px 14px">
          <label class="switch"><input type="checkbox" data-pf="featured" ${p.featured ? 'checked' : ''}> Destaque</label>
          <label class="switch"><input type="checkbox" data-pf="is_new" ${p.is_new ? 'checked' : ''}> Novidade</label>
          <label class="switch"><input type="checkbox" data-pf="is_kit" ${p.is_kit ? 'checked' : ''}> Kit</label>
        </div>
        <p class="hint">Produtos com preço promocional entram automaticamente em “Ofertas”.</p>

        <h2 class="h2">Descrição e rótulo</h2>
        <div class="stack">
          <div class="field"><label for="p-desc">Descrição ${originTag('description')}</label><textarea class="textarea" id="p-desc" data-pf="description" placeholder="Texto objetivo. Evite promessas de resultado.">${esc(p.description || '')}</textarea></div>
          <div class="field"><label for="p-ing">Ingredientes ${originTag('ingredients')}</label><textarea class="textarea" id="p-ing" data-pf="ingredients" placeholder="Copie do rótulo">${esc(p.ingredients || '')}</textarea></div>
          <div class="field"><label for="p-alg">Alergênicos</label><input class="input" id="p-alg" data-pf="allergens" value="${esc(p.allergens || '')}" placeholder="Ex.: Contém leite. Pode conter soja."></div>
          <details class="card"><summary style="font-weight:800;cursor:pointer">Tabela nutricional ${p.nutrition?.rows?.length ? `(${p.nutrition.rows.length} linhas)` : '(opcional)'}</summary><div style="margin-top:10px" data-nutri>${nutritionHtml()}</div></details>
          <div class="field"><label for="p-tags">Palavras para busca</label><input class="input" id="p-tags" data-pf="tags" value="${esc(p.tags || '')}" placeholder="Ex.: proteína, hipertrofia, 100% whey"></div>
        </div>

        ${id ? `<h2 class="h2">Mais ações</h2><div class="row">
          <a class="btn btn--ghost btn--sm" href="${window.NT_DEMO ? '#' : ''}/produto/${esc(prod.slug)}" ${window.NT_DEMO ? '' : 'target="_blank" rel="noopener"'}>${icon('ext')} Ver na loja</a>
          <button type="button" class="btn btn--ghost btn--sm" data-dup>${icon('copy')} Duplicar</button>
          ${p.status !== 'archived' ? `<button type="button" class="btn btn--danger btn--sm" data-archive>${icon('archive')} Arquivar</button>` : `<button type="button" class="btn btn--ghost btn--sm" data-unarchive>Restaurar como rascunho</button>`}
          <a class="btn btn--ghost btn--sm" href="${link(`/estoque?produto=${id}`)}" data-nav>${icon('stock')} Histórico de estoque</a></div>` : ''}

        <div class="actionbar">
          <button type="button" class="btn btn--ghost" data-save="draft">${p.status === 'active' ? 'Despublicar' : 'Salvar rascunho'}</button>
          <button type="button" class="btn ${c.req.length ? 'btn--dark' : ''}" data-save="active">${p.status === 'active' ? 'Salvar' : 'Publicar'}</button>
        </div>
      </form>`;
    for (const inp of $$('[data-vf="gtin"]', el)) checkGtin(inp);
  }

  function completeHtml(c) {
    if (!c.req.length && !c.rec.length) return `<b style="color:var(--success)">${icon('check')} Cadastro completo.</b>`;
    return `${c.req.length ? `<b>Para publicar, falta:</b><ul class="check-list">${c.req.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<b style="color:var(--success)">${icon('check')} Pronto para publicar.</b>`}
      ${c.rec.length ? `<p class="small muted" style="margin:8px 0 0">Recomendado: ${esc(c.rec.join(', '))}.</p>` : ''}`;
  }

  function refreshComplete() {
    const c = clientCompleteness(p);
    const box = $('[data-complete]', el);
    box.className = `card ${c.req.length ? 'card--warn' : ''}`;
    box.innerHTML = completeHtml(c);
  }

  function checkGtin(inp) {
    const msg = inp.closest('.field').querySelector('[data-gtin-msg]');
    const v = inp.value.trim();
    if (!v) { msg.textContent = ''; inp.removeAttribute('aria-invalid'); return true; }
    const g = validateGtin(v);
    msg.textContent = g.valid ? `${g.type} válido` : g.error;
    msg.style.color = g.valid ? 'var(--success)' : 'var(--danger)';
    inp.setAttribute('aria-invalid', String(!g.valid));
    return g.valid;
  }

  const onInput = (e) => {
    const t = e.target;
    const vi = t.closest('[data-vi]');
    if (t.dataset.pf) {
      const k = t.dataset.pf;
      p[k] = t.type === 'checkbox' ? (t.checked ? 1 : 0) : t.value;
      imported.delete(k);
    } else if (vi && (t.dataset.vf || t.dataset.vm)) {
      const v = p.variants[Number(vi.dataset.vi)];
      if (t.dataset.vm) v[t.dataset.vm] = t.value.trim() ? parseBRL(t.value) : null;
      else if (t.type === 'checkbox') v[t.dataset.vf] = t.checked ? 1 : 0;
      else if (['initial_stock', 'low_stock_threshold'].includes(t.dataset.vf)) v[t.dataset.vf] = t.value.trim() === '' ? null : Number(t.value.replace(/\D/g, ''));
      else v[t.dataset.vf] = t.value;
      if (t.dataset.vf === 'gtin') checkGtin(t);
      vi.querySelector('[data-margin]').innerHTML = marginHtml(v);
    } else if (t.closest('[data-nutri]')) {
      readNutrition();
    }
    refreshComplete();
  };

  function readNutrition() {
    const rows = $$('[data-nrow]', el).map((r) => ({ label: $('[data-nk="label"]', r).value.trim(), value: $('[data-nk="value"]', r).value.trim(), vd: $('[data-nk="vd"]', r).value.trim() }));
    const serving = $('[data-nserv]', el)?.value.trim() || '';
    p.nutrition = rows.length || serving ? { serving, rows } : null;
  }

  async function save(status) {
    readNutrition();
    for (const inp of $$('[data-vf="gtin"]', el)) if (!checkGtin(inp)) { inp.focus(); toast('Corrija o código de barras.', { bad: true }); return; }
    const body = {
      ...p, status, brand_id: null, category_id: p.category_id ? Number(p.category_id) : null,
      nutrition: p.nutrition && p.nutrition.rows.filter((r) => r.label && r.value).length ? { serving: p.nutrition.serving, rows: p.nutrition.rows.filter((r) => r.label && r.value) } : null,
      variants: p.variants.map((v) => ({ ...v, promo_ends_at: v.promo_ends_at ? `${v.promo_ends_at}T23:59:59-03:00` : null })),
    };
    if (body.data_source) body.data_source = { ...body.data_source, fields_pending_review: [...imported] };
    const btns = $$('[data-save]', el);
    btns.forEach((b) => (b.disabled = true));
    try {
      const r = await api('/products', { method: 'POST', body });
      toast(status === 'active' ? 'Produto publicado na loja.' : 'Rascunho salvo.');
      if (!id) go(`/produtos/${r.product.id}`, { replace: true });
      else go(`/produtos/${id}`, { replace: true });
    } catch (e) {
      toast(e.message, { bad: true });
      btns.forEach((b) => (b.disabled = false));
    }
  }

  const onClick = async (e) => {
    const t = e.target.closest('button, [data-upload]');
    if (!t) return;
    if (t.dataset.save) return save(t.dataset.save);
    if (t.hasAttribute('data-vadd')) { p.variants.push({ ...blankVariant(), size: p.variants[0]?.size || '' }); draw(); $$('[data-vi]', el).at(-1).scrollIntoView({ block: 'center' }); return; }
    if (t.dataset.vremove != null) {
      const v = p.variants[Number(t.dataset.vremove)];
      if (v.id && !(await confirmBox('Remover esta opção? Se ela tiver histórico, será apenas desativada.', { ok: 'Remover', danger: true }))) return;
      p.variants.splice(Number(t.dataset.vremove), 1);
      draw();
      return;
    }
    if (t.dataset.vscan != null) {
      const i = Number(t.dataset.vscan);
      openScanner((code) => { p.variants[i].gtin = code; draw(); toast(`Código ${code} lido.`); });
      return;
    }
    if (t.dataset.vmove != null) {
      const v = p.variants[Number(t.dataset.vmove)];
      openMoveModal({ ...v, product_name: p.name }, () => go(`/produtos/${id}`, { replace: true }));
      return;
    }
    if (t.dataset.rmimg != null) { p.images.splice(Number(t.dataset.rmimg), 1); imported.delete('images'); draw(); refreshComplete(); return; }
    if (t.hasAttribute('data-nadd')) { readNutrition(); p.nutrition = p.nutrition || { serving: '', rows: [] }; p.nutrition.rows.push({ label: '', value: '', vd: '' }); $('[data-nutri]', el).innerHTML = nutritionHtml(); return; }
    if (t.dataset.nrm != null) { readNutrition(); p.nutrition.rows.splice(Number(t.dataset.nrm), 1); $('[data-nutri]', el).innerHTML = nutritionHtml(); return; }
    if (t.hasAttribute('data-gen')) return generateCombos();
    if (t.hasAttribute('data-dup')) {
      const r = await api(`/products/${id}/duplicate`, { method: 'POST' });
      toast('Cópia criada como rascunho.');
      go(`/produtos/${r.product.id}`);
      return;
    }
    if (t.hasAttribute('data-archive')) {
      if (!(await confirmBox('Arquivar o produto? Ele sai da loja, mas o histórico de vendas e estoque é mantido.', { ok: 'Arquivar', danger: true }))) return;
      await api(`/products/${id}/status`, { method: 'POST', body: { status: 'archived' } });
      toast('Produto arquivado.');
      go('/produtos');
      return;
    }
    if (t.hasAttribute('data-unarchive')) {
      await api(`/products/${id}/status`, { method: 'POST', body: { status: 'draft' } });
      go(`/produtos/${id}`, { replace: true });
    }
  };

  const onChange = async (e) => {
    if (!e.target.matches('[data-upload]')) return;
    const files = [...e.target.files];
    for (const f of files) {
      try {
        toast('Enviando foto…');
        p.images.push(await uploadImage(f));
      } catch (err) { toast(err.message || 'Falha ao enviar a foto.', { bad: true }); }
    }
    draw();
  };

  function generateCombos() {
    modal({
      title: 'Gerar combinações',
      html: `<p class="small muted" style="margin:0 0 10px">Separe por vírgula. Ex.: sabores “Chocolate, Baunilha” × tamanhos “900 g, 1,8 kg” cria 4 opções com o mesmo preço.</p>
        <div class="stack"><div class="field"><label>Sabores</label><input class="input" data-gf></div>
        <div class="field"><label>Tamanhos</label><input class="input" data-gs></div>
        <div class="field"><label>Preço de venda</label>${moneyInput('gp', null)}</div>
        <button class="btn btn--dark" data-go>Criar opções</button></div>`,
      onMount(m, close) {
        m.querySelector('[data-go]').onclick = () => {
          const fl = m.querySelector('[data-gf]').value.split(',').map((s) => s.trim()).filter(Boolean);
          const sz = m.querySelector('[data-gs]').value.split(',').map((s) => s.trim()).filter(Boolean);
          const price = parseBRL(m.querySelector('[name="gp"]').value);
          const combos = [];
          for (const a of fl.length ? fl : ['']) for (const b of sz.length ? sz : ['']) if (a || b) combos.push({ ...blankVariant(), flavor: a, size: b, price_cents: price });
          if (!combos.length) return;
          const keep = p.variants.filter((v) => v.id || v.flavor || v.size || v.price_cents || v.gtin);
          p.variants = [...keep, ...combos.filter((c) => !keep.some((k) => (k.flavor || '') === c.flavor && (k.size || '') === c.size))];
          close();
          draw();
        };
      },
    });
  }

  el.addEventListener('input', onInput);
  el.addEventListener('change', (e) => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onInput(e); onChange(e); });
  el.addEventListener('click', onClick);
  draw();
}
