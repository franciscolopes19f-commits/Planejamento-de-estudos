import { api, $, esc, icon, link, go, toast, modal } from '../lib.js';
import { openScanner, cameraSupport, decodeFromPhoto } from '../scanner.js';
import { openMoveModal } from './stock.js';
import { validateGtin, normalizeGtin, gtinCheckDigit } from '/shared/gtin.js';

const FIELD_LABEL = { name: 'Nome', brand: 'Marca', size: 'Peso/volume', description: 'Descrição', ingredients: 'Ingredientes', image_url: 'Foto', flavor: 'Sabor' };

/**
 * Fluxo do código de barras:
 * 1) valida EAN/GTIN → 2) procura no cadastro interno → 3a) achou: editar ou dar entrada
 * 3b) não achou: consulta fontes externas conectadas → revisão → completar preço/custo/estoque → salvar.
 */
export async function renderScan(el) {
  const cam = cameraSupport();
  el.innerHTML = `
    <div class="scan-box">
      <label for="gtin" class="lbl" style="color:#fff">Código de barras</label>
      <form data-form class="stack" style="margin-top:6px">
        <input class="input mono" id="gtin" inputmode="numeric" autocomplete="off" placeholder="Digite ou use o leitor" enterkeyhint="search">
        ${cam.ok ? `<button type="button" class="btn btn--block" data-cam>${icon('camera')} Ler com a câmera</button>` : ''}
        <div class="grid2">
          <label class="btn ${cam.ok ? 'btn--ghost' : ''}" style="cursor:pointer">${icon('img')} Foto do código<input type="file" accept="image/*" capture="environment" data-photo hidden></label>
          <button type="submit" class="btn btn--ghost">Consultar</button>
        </div>
      </form>
      <p class="xs" style="color:#bdbbb2;margin:8px 0 0">${cam.ok ? 'Leitor físico (USB/Bluetooth): mantenha o cursor no campo e faça a leitura.' : esc(cam.reason)} “Foto do código” abre a câmera do celular; tire a foto bem de perto.</p>
    </div>
    <div data-demo-codes></div>
    <div data-result style="margin-top:14px" aria-live="polite"></div>`;
  const input = $('#gtin', el);
  input.focus();

  // Demonstração: códigos FICTÍCIOS (faixa 200, uso interno) para testar sem embalagem em mãos.
  if (window.NT_DEMO) {
    const { products } = await api('/products');
    const known = products.filter((p) => p.gtins.length).slice(0, 3).map((p) => [p.gtins[0], p.name]);
    const unknownBody = '200000099999';
    const unknown = unknownBody + gtinCheckDigit(unknownBody);
    $('[data-demo-codes]', el).innerHTML = `<div class="card small" style="margin-top:12px"><b>Códigos fictícios para testar</b>
      <p class="muted" style="margin:4px 0 8px">Toque para consultar. Os produtos de demonstração usam códigos de uso interno, que não pertencem a produtos reais.</p>
      <div class="row">${known.map(([c, n]) => `<button type="button" class="fchip" data-try="${c}">${esc(c)} · ${esc(n)}</button>`).join('')}
      <button type="button" class="fchip" data-try="${unknown}">${unknown} · não cadastrado</button>
      <button type="button" class="fchip" data-try="2000000099990">2000000099990 · dígito errado</button></div></div>`;
    $('[data-demo-codes]', el).onclick = (e) => { const b = e.target.closest('[data-try]'); if (b) lookup(b.dataset.try); };
  }

  async function lookup(raw) {
    const code = normalizeGtin(raw);
    input.value = code;
    const out = $('[data-result]', el);
    const g = validateGtin(code);
    if (!g.valid) {
      out.innerHTML = `<div class="card card--danger"><b>${esc(g.error)}</b><p class="small" style="margin:6px 0 0">Confira os dígitos. Se o produto não tiver código de barras, cadastre manualmente.</p>
        <a class="btn btn--ghost btn--sm" style="margin-top:8px" href="${link('/produtos/novo')}" data-nav>Cadastro manual</a></div>`;
      return;
    }
    out.innerHTML = '<div class="card empty"><div class="spinner" style="margin:auto"></div><p class="small">Consultando cadastro…</p></div>';
    let r;
    try { r = await api(`/gtin/${code}?externo=0`); } catch (e) { out.innerHTML = `<div class="card card--danger">${esc(e.message)}</div>`; return; }
    if (r.internal) return showInternal(out, r.internal, g);
    out.innerHTML = `<div class="card"><b>${esc(g.type)} ${esc(code)}</b><p class="small" style="margin:4px 0 0">Não está no cadastro da loja. Buscando nas fontes externas…</p><div class="spinner" style="margin:10px 0 0"></div></div>`;
    try { r = await api(`/gtin/${code}`); } catch (e) { r = { external: [], error: e.message }; }
    showExternal(out, code, g, r.external || []);
  }

  function showInternal(out, it, g) {
    const label = [it.flavor, it.size].filter(Boolean).join(' · ');
    out.innerHTML = `
      <div class="card">
        <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
          <div class="li__img" style="width:64px;height:64px">${it.image ? `<img src="${esc(it.image)}" alt="">` : icon('img')}</div>
          <div class="grow"><span class="pill pill--ok">${icon('check')} Já cadastrado</span>
            <div style="font-weight:800;margin-top:4px">${esc(it.product_name)}</div>
            <div class="small muted">${esc(label || 'Opção única')} · saldo ${it.stock}${it.status !== 'active' ? ' · <b>não publicado</b>' : ''}</div></div>
        </div>
        <div class="grid2" style="margin-top:12px">
          <button class="btn" data-entry>${icon('plus')} Entrada de estoque</button>
          <a class="btn btn--dark" href="${link(`/produtos/${it.product_id}`)}" data-nav>Editar produto</a>
        </div>
      </div>`;
    $('[data-entry]', out).onclick = () => openMoveModal({ id: it.variant_id, flavor: it.flavor, size: it.size, stock: it.stock, product_name: it.product_name }, () => { input.value = ''; input.focus(); lookup(g.code); });
  }

  function showExternal(out, code, g, results) {
    const found = results.filter((x) => x.status === 'found');
    const statusText = {
      not_found: 'Sem dados para este código.',
      not_configured: 'Fonte não conectada (falta a credencial no servidor).',
      error: 'Fonte indisponível agora.',
    };
    out.innerHTML = `
      <div class="card"><b>${esc(g.type)} ${esc(code)}</b> <span class="pill pill--warn">Novo na loja</span>
        <p class="small muted" style="margin:6px 0 0">Ler o código não traz todos os dados automaticamente. Revise e complete antes de publicar.</p></div>
      ${!found.length ? `<div class="card card--warn small">${icon('alert')} <b>Nenhuma consulta externa trouxe dados.</b> ${results.some((x) => x.status === 'found' || x.status === 'not_found') ? '' : 'A consulta externa não está configurada ou disponível aqui. '}Preencha os dados a partir da embalagem em “Cadastro manual”.</div>` : ''}
      ${found.map((x, i) => `
        <div class="card">
          <div class="row row--between"><span class="src-tag">${icon('db')} ${esc(x.label)}</span>${x.cached ? '<span class="xs muted">consulta salva</span>' : ''}</div>
          <div class="row" style="margin-top:10px;align-items:flex-start;flex-wrap:nowrap">
            ${x.fields.image_url ? `<div class="li__img" style="width:72px;height:72px"><img src="${esc(x.fields.image_url)}" alt=""></div>` : ''}
            <dl class="kv grow" style="grid-template-columns:auto 1fr">${Object.entries(x.fields).filter(([k]) => k !== 'image_url').map(([k, v]) => `<dt>${esc(FIELD_LABEL[k] || k)}</dt><dd style="text-align:left;font-weight:600" class="small">${esc(String(v).slice(0, 160))}${String(v).length > 160 ? '…' : ''}</dd>`).join('')}</dl>
          </div>
          <p class="xs muted" style="margin:8px 0">${esc(x.attribution || '')}</p>
          <button class="btn btn--block" data-use="${i}">Usar estes dados e completar</button>
        </div>`).join('')}
      <div class="card">
        <b class="small">Fontes consultadas</b>
        <ul class="small" style="margin:6px 0 0;padding-left:18px">${results.length ? results.map((x) => `<li>${esc(x.label)}: ${x.status === 'found' ? 'dados encontrados' : esc(x.error || statusText[x.status] || x.status)}</li>`).join('') : '<li>Nenhuma fonte externa ativa.</li>'}</ul>
        <div class="grid2" style="margin-top:12px">
          <button class="btn btn--dark" data-manual>Cadastro manual</button>
          <button class="btn btn--ghost" data-link-existing>Vincular a produto existente</button>
        </div>
      </div>`;
    out.onclick = (e) => {
      const u = e.target.closest('[data-use]');
      if (u) {
        const x = found[Number(u.dataset.use)];
        sessionStorage.setItem('nt_prefill', JSON.stringify({ gtin: code, fields: x.fields, source: { provider: x.provider, label: x.label, fetched_at: x.fetched_at, attribution: x.attribution } }));
        go('/produtos/novo');
      }
      if (e.target.closest('[data-manual]')) {
        sessionStorage.setItem('nt_prefill', JSON.stringify({ gtin: code, fields: {} }));
        go('/produtos/novo');
      }
      if (e.target.closest('[data-link-existing]')) linkExisting(code);
    };
  }

  // Produto já cadastrado sem código: vincula o código lido a uma opção existente.
  async function linkExisting(code) {
    const { products } = await api('/products');
    const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    modal({
      title: 'Vincular código',
      html: `<input class="input" type="search" placeholder="Buscar produto" data-s><div class="list" data-l style="margin-top:8px"></div>`,
      onMount(m, close) {
        const draw = (q) => {
          const res = products.filter((p) => fold(p.name + ' ' + (p.brand_name || '')).includes(fold(q))).slice(0, 10);
          $('[data-l]', m).innerHTML = res.map((p) => `<button class="li" data-p="${p.id}"><div class="li__main"><div class="li__title">${esc(p.name)}</div><div class="li__sub">${esc(p.brand_name || '')}</div></div></button>`).join('') || '<div class="empty small">Nada encontrado.</div>';
        };
        draw('');
        $('[data-s]', m).oninput = (e) => draw(e.target.value);
        $('[data-l]', m).onclick = async (e) => {
          const b = e.target.closest('[data-p]');
          if (b) {
            const { product } = await api(`/products/${b.dataset.p}`);
            const free = product.variants.filter((v) => v.active);
            $('[data-l]', m).innerHTML = `<p class="small" style="padding:10px 14px;margin:0">Em qual opção de <b>${esc(product.name)}</b>?</p>` + free.map((v) => `<button class="li" data-v="${v.id}"><div class="li__main"><div class="li__title">${esc([v.flavor, v.size].filter(Boolean).join(' · ') || 'Opção única')}</div><div class="li__sub">${v.gtin ? `código atual ${esc(v.gtin)} (será substituído)` : 'sem código'}</div></div></button>`).join('');
            $('[data-l]', m).onclick = async (ev) => {
              const vb = ev.target.closest('[data-v]');
              if (!vb) return;
              const body = { ...product, brand_id: null, variants: product.variants.map((v) => (v.id === Number(vb.dataset.v) ? { ...v, gtin: code } : v)) };
              try {
                await api('/products', { method: 'POST', body });
                close();
                toast('Código vinculado.');
                lookup(code);
              } catch (err) { toast(err.message, { bad: true }); }
            };
          }
        };
      },
    });
  }

  $('[data-form]', el).addEventListener('submit', (e) => { e.preventDefault(); lookup(input.value); });
  $('[data-cam]', el)?.addEventListener('click', () => openScanner((code) => lookup(code)));
  $('[data-photo]', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const out = $('[data-result]', el);
    out.innerHTML = '<div class="card empty"><div class="spinner" style="margin:auto"></div><p class="small">Lendo o código na foto…</p></div>';
    try { lookup(await decodeFromPhoto(f)); }
    catch (err) { out.innerHTML = `<div class="card card--danger small">${esc(err.message)} Você também pode digitar o número abaixo das barras.</div>`; }
  });
}
