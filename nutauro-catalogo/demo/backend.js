// Servidor SIMULADO no navegador, usado apenas na versão de demonstração estática (arquivo único).
// Reaproveita as regras compartilhadas (preço, frete, mensagem, GTIN). Dados ficam no localStorage
// deste navegador — isto NÃO é um banco de produção. Na versão real, tudo isso roda no servidor Node.

import { cartTotals, unitPrice, variantLabel } from '../public/shared/pricing.js';
import { quoteShipping, normalizeCep } from '../public/shared/shipping.js';
import { buildOrderMessage, waLink, normalizePhoneBR } from '../public/shared/whatsapp.js';
import { validateGtin, normalizeGtin } from '../public/shared/gtin.js';
import { ADMIN_TRANSITIONS } from '../public/shared/status.js';
import { toPublic, filterProducts, facets, relatedProducts, fold } from '../server/catalog.js';

const KEY = 'nt_demo_db_v1';
const SEED = window.NT_DEMO_SEED;
let db;

function load() {
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
  if (!db || db.version !== SEED.version) db = structuredClone(SEED);
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }
load();

class E extends Error { constructor(status, msg, details) { super(msg); this.status = status; this.details = details; } }
const bad = (m, d) => new E(400, m, d);
const nowIso = () => new Date().toISOString();
const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';
const nextId = (k) => (db.seq[k] = (db.seq[k] || 0) + 1);
const allVariants = () => db.products.flatMap((p) => p.variants.map((v) => ({ ...v, product_id: p.id })));
const findVariant = (id) => { for (const p of db.products) { const v = p.variants.find((x) => x.id === id); if (v) return { p, v }; } return {}; };

function reserved(excludeId = 0) {
  const m = new Map();
  const now = nowIso();
  for (const o of db.orders) {
    if (o.id === excludeId || o.stock_state !== 'reserved' || !(o.reservation_expires_at > now)) continue;
    for (const it of o.items) m.set(it.variant_id, (m.get(it.variant_id) || 0) + it.qty);
  }
  return m;
}
function expire() {
  const now = nowIso();
  for (const o of db.orders) {
    if (o.stock_state === 'reserved' && o.reservation_expires_at <= now && ['novo', 'aguardando_pagamento'].includes(o.status)) {
      o.status = 'expirado'; o.stock_state = 'released'; o.reservation_expires_at = null;
      ev(o, 'expirado', 'Reserva expirou sem confirmação. Itens liberados.');
    }
  }
}
function ev(o, type, message) { o.events.push({ type, message, created_at: nowIso() }); }

function brandOf(p) { return db.brands.find((b) => b.id === p.brand_id); }
function catOf(p) { return db.categories.find((c) => c.id === p.category_id); }
function rowFor(p) {
  const b = brandOf(p); const c = catOf(p);
  return { ...p, images_json: JSON.stringify(p.images || []), nutrition_json: p.nutrition ? JSON.stringify(p.nutrition) : null,
    brand_name: b?.name, brand_slug: b?.slug, category_name: c?.name, category_slug: c?.slug, variants: p.variants.filter((v) => v.active) };
}
function publicList() {
  const r = reserved();
  return db.products.filter((p) => p.status === 'active').map((p) => toPublic(rowFor(p), r)).filter((p) => p.variants.length);
}

function move(v, type, qty, reason, orderId = null) {
  const bal = v.stock + qty;
  if (bal < 0) throw new E(409, `Saldo insuficiente (saldo atual ${v.stock}).`);
  v.stock = bal;
  db.movements.unshift({ id: nextId('mov'), variant_id: v.id, type, qty, balance_after: bal, reason, order_id: orderId, created_at: nowIso() });
  return bal;
}
function commit(o) {
  if (o.stock_state === 'committed') return;
  const others = reserved(o.id);
  const short = [];
  for (const it of o.items) {
    const { v } = findVariant(it.variant_id);
    const avail = (v?.stock ?? 0) - (others.get(it.variant_id) || 0);
    if (avail < it.qty) short.push({ name: it.product_name, label: it.variant_label, available: Math.max(0, avail) });
  }
  if (short.length) throw new E(409, 'Estoque insuficiente para confirmar a venda.', { short });
  for (const it of o.items) move(findVariant(it.variant_id).v, 'venda', -it.qty, 'Venda confirmada', o.id);
  o.stock_state = 'committed'; o.reservation_expires_at = null;
}
function release(o) {
  if (o.stock_state === 'committed') for (const it of o.items) move(findVariant(it.variant_id).v, 'devolucao', it.qty, `Pedido ${o.code} cancelado`, o.id);
  o.stock_state = 'released'; o.reservation_expires_at = null;
}

function priceCart(items) {
  const merged = new Map();
  for (const i of items || []) merged.set(Number(i.variant_id), (merged.get(Number(i.variant_id)) || 0) + Number(i.qty));
  const r = reserved();
  const lines = []; const problems = [];
  for (const [id, qty] of merged) {
    const { p, v } = findVariant(id);
    if (!v || !v.active || p.status !== 'active') { problems.push({ variant_id: id, code: 'unavailable', message: 'Produto indisponível no catálogo.' }); continue; }
    const available = Math.max(0, v.stock - (r.get(id) || 0));
    if (available < qty) problems.push({ variant_id: id, code: available ? 'insufficient' : 'out_of_stock', available, message: available ? `Restam ${available} unidade(s) disponível(is).` : 'Esgotado.' });
    const u = unitPrice(v);
    lines.push({ variant_id: id, product_id: p.id, product_slug: p.slug, product_name: p.name, brand: brandOf(p)?.name, variant_label: variantLabel(v), sku: v.sku,
      flavor: v.flavor, size: v.size, image: p.images[0], qty, available, regular_cents: v.price_cents, unit_cents: u, unit_cost_cents: v.cost_cents, total_cents: u * qty });
  }
  return { lines, problems };
}

const channels = () => {
  const s = db.settings;
  const wa = !!normalizePhoneBR(s.store.whatsapp);
  return {
    whatsapp: s.checkout.mode !== 'site',
    site: s.checkout.mode !== 'whatsapp' && s.payments.provider === 'demo',
    whatsapp_configured: wa,
    payment_demo: s.payments.provider === 'demo',
  };
};

function statusUrl(o) { return `${location.origin}${location.pathname}#/pedido/${o.code}?t=${o.public_token}`; }
function orderOut(o, internal = false) {
  const out = { ...o, status_url: statusUrl(o) };
  if (!internal) { delete out.public_token; delete out.admin_notes; delete out.events; delete out.payments; out.items = o.items.map(({ unit_cost_cents, ...x }) => x); }
  if (o.channel === 'whatsapp') {
    out.whatsapp_message = buildOrderMessage(out, { storeName: db.settings.store.name });
    out.whatsapp_url = waLink(db.settings.store.whatsapp, out.whatsapp_message);
  }
  if (internal) {
    const cost = o.items.reduce((s, i) => s + (i.unit_cost_cents ?? 0) * i.qty, 0);
    out.margin = { cost_cents: cost, missing_cost: o.items.some((i) => i.unit_cost_cents == null), gross_cents: o.totals.subtotal_cents - o.totals.promo_discount_cents - o.totals.pix_discount_cents - cost };
  }
  return out;
}

function createOrder(b) {
  const s = db.settings;
  const ch = channels();
  if (!ch[b.channel]) throw bad(b.channel === 'site' ? 'A compra pelo site não está disponível no momento.' : 'Pedido pelo WhatsApp indisponível.');
  const name = String(b.customer?.name || '').trim();
  if (name.length < 2) throw bad('Informe seu nome.');
  const phone = normalizePhoneBR(b.customer?.phone);
  if (!phone) throw bad('Informe um WhatsApp/telefone válido com DDD.');
  const { lines, problems } = priceCart(b.items);
  if (!lines.length) throw bad('Carrinho vazio.');
  if (problems.length) throw new E(409, 'Alguns itens mudaram de disponibilidade. Revise o carrinho.', { problems });
  const itemsCents = lines.reduce((t, l) => t + l.total_cents, 0);
  let shipping; let address = null;
  if (b.fulfillment === 'pickup') shipping = { status: 'pickup', fee_cents: 0, label: 'Retirada na loja', estimate_text: s.pickup.estimate_text || '' };
  else {
    address = { ...b.address, cep: normalizeCep(b.address?.cep) };
    for (const k of ['cep', 'street', 'number', 'district', 'city', 'uf']) if (!address[k]) throw bad('Endereço incompleto.');
    const q = quoteShipping({ cep: address.cep, delivery: s.delivery, itemsCents });
    const opt = q.options.find((o) => o.kind === 'delivery');
    if (!opt) throw bad(q.message || 'Não há entrega configurada para este CEP.');
    shipping = { status: opt.status, fee_cents: opt.fee_cents, label: opt.label, estimate_text: opt.estimate.text };
    if (b.channel === 'site' && opt.status === 'to_confirm') throw bad('Para este CEP o frete precisa ser combinado. Finalize pelo WhatsApp ou escolha retirada.');
  }
  const totals = cartTotals({ lines, shipping, paymentMethod: b.payment_method, payments: s.payments });
  const id = nextId('order');
  const mins = b.channel === 'site' ? s.checkout.site_reservation_minutes : s.checkout.whatsapp_reservation_minutes;
  const o = {
    id, code: `NT-${String(id).padStart(6, '0')}`, public_token: Math.random().toString(36).slice(2, 12),
    channel: b.channel, status: b.channel === 'site' ? 'aguardando_pagamento' : 'novo', payment_status: b.channel === 'site' ? 'pendente' : 'nao_iniciado',
    payment_method: b.payment_method || null, stock_state: 'reserved', reservation_expires_at: new Date(Date.now() + mins * 60000).toISOString(),
    fulfillment: b.fulfillment, customer: { name, phone, email: b.customer?.email || null }, address, shipping, notes: b.notes || null,
    items: lines.map((l) => ({ variant_id: l.variant_id, product_id: l.product_id, product_name: l.product_name, brand: l.brand, variant_label: l.variant_label, sku: l.sku, qty: l.qty, regular_cents: l.regular_cents, unit_cents: l.unit_cents, unit_cost_cents: l.unit_cost_cents, total_cents: l.total_cents })),
    totals, created_at: nowIso(), events: [], payments: [], admin_notes: '',
  };
  ev(o, 'criado', 'Pedido criado (demonstração).');
  let c = db.customers.find((x) => x.phone === phone);
  if (!c) { c = { id: nextId('customer'), name, phone, created_at: nowIso() }; db.customers.push(c); }
  o.customer_id = c.id;
  db.orders.unshift(o);
  return { order: orderOut(o), token: o.public_token };
}

function completeness(p) {
  const required = []; const recommended = [];
  const vs = p.variants.filter((v) => v.active);
  if (!p.name) required.push('Nome do produto');
  if (!p.category_id) required.push('Categoria');
  if (!vs.length) required.push('Ao menos uma opção (sabor/tamanho) ativa');
  if (vs.some((v) => !(v.price_cents > 0))) required.push('Preço de venda em todas as opções');
  if (vs.length > 1 && vs.some((v) => !v.flavor && !v.size)) required.push('Sabor ou tamanho para diferenciar as opções');
  if (!p.images?.length) recommended.push('Foto');
  if (!p.brand_id) recommended.push('Marca');
  return { required, recommended, can_publish: !required.length };
}
function adminProduct(p) {
  const r = reserved();
  return { ...p, brand_name: brandOf(p)?.name || '', category_name: catOf(p)?.name, variants: p.variants.map((v) => ({ ...v, reserved: r.get(v.id) || 0, available: Math.max(0, v.stock - (r.get(v.id) || 0)) })), completeness: completeness(p) };
}
const money = (v) => (v == null || v === '' ? null : Number.isInteger(v) ? v : Math.round(Number(String(v).replace(/\./g, '').replace(',', '.')) * 100));

function saveProduct(b) {
  if (!String(b.name || '').trim()) throw bad('Informe o nome do produto.');
  let brandId = null;
  if (b.brand_name?.trim()) {
    let br = db.brands.find((x) => fold(x.name) === fold(b.brand_name));
    if (!br) { br = { id: nextId('brand'), slug: slugify(b.brand_name), name: b.brand_name.trim(), active: 1 }; db.brands.push(br); }
    brandId = br.id;
  }
  const variants = (b.variants || []).map((v) => {
    if (v.gtin && !validateGtin(v.gtin).valid) throw bad(validateGtin(v.gtin).error);
    return { id: v.id || null, sku: v.sku || null, gtin: v.gtin ? validateGtin(v.gtin).code : null, flavor: v.flavor || null, size: v.size || null,
      price_cents: money(v.price_cents ?? v.price) || 0, promo_price_cents: money(v.promo_price_cents), promo_ends_at: v.promo_ends_at || null, cost_cents: money(v.cost_cents),
      low_stock_threshold: v.low_stock_threshold ?? null, active: v.active === 0 || v.active === false ? 0 : 1, initial_stock: Number(v.initial_stock) || 0 };
  });
  for (const v of variants) if (v.gtin && allVariants().some((x) => x.gtin === v.gtin && x.id !== v.id)) throw bad(`O código ${v.gtin} já está cadastrado.`);
  const draft = { ...b, brand_id: brandId, category_id: b.category_id ? Number(b.category_id) : null, images: b.images || [], variants };
  const c = completeness(draft);
  if (b.status === 'active' && !c.can_publish) throw bad(`Para publicar, falta: ${c.required.join(', ')}.`);
  let p = db.products.find((x) => x.id === b.id);
  if (!p) { p = { id: nextId('product'), slug: slugify(`${b.name} ${b.presentation || ''}`), variants: [], is_demo: 0, created_at: nowIso() }; db.products.unshift(p); }
  const old = p.variants;
  Object.assign(p, { name: b.name.trim(), brand_id: brandId, category_id: draft.category_id, presentation: b.presentation || null, description: b.description || null,
    ingredients: b.ingredients || null, allergens: b.allergens || null, nutrition: b.nutrition || null, nutrition_source: b.nutrition_source || null,
    images: draft.images, status: b.status || 'draft', featured: b.featured ? 1 : 0, is_new: b.is_new ? 1 : 0, is_kit: b.is_kit ? 1 : 0, tags: b.tags || null,
    data_source: b.data_source || p.data_source || null, updated_at: nowIso() });
  p.variants = variants.map((v) => {
    const prev = old.find((x) => x.id === v.id);
    const nv = { ...v, id: prev ? prev.id : nextId('variant'), stock: prev ? prev.stock : 0 };
    delete nv.initial_stock;
    if (!prev && v.initial_stock > 0) move(nv, 'entrada', v.initial_stock, 'Estoque inicial no cadastro');
    return nv;
  });
  return { product: adminProduct(p) };
}

function adminList(q) {
  const r = reserved();
  let list = db.products.map((p) => {
    const act = p.variants.filter((v) => v.active);
    const c = completeness(p);
    return { id: p.id, name: p.name, status: p.status, is_demo: !!p.is_demo, image: p.images[0], brand_name: brandOf(p)?.name, category_name: catOf(p)?.name, category_id: p.category_id,
      variants_count: act.length, stock: act.reduce((s, v) => s + v.stock, 0), available: act.reduce((s, v) => s + Math.max(0, v.stock - (r.get(v.id) || 0)), 0),
      price_min_cents: act.length ? Math.min(...act.map((v) => v.price_cents)) : null, gtins: p.variants.map((v) => v.gtin).filter(Boolean), skus: p.variants.map((v) => v.sku).filter(Boolean),
      missing_required: c.required, missing_recommended: c.recommended };
  });
  if (q.q) list = list.filter((p) => fold([p.name, p.brand_name, ...p.gtins, ...p.skus].join(' ')).includes(fold(q.q)));
  list = q.status ? list.filter((p) => p.status === q.status) : list.filter((p) => p.status !== 'archived');
  if (q.stock === 'out') list = list.filter((p) => p.available === 0);
  if (q.stock === 'incomplete') list = list.filter((p) => p.missing_required.length);
  return list;
}

function lowStock() {
  const r = reserved();
  const out = [];
  for (const p of db.products) {
    if (p.status === 'archived') continue;
    for (const v of p.variants.filter((x) => x.active)) {
      const available = Math.max(0, v.stock - (r.get(v.id) || 0));
      const threshold = v.low_stock_threshold ?? db.settings.catalog.low_stock_default;
      if (available <= threshold) out.push({ id: v.id, flavor: v.flavor, size: v.size, stock: v.stock, reserved: r.get(v.id) || 0, available, threshold, product_id: p.id, product_name: p.name });
    }
  }
  return out.sort((a, b) => a.available - b.available);
}

function pay(o, outcome) {
  const key = `demo-${Date.now()}`;
  if (outcome !== 'approved') { o.payment_status = 'recusado'; ev(o, 'pagamento', 'Pagamento recusado (simulado).'); return { result: 'rejected' }; }
  if (o.payment_status === 'aprovado') return { result: 'already_paid' };
  o.payment_status = 'aprovado';
  o.payments.push({ id: key, provider: 'demo', method: o.payment_method, status: 'aprovado', amount_cents: o.totals.total_cents, updated_at: nowIso() });
  try { commit(o); o.status = 'confirmado'; ev(o, 'pagamento', 'Pagamento aprovado (simulado). Venda confirmada e estoque baixado.'); return { result: 'paid' }; }
  catch { o.status = 'revisar'; ev(o, 'alerta', 'Pagamento aprovado sem estoque suficiente.'); return { result: 'paid_without_stock' }; }
}

// --------------------------------------------------------------------------------- rotas
const routes = [];
const on = (m, re, fn) => routes.push([m, re, fn]);

on('GET', /^\/api\/store$/, () => {
  const s = db.settings;
  return {
    store: s.store, channels: channels(), checkout: s.checkout,
    payments: { pix_discount_pct: s.payments.pix_discount_pct, installments: s.payments.installments, whatsapp_methods: s.payments.whatsapp_methods, provider: s.payments.provider },
    pickup: s.pickup, catalog: s.catalog,
    delivery_summary: s.delivery.zones.filter((z) => z.active !== false && !z.blocked).map((z) => ({ name: z.name, sla: z.sla, free_over_cents: z.free_over_cents, fee_cents: z.fee_cents })),
    categories: db.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort).map(({ slug, name }) => ({ slug, name })),
    brands: s.catalog.brands_section_enabled ? db.brands.filter((b) => b.show_in_home && db.products.some((p) => p.brand_id === b.id && p.status === 'active')) : [],
    banners: db.banners.filter((b) => b.active).sort((a, b) => a.sort - b.sort).map(({ image_note, ...b }) => ({ ...b, provisional: !!image_note })), sections: db.sections.filter((x) => x.active).sort((a, b) => a.sort - b.sort),
    pages: db.pages.filter((p) => p.published).map(({ slug, title }) => ({ slug, title })),
    has_demo_products: true,
  };
});
on('GET', /^\/api\/products$/, (m, q) => {
  const all = publicList().filter((p) => db.settings.catalog.show_out_of_stock !== false || p.in_stock);
  const f = { q: q.q, category: q.categoria, brand: q.marca, min: q.min ? Number(q.min) : null, max: q.max ? Number(q.max) : null, available: q.disponivel === '1', promo: q.promo === '1', kind: q.secao, sort: q.ordem };
  const list = filterProducts(all, f);
  return { total: list.length, products: list, facets: facets(filterProducts(all, { q: f.q, category: f.category, kind: f.kind })) };
});
on('GET', /^\/api\/products\/([^/]+)$/, (m) => {
  const all = publicList();
  const p = all.find((x) => x.slug === decodeURIComponent(m[1]));
  if (!p) throw new E(404, 'Produto não encontrado ou indisponível.');
  return { product: p, related: relatedProducts(all, p) };
});
on('POST', /^\/api\/cart\/price$/, (m, q, b) => priceCart(b.items));
on('POST', /^\/api\/shipping\/quote$/, (m, q, b) => {
  const pc = b.items?.length ? priceCart(b.items) : { lines: [], problems: [] };
  return quoteShipping({ cep: b.cep, delivery: db.settings.delivery, pickup: db.settings.pickup, itemsCents: pc.lines.reduce((t, l) => t + l.total_cents, 0), allInStock: !pc.problems.length });
});
on('POST', /^\/api\/orders$/, (m, q, b) => createOrder(b));
const byCode = (code, t) => { const o = db.orders.find((x) => x.code === code); if (!o || (t !== undefined && o.public_token !== t)) throw new E(404, 'Pedido não encontrado.'); return o; };
on('GET', /^\/api\/orders\/([^/]+)$/, (m, q) => { expire(); const o = byCode(m[1], q.t); return { order: orderOut(o), payment_demo: o.channel === 'site', can_pay: false }; });
on('POST', /^\/api\/orders\/([^/]+)\/pay$/, () => ({ demo: true }));
on('POST', /^\/api\/orders\/([^/]+)\/demo-pay$/, (m, q, b) => pay(byCode(m[1], b.t), b.outcome));
on('GET', /^\/api\/pages\/([^/]+)$/, (m) => { const p = db.pages.find((x) => x.slug === m[1] && x.published); if (!p) throw new E(404, 'Página não encontrada.'); return p; });

const A = (m, re, fn) => on(m, new RegExp(`^/api/admin${re.source.slice(1)}`), fn);
A('GET', /^\/me$/, () => ({ user: { email: 'demo@nutauro', name: 'Demonstração', role: 'owner' } }));
A('POST', /^\/login$/, () => ({ user: { email: 'demo@nutauro', name: 'Demonstração' } }));
A('POST', /^\/logout$/, () => ({ ok: true }));
A('GET', /^\/dashboard$/, () => {
  expire();
  const by = {};
  for (const o of db.orders) by[o.status] = (by[o.status] || 0) + 1;
  const s = db.settings;
  return {
    orders_open: db.orders.filter((o) => ['novo', 'aguardando_pagamento', 'confirmado', 'em_separacao', 'pronto_retirada', 'saiu_entrega', 'revisar'].includes(o.status)).length,
    orders_by_status: by, paid_24h_cents: db.orders.flatMap((o) => o.payments).filter((p) => p.status === 'aprovado').reduce((t, p) => t + p.amount_cents, 0),
    recent_orders: db.orders.slice(0, 6).map((o) => ({ ...o, total_cents: o.totals.total_cents, total_is_final: o.totals.total_is_final })),
    low_stock: lowStock().slice(0, 12),
    products: ['active', 'draft', 'archived'].map((st) => ({ status: st, n: db.products.filter((p) => p.status === st).length })),
    demo_products: db.products.filter((p) => p.is_demo).length,
    setup: [
      { ok: !!normalizePhoneBR(s.store.whatsapp), label: 'Número de WhatsApp da loja', where: 'config' },
      { ok: !!s.store.address, label: 'Endereço da loja (retirada e rodapé)', where: 'config' },
      { ok: !!s.store.cnpj, label: 'CNPJ e dados comerciais', where: 'config' },
      { ok: s.delivery.zones.some((z) => z.fee_cents != null), label: 'Taxas de entrega por região (hoje: "a confirmar")', where: 'entrega' },
      { ok: !db.banners.some((b) => /mascote-provisorio|data:image\/jpeg/.test(b.image || '') && b.image_note), label: 'Substituir a arte provisória do mascote no banner', where: 'banners' },
    ],
  };
});
A('GET', /^\/products$/, (m, q) => ({ products: adminList(q) }));
A('GET', /^\/products\/(\d+)$/, (m) => { const p = db.products.find((x) => x.id === Number(m[1])); if (!p) throw new E(404, 'Produto não encontrado.'); return { product: adminProduct(p) }; });
A('POST', /^\/products$/, (m, q, b) => saveProduct(b));
A('POST', /^\/products\/(\d+)\/duplicate$/, (m) => {
  const p = db.products.find((x) => x.id === Number(m[1]));
  return saveProduct({ ...p, id: null, brand_name: brandOf(p)?.name, name: `${p.name} (cópia)`, status: 'draft', variants: p.variants.map((v) => ({ ...v, id: null, gtin: null, sku: null })) });
});
A('POST', /^\/products\/(\d+)\/status$/, (m, q, b) => {
  const p = db.products.find((x) => x.id === Number(m[1]));
  if (b.status === 'active' && !completeness(p).can_publish) throw bad('Cadastro incompleto.');
  p.status = b.status;
  return { product: adminProduct(p) };
});
A('GET', /^\/taxonomy$/, () => ({
  categories: db.categories.map((c) => ({ ...c, n: db.products.filter((p) => p.category_id === c.id && p.status !== 'archived').length })),
  brands: db.brands.map((b) => ({ ...b, n: db.products.filter((p) => p.brand_id === b.id && p.status !== 'archived').length })),
}));
A('POST', /^\/categories$/, (m, q, b) => {
  const c = db.categories.find((x) => x.id === b.id);
  if (c) Object.assign(c, { name: b.name, sort: b.sort ?? c.sort, active: b.active === false ? 0 : 1 });
  else db.categories.push({ id: nextId('category'), slug: slugify(b.name), name: b.name, sort: db.categories.length + 1, active: 1 });
  return { ok: true };
});
A('POST', /^\/brands$/, (m, q, b) => {
  const br = db.brands.find((x) => x.id === b.id);
  if (br) Object.assign(br, { name: b.name, logo: b.logo, active: b.active ? 1 : 0, show_in_home: b.show_in_home ? 1 : 0 });
  else db.brands.push({ id: nextId('brand'), slug: slugify(b.name), name: b.name, logo: b.logo, active: 1, show_in_home: b.show_in_home ? 1 : 0 });
  return { ok: true };
});
A('POST', /^\/stock\/move$/, (m, q, b) => {
  const { v } = findVariant(Number(b.variant_id));
  if (!v) throw new E(404, 'Opção não encontrada.');
  if (b.type === 'ajuste') { const d = Number(b.target) - v.stock; return { balance: d ? move(v, 'ajuste', d, b.reason || 'Ajuste de inventário') : v.stock }; }
  const qty = Number(b.qty);
  if (!(qty > 0)) throw bad('Informe a quantidade.');
  if (b.type === 'entrada') { if (b.unit_cost_cents != null) v.cost_cents = b.unit_cost_cents; return { balance: move(v, 'entrada', qty, b.reason || 'Entrada de mercadoria') }; }
  if (!b.reason) throw bad('Informe o motivo da saída (ex.: avaria, vencimento, uso interno).');
  return { balance: move(v, 'saida', -qty, b.reason) };
});
A('GET', /^\/stock\/movements$/, (m, q) => ({
  movements: db.movements.filter((x) => !q.product_id || findVariant(x.variant_id).p?.id === Number(q.product_id)).slice(0, 200).map((x) => {
    const { p, v } = findVariant(x.variant_id);
    return { ...x, product_name: p?.name, flavor: v?.flavor, size: v?.size, order_code: db.orders.find((o) => o.id === x.order_id)?.code };
  }),
}));
A('GET', /^\/stock\/low$/, () => ({ items: lowStock() }));
A('GET', /^\/orders$/, (m, q) => {
  expire();
  let list = db.orders;
  if (q.status === 'abertos') list = list.filter((o) => ['novo', 'aguardando_pagamento', 'confirmado', 'em_separacao', 'pronto_retirada', 'saiu_entrega', 'revisar'].includes(o.status));
  else if (q.status) list = list.filter((o) => o.status === q.status);
  if (q.q) list = list.filter((o) => fold(o.code + o.customer.name).includes(fold(q.q)));
  return { orders: list.map((o) => ({ ...o, total_cents: o.totals.total_cents, total_is_final: o.totals.total_is_final })) };
});
const orderById = (id) => { const o = db.orders.find((x) => x.id === Number(id)); if (!o) throw new E(404, 'Pedido não encontrado.'); return o; };
A('GET', /^\/orders\/(\d+)$/, (m) => ({ order: orderOut(orderById(m[1]), true) }));
A('POST', /^\/orders\/(\d+)\/status$/, (m, q, b) => {
  const o = orderById(m[1]);
  if (!(ADMIN_TRANSITIONS[o.status] || []).includes(b.to)) throw bad('Transição inválida.');
  if (b.to === 'confirmado') commit(o);
  if (b.to === 'cancelado') release(o);
  o.status = b.to;
  ev(o, `status:${b.to}`, null);
  return { order: orderOut(o, true) };
});
A('POST', /^\/orders\/(\d+)\/payment$/, (m, q, b) => {
  const o = orderById(m[1]);
  o.payment_status = 'aprovado'; o.payment_method = b.method;
  o.payments.push({ provider: 'manual', method: b.method, status: 'aprovado', amount_cents: b.amount_cents, updated_at: nowIso() });
  ev(o, 'pagamento', `Recebimento registrado manualmente (${b.method}).`);
  return { order: orderOut(o, true) };
});
A('POST', /^\/orders\/(\d+)\/refund$/, (m, q, b) => { const o = orderById(m[1]); o.payment_status = 'estornado'; ev(o, 'estorno', b.reason || 'Estorno registrado.'); return { order: orderOut(o, true) }; });
A('POST', /^\/orders\/(\d+)\/notes$/, (m, q, b) => { orderById(m[1]).admin_notes = b.admin_notes; return { ok: true }; });
A('GET', /^\/customers$/, () => ({ customers: db.customers.map((c) => { const os = db.orders.filter((o) => o.customer_id === c.id); return { ...c, orders: os.length, last_order: os[0]?.created_at, paid_cents: os.filter((o) => o.payment_status === 'aprovado').reduce((t, o) => t + o.totals.total_cents, 0) }; }) }));
A('GET', /^\/banners$/, () => ({ banners: db.banners }));
A('POST', /^\/banners$/, (m, q, b) => { const x = db.banners.find((y) => y.id === b.id); if (x) Object.assign(x, b); else db.banners.push({ ...b, id: nextId('banner') }); return { ok: true }; });
A('POST', /^\/banners\/(\d+)\/delete$/, (m) => { db.banners = db.banners.filter((x) => x.id !== Number(m[1])); return { ok: true }; });
A('GET', /^\/sections$/, () => ({ sections: db.sections }));
A('POST', /^\/sections$/, (m, q, b) => { for (const s of b.sections) Object.assign(db.sections.find((x) => x.id === s.id), s); return { ok: true }; });
A('GET', /^\/pages$/, () => ({ pages: db.pages }));
A('POST', /^\/pages$/, (m, q, b) => { if (b.published && /\[Texto a ser preenchido/.test(b.body)) throw bad('Substitua o texto modelo antes de publicar.'); Object.assign(db.pages.find((x) => x.id === b.id), b); return { ok: true }; });
A('GET', /^\/settings$/, () => ({ settings: db.settings, integrations: { payments: { mercadopago: { configured: false }, demo_allowed: true }, gtin: [], public_url: location.origin } }));
A('POST', /^\/settings$/, (m, q, b) => { Object.assign(db.settings, b); return { settings: db.settings }; });
A('POST', /^\/uploads$/, (m, q, b) => ({ url: b.data_url }));
A('GET', /^\/gtin\/(\d*)$/, (m, q) => {
  const code = normalizeGtin(m[1]);
  const g = validateGtin(code);
  const hit = allVariants().find((v) => v.gtin && (v.gtin === code || v.gtin.replace(/^0+/, '') === code.replace(/^0+/, '')));
  if (hit) { const { p, v } = findVariant(hit.id); return { validation: g, internal: { variant_id: v.id, product_id: p.id, product_name: p.name, flavor: v.flavor, size: v.size, stock: v.stock, status: p.status, image: p.images[0] } }; }
  if (!g.valid) return { validation: g, internal: null, external: [] };
  return { validation: g, internal: null, external: q.externo === '0' ? [] : [
    { provider: 'openfoodfacts', label: 'Open Food Facts', status: 'error', error: 'Consulta externa não disponível nesta demonstração (precisa do servidor)' },
    { provider: 'cosmos', label: 'Cosmos (Bluesoft)', status: 'not_configured' },
  ] };
});
A('POST', /^\/import$/, () => { throw bad('Importação CSV disponível apenas na versão com servidor.'); });
A('POST', /^\/demo\/remove$/, () => { const n = db.products.filter((p) => p.is_demo).length; db.products = db.products.filter((p) => !p.is_demo); return { removed: n, archived: 0 }; });

window.NT_DEMO = {
  async request(url, { method = 'GET', body } = {}) {
    await new Promise((r) => setTimeout(r, 120)); // simula rede
    const u = new URL(url, 'http://x');
    const q = Object.fromEntries(u.searchParams);
    for (const [m, re, fn] of routes) {
      const mm = m === method && re.exec(u.pathname);
      if (!mm) continue;
      try {
        const out = fn(mm, q, body ? structuredClone(body) : {});
        persist();
        return structuredClone(out);
      } catch (e) {
        const err = new Error(e.message);
        err.status = e.status || 500;
        err.details = e.details;
        throw err;
      }
    }
    const err = new Error('Recurso indisponível na demonstração.');
    err.status = 404;
    throw err;
  },
  reset() { localStorage.removeItem(KEY); location.reload(); },
};
