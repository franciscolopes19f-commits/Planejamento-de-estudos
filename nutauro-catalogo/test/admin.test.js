// Painel: autenticação, cadastro, publicação, código de barras, CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

test('Painel exige login e cabeçalho anti-CSRF; catálogo é público', async () => {
  const t = await startApp();
  try {
    assert.equal((await t.req('GET', '/api/admin/products')).status, 401);
    assert.equal((await t.req('GET', '/api/products')).status, 200);
    assert.equal((await t.req('POST', '/api/admin/login', { email: 'admin@teste.com', password: 'errada' }, { admin: true })).status, 401);
    const ok = await t.login();
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    // sem o cabeçalho, mesmo com sessão, alteração é bloqueada
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    const r = await fetch(`${t.base}/api/admin/products`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
  } finally { t.close(); }
});

test('Cadastro: rascunho aceita incompleto; publicar exige o mínimo; publicado aparece na loja; arquivado some', async () => {
  const t = await startApp({ seedDemo: false });
  try {
    await t.login();
    const tax = (await t.req('GET', '/api/admin/taxonomy', undefined, { admin: true })).body;
    const cat = tax.categories.find((c) => c.slug === 'creatina');
    let r = await t.req('POST', '/api/admin/products', { name: 'Creatina X', status: 'draft', variants: [{ size: '300 g' }] }, { admin: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.product.completeness.required, ['Categoria', 'Preço de venda em todas as opções']);
    const id = r.body.product.id;
    r = await t.req('POST', '/api/admin/products', { id, name: 'Creatina X', status: 'active', variants: [{ id: r.body.product.variants[0].id, size: '300 g' }] }, { admin: true });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Para publicar, falta/);
    const vid = (await t.req('GET', `/api/admin/products/${id}`, undefined, { admin: true })).body.product.variants[0].id;
    r = await t.req('POST', '/api/admin/products', {
      id, name: 'Creatina X', brand_name: 'Marca Y', category_id: cat.id, status: 'active',
      variants: [{ id: vid, size: '300 g', price: '99,90', cost: '60,00', gtin: '7894900011517' }],
    }, { admin: true });
    assert.equal(r.status, 200, r.text);
    let pub = await t.req('GET', '/api/products?q=creatina');
    assert.equal(pub.body.total, 1);
    assert.equal(pub.body.products[0].in_stock, false); // sem estoque ainda
    // entrada de estoque
    await t.req('POST', '/api/admin/stock/move', { variant_id: vid, type: 'entrada', qty: 12, unit_cost_cents: 6100 }, { admin: true });
    pub = await t.req('GET', '/api/products?q=creatina&disponivel=1');
    assert.equal(pub.body.products[0].variants[0].available, 12);
    // saída sem motivo é recusada; ajuste de inventário registra diferença
    assert.equal((await t.req('POST', '/api/admin/stock/move', { variant_id: vid, type: 'saida', qty: 1 }, { admin: true })).status, 400);
    const adj = await t.req('POST', '/api/admin/stock/move', { variant_id: vid, type: 'ajuste', target: 10, reason: 'contagem' }, { admin: true });
    assert.equal(adj.body.balance, 10);
    // código duplicado é recusado
    r = await t.req('POST', '/api/admin/products', { name: 'Outro', status: 'draft', variants: [{ gtin: '7894900011517', price: '10' }] }, { admin: true });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /já está cadastrado/);
    // GTIN inválido é recusado
    r = await t.req('POST', '/api/admin/products', { name: 'Outro', status: 'draft', variants: [{ gtin: '7891234567890', price: '10' }] }, { admin: true });
    assert.equal(r.status, 400);
    // arquivar remove da loja
    await t.req('POST', `/api/admin/products/${id}/status`, { status: 'archived' }, { admin: true });
    assert.equal((await t.req('GET', '/api/products?q=creatina')).body.total, 0);
    // link compartilhável do produto renderiza metadados
    await t.req('POST', `/api/admin/products/${id}/status`, { status: 'active' }, { admin: true });
    const html = await t.req('GET', `/produto/${r.body?.product?.slug || 'creatina-x'}`);
    assert.match(html.text, /<title>Creatina X — Marca Y/);
    assert.match(html.text, /application\/ld\+json/);
  } finally { t.close(); }
});

test('Código de barras: interno encontrado; desconhecido consulta fonte externa e mostra origem; falha de rede não quebra', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('7896005800010')) {
      return new Response(JSON.stringify({ status: 1, product: { product_name: 'Whey Exemplo', brands: 'Fabricante Z', quantity: '900 g', image_front_url: 'https://images.example/x.jpg' } }), { status: 200 });
    }
    if (String(url).includes('7894900530001')) throw new Error('offline');
    return new Response(JSON.stringify({ status: 0 }), { status: 200 });
  };
  const t = await startApp({ fetchImpl });
  try {
    await t.login();
    // interno: cadastra código numa variação demo
    const v = t.db.prepare("SELECT id FROM variants WHERE sku = 'DEMO-WHEY-1'").get();
    t.db.prepare("UPDATE variants SET gtin = '7894900011517' WHERE id = ?").run(v.id);
    let r = await t.req('GET', '/api/admin/gtin/7894900011517', undefined, { admin: true });
    assert.equal(r.body.internal.variant_id, v.id);
    assert.equal(calls.length, 0, 'código interno não consulta fonte externa');
    // inválido
    r = await t.req('GET', '/api/admin/gtin/7891234567890', undefined, { admin: true });
    assert.equal(r.body.validation.valid, false);
    // externo encontrado
    r = await t.req('GET', '/api/admin/gtin/7896005800010', undefined, { admin: true });
    const off = r.body.external.find((x) => x.provider === 'openfoodfacts');
    assert.equal(off.status, 'found');
    assert.equal(off.fields.name, 'Whey Exemplo');
    assert.match(off.attribution, /Open Food Facts/);
    const cosmos = r.body.external.find((x) => x.provider === 'cosmos');
    assert.equal(cosmos.status, 'not_configured');
    // cache: segunda consulta não chama a rede
    const before = calls.length;
    await t.req('GET', '/api/admin/gtin/7896005800010', undefined, { admin: true });
    assert.equal(calls.length, before);
    // falha de rede
    r = await t.req('GET', '/api/admin/gtin/7894900530001', undefined, { admin: true });
    assert.equal(r.body.external.find((x) => x.provider === 'openfoodfacts').status, 'error');
  } finally { t.close(); }
});

test('CSV: exporta, valida antes de aplicar e importa com ajuste rastreável de estoque', async () => {
  const t = await startApp();
  try {
    await t.login();
    const csv = (await t.req('GET', '/api/admin/export.csv', undefined, { admin: true })).text;
    assert.ok(csv.replace(/^\uFEFF/, '').startsWith('produto_slug;produto;marca'));
    assert.ok(csv.includes('DEMO-WHEY-1'));
    const bad = await t.req('POST', '/api/admin/import', { csv: 'produto;preco\nX;abc\n', apply: false }, { admin: true });
    assert.equal(bad.body.errors.length, 1);
    const input = 'produto;marca;categoria;sku;sabor;tamanho;preco;custo;estoque;status\n'
      + 'Albumina;Marca CSV;Whey Protein;CSV-1;Baunilha;500 g;49,90;30,00;7;publicado\n'
      + 'Whey Protein Concentrado;Fabricante Demo A;Whey Protein;DEMO-WHEY-1;Chocolate;900 g;139,90;;20;\n';
    const pre = await t.req('POST', '/api/admin/import', { csv: input, apply: false }, { admin: true });
    assert.deepEqual([pre.body.create, pre.body.update, pre.body.errors.length], [1, 1, 0]);
    const ap = await t.req('POST', '/api/admin/import', { csv: input, apply: true }, { admin: true });
    assert.equal(ap.body.applied, true);
    const alb = (await t.req('GET', '/api/products?q=albumina')).body.products[0];
    assert.equal(alb.price_from_cents, 4990);
    const w = t.db.prepare("SELECT price_cents, stock FROM variants WHERE sku = 'DEMO-WHEY-1'").get();
    assert.deepEqual([w.price_cents, w.stock], [13990, 20]);
    const mov = t.db.prepare("SELECT type, qty, reason FROM stock_movements m JOIN variants v ON v.id = m.variant_id WHERE v.sku = 'DEMO-WHEY-1' ORDER BY m.id DESC").get();
    assert.deepEqual([mov.type, mov.qty, mov.reason], ['ajuste', 12, 'Importação CSV']);
  } finally { t.close(); }
});
