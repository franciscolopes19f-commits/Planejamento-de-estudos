import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getSettings, saveSetting, DEFAULT_SETTINGS, tx } from './db.js';
import { Router, HttpError, send, readJson, readBody, bad, notFound, int, str, nowIso, slugify } from './http.js';
import * as auth from './auth.js';
import { publicProducts, filterProducts, facets, relatedProducts, toPublic, loadProducts } from './catalog.js';
import { reservedMap, moveStock, setStock, lowStock } from './stock.js';
import {
  createOrder, getOrder, verifyOrderToken, expireReservations, transitionOrder, recordManualPayment, recordRefund,
  priceCart, availableChannels, paymentsReady, demoPaymentsAllowed, addEvent,
} from './orders.js';
import { createMercadoPagoPreference, handleMercadoPagoWebhook, handleDemoWebhook, signDemoEvent } from './payments.js';
import { lookupExternal, providerStatus } from './gtin-providers.js';
import {
  listAdminProducts, getAdminProduct, saveProduct, duplicateProduct, setProductStatus, findByCode, exportCsv, importCsv,
} from './admin-products.js';
import { seedBase, seedDemoProducts, removeDemoData } from './seed.js';
import { quoteShipping, normalizeCep } from '../public/shared/shipping.js';
import { validateGtin } from '../public/shared/gtin.js';
import { formatBRL } from '../public/shared/money.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:",
    "font-src 'self'", "connect-src 'self' https://viacep.com.br", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '),
};

export function createApp({ db, env = process.env, dataDir, fetchImpl = fetch, log = console.log }) {
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  seedBase(db);
  if (env.SEED_DEMO !== '0') seedDemoProducts(db);
  auth.ensureOwner(db, env, log);

  const r = new Router();
  const a = new Router(); // /api/admin

  const baseUrlOf = (req) => {
    const s = getSettings(db);
    if (s.store.public_url) return s.store.public_url.replace(/\/$/, '');
    if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, '');
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return `${proto}://${req.headers.host}`;
  };
  const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || env.COOKIE_SECURE === '1';

  // ---------------------------------------------------------------- Loja (público)

  function publicStore() {
    const s = getSettings(db);
    const nowS = nowIso();
    const ch = availableChannels(s, env);
    return {
      store: {
        name: s.store.name, tagline: s.store.tagline, whatsapp: s.store.whatsapp, email: s.store.email, instagram: s.store.instagram,
        address: s.store.address, city: s.store.city, cnpj: s.store.cnpj, hours_text: s.store.hours_text,
      },
      channels: ch,
      checkout: { mode: s.checkout.mode, min_order_cents: s.checkout.min_order_cents,
        whatsapp_reservation_minutes: s.checkout.whatsapp_reservation_minutes, site_reservation_minutes: s.checkout.site_reservation_minutes },
      payments: { pix_discount_pct: s.payments.pix_discount_pct, installments: s.payments.installments, whatsapp_methods: s.payments.whatsapp_methods, provider: ch.site ? s.payments.provider : 'none' },
      pickup: s.pickup,
      delivery_summary: s.delivery.zones.filter((z) => z.active !== false && !z.blocked).map((z) => ({
        name: z.name, sla: z.sla, free_over_cents: z.free_over_cents, fee_cents: z.fee_cents,
      })),
      catalog: s.catalog,
      categories: db.prepare('SELECT slug, name FROM categories WHERE active = 1 ORDER BY sort, name').all(),
      brands: s.catalog.brands_section_enabled
        ? db.prepare(`SELECT b.slug, b.name, b.logo FROM brands b WHERE b.active = 1 AND b.show_in_home = 1
                       AND EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id AND p.status = 'active') ORDER BY b.name`).all()
        : [],
      banners: db.prepare(`SELECT id, title, subtitle, cta_label, cta_link, image, image_mobile, image_position, image_note IS NOT NULL AND image_note <> '' AS provisional FROM banners
                            WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?) ORDER BY sort, id`).all(nowS, nowS),
      sections: db.prepare('SELECT kind, title, max_items, ref FROM sections WHERE active = 1 ORDER BY sort, id').all(),
      pages: db.prepare('SELECT slug, title FROM pages WHERE published = 1 ORDER BY id').all(),
      has_demo_products: !!db.prepare("SELECT 1 FROM products WHERE is_demo = 1 AND status = 'active' LIMIT 1").get(),
    };
  }

  r.get('/api/store', () => publicStore());

  r.get('/api/products', ({ query }) => {
    const showOut = getSettings(db).catalog.show_out_of_stock !== false;
    const all = publicProducts(db).filter((p) => showOut || p.in_stock);
    const f = {
      q: query.q, category: query.categoria || query.category, brand: query.marca || query.brand,
      min: int(query.min, { min: 0 }), max: int(query.max, { min: 0 }),
      available: query.disponivel === '1', promo: query.promo === '1', kind: query.secao, sort: query.ordem,
    };
    const searched = filterProducts(all, { q: f.q, category: f.category, kind: f.kind });
    const list = filterProducts(all, f);
    const limit = int(query.limite, { min: 1, max: 200, def: 60 });
    return { total: list.length, products: list.slice(0, limit), facets: facets(searched) };
  });

  r.get('/api/products/:slug', ({ params }) => {
    const all = publicProducts(db);
    const p = all.find((x) => x.slug === params.slug);
    if (!p) throw notFound('Produto não encontrado ou indisponível.');
    return { product: p, related: relatedProducts(all, p) };
  });

  r.post('/api/cart/price', async ({ req }) => {
    const body = await readJson(req);
    if (!Array.isArray(body.items) || !body.items.length) return { lines: [], problems: [] };
    const valid = body.items.filter((i) => Number.isInteger(Number(i?.variant_id)) && Number(i?.qty) > 0).slice(0, 30)
      .map((i) => ({ variant_id: Number(i.variant_id), qty: Math.min(50, Math.floor(Number(i.qty))) }));
    if (!valid.length) return { lines: [], problems: [] };
    return priceCart(db, valid);
  });

  r.post('/api/shipping/quote', async ({ req }) => {
    const body = await readJson(req);
    const s = getSettings(db);
    let itemsCents = 0;
    let allInStock = true;
    if (Array.isArray(body.items) && body.items.length) {
      try {
        const pc = priceCart(db, body.items);
        itemsCents = pc.lines.reduce((t, l) => t + l.total_cents, 0);
        allInStock = pc.problems.length === 0;
      } catch { /* cotação sem carrinho */ }
    }
    return quoteShipping({ cep: body.cep, delivery: s.delivery, pickup: s.pickup, itemsCents, allInStock });
  });

  r.post('/api/orders', async ({ req }) => {
    const body = await readJson(req);
    const s = getSettings(db);
    const order = createOrder({ db, settings: s, env, baseUrl: baseUrlOf(req) }, body);
    const res = { order: { ...order, public_token: undefined }, token: order.status_url.split('t=')[1] };
    return res;
  });

  r.get('/api/orders/:code', ({ params, query, req }) => {
    if (!verifyOrderToken(db, params.code, query.t)) throw notFound('Pedido não encontrado.');
    expireReservations(db);
    const s = getSettings(db);
    const o = getOrder(db, params.code, { baseUrl: baseUrlOf(req), settings: s });
    return { order: o, payment_demo: s.payments.provider === 'demo' && o.channel === 'site', can_pay: canPay(o, s) };
  });

  function canPay(o, s) {
    return o.channel === 'site' && o.payment_status !== 'aprovado' && o.stock_state === 'reserved'
      && ['aguardando_pagamento'].includes(o.status) && paymentsReady(s, env);
  }

  r.post('/api/orders/:code/pay', async ({ params, req }) => {
    const body = await readJson(req);
    if (!verifyOrderToken(db, params.code, body.t)) throw notFound('Pedido não encontrado.');
    expireReservations(db);
    const s = getSettings(db);
    const o = getOrder(db, params.code, { baseUrl: baseUrlOf(req), settings: s });
    if (!canPay(o, s)) throw bad('Este pedido não está aguardando pagamento.');
    if (s.payments.provider === 'mercadopago') {
      return createMercadoPagoPreference({ env, order: o, settings: s, baseUrl: baseUrlOf(req), fetchImpl });
    }
    if (s.payments.provider === 'demo') return { demo: true };
    throw bad('Pagamento online não configurado.');
  });

  // Simulação de pagamento: gera um evento assinado e o envia pelo mesmo caminho do webhook.
  r.post('/api/orders/:code/demo-pay', async ({ params, req }) => {
    const body = await readJson(req);
    const s = getSettings(db);
    if (s.payments.provider !== 'demo' || !demoPaymentsAllowed(env)) throw bad('Pagamento de demonstração desativado.');
    if (!verifyOrderToken(db, params.code, body.t)) throw notFound('Pedido não encontrado.');
    const o = getOrder(db, params.code, {});
    const outcome = body.outcome === 'rejected' ? 'rejected' : 'approved';
    const ev = {
      event_id: `demo-${crypto.randomUUID()}`, payment_id: `demo-${o.code}`, order_code: o.code, status: outcome,
      amount_cents: o.totals.total_cents, method: o.payment_method,
    };
    const { body: raw, sig } = signDemoEvent(env, ev);
    const result = handleDemoWebhook({ db, env, rawBody: raw, signature: sig });
    return { ...result, event_id: ev.event_id };
  });

  r.post('/api/webhooks/mercadopago', async ({ req, query }) => {
    const raw = await readBody(req, 200_000);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch {}
    const out = await handleMercadoPagoWebhook({ db, env, headers: req.headers, query, body, fetchImpl });
    return { __status: out.status, result: out.result };
  });

  r.post('/api/webhooks/demo', async ({ req }) => {
    const raw = (await readBody(req, 50_000)).toString('utf8');
    const out = handleDemoWebhook({ db, env, rawBody: raw, signature: req.headers['x-demo-signature'] });
    return { __status: out.status, result: out.result };
  });

  r.get('/api/pages/:slug', ({ params }) => {
    const p = db.prepare('SELECT slug, title, body, updated_at FROM pages WHERE slug = ? AND published = 1').get(params.slug);
    if (!p) throw notFound('Página não encontrada.');
    return p;
  });

  // ---------------------------------------------------------------- Administração

  a.post('/login', async ({ req }) => {
    const ip = req.socket.remoteAddress || '?';
    auth.loginRateLimit(ip);
    const body = await readJson(req);
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(body.email || '').trim().toLowerCase());
    if (!u || !auth.verifyPassword(String(body.password || ''), u.pass_hash)) throw new HttpError(401, 'E-mail ou senha incorretos.');
    auth.loginSucceeded(ip);
    const s = auth.createSession(db, u.id);
    return { __headers: { 'Set-Cookie': auth.sessionCookie(s.token, s.expires, isSecure(req)) }, user: { email: u.email, name: u.name, role: u.role } };
  });

  a.post('/logout', ({ req }) => {
    auth.destroySession(db, req);
    return { __headers: { 'Set-Cookie': auth.clearCookie(isSecure(req)) }, ok: true };
  });

  a.get('/me', ({ user }) => ({ user }));

  a.post('/password', async ({ req, user }) => {
    const body = await readJson(req);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!auth.verifyPassword(String(body.current || ''), u.pass_hash)) throw bad('Senha atual incorreta.');
    if (String(body.next || '').length < 8) throw bad('A nova senha precisa ter ao menos 8 caracteres.');
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(auth.hashPassword(String(body.next)), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    const s = auth.createSession(db, user.id);
    return { __headers: { 'Set-Cookie': auth.sessionCookie(s.token, s.expires, isSecure(req)) }, ok: true };
  });

  a.get('/dashboard', () => {
    expireReservations(db);
    const s = getSettings(db);
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all().map((x) => [x.status, x.n]));
    const today = new Date(Date.now() - 24 * 3600_000).toISOString();
    return {
      orders_open: db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('novo','aguardando_pagamento','confirmado','em_separacao','pronto_retirada','saiu_entrega','revisar')").get().n,
      orders_by_status: counts,
      orders_24h: db.prepare('SELECT COUNT(*) n FROM orders WHERE created_at >= ?').get(today).n,
      paid_24h_cents: db.prepare("SELECT COALESCE(SUM(amount_cents - refunded_cents),0) v FROM payments WHERE status = 'aprovado' AND updated_at >= ?").get(today).v,
      recent_orders: db.prepare('SELECT id, code, status, payment_status, channel, total_cents, total_is_final, customer_json, created_at FROM orders ORDER BY id DESC LIMIT 6').all()
        .map((o) => ({ ...o, customer: JSON.parse(o.customer_json), customer_json: undefined })),
      low_stock: lowStock(db, s.catalog.low_stock_default).slice(0, 12),
      products: db.prepare("SELECT status, COUNT(*) n FROM products GROUP BY status").all(),
      demo_products: db.prepare('SELECT COUNT(*) n FROM products WHERE is_demo = 1').get().n,
      setup: setupChecklist(s),
    };
  });

  function setupChecklist(s) {
    const ch = availableChannels(s, env);
    return [
      { key: 'whatsapp', ok: ch.whatsapp_configured, label: 'Número de WhatsApp da loja', where: 'config' },
      { key: 'address', ok: !!s.store.address, label: 'Endereço da loja (retirada e rodapé)', where: 'config' },
      { key: 'cnpj', ok: !!s.store.cnpj, label: 'CNPJ e dados comerciais', where: 'config' },
      { key: 'delivery', ok: s.delivery.zones.some((z) => z.fee_cents != null), label: 'Taxas de entrega por região (hoje: "a confirmar")', where: 'entrega' },
      { key: 'pages', ok: db.prepare('SELECT COUNT(*) n FROM pages WHERE published = 1').get().n >= 3, label: 'Páginas de entrega, trocas e privacidade publicadas', where: 'paginas' },
      { key: 'demo', ok: !db.prepare('SELECT 1 FROM products WHERE is_demo = 1 LIMIT 1').get(), label: 'Remover produtos de demonstração', where: 'produtos' },
      { key: 'mascot', ok: !db.prepare("SELECT 1 FROM banners WHERE image LIKE '%mascote-provisorio%' AND active = 1").get(), label: 'Substituir a arte provisória do mascote no banner', where: 'banners' },
      { key: 'payments', ok: s.checkout.mode === 'whatsapp' || paymentsReady(s, env), label: 'Credenciais de pagamento (necessário para compra pelo site)', where: 'pagamentos' },
    ];
  }

  // Produtos
  a.get('/products', ({ query }) => ({ products: listAdminProducts(db, query) }));
  a.get('/products/:id', ({ params }) => {
    const p = getAdminProduct(db, Number(params.id));
    if (!p) throw notFound('Produto não encontrado.');
    return { product: p };
  });
  a.post('/products', async ({ req, user }) => ({ product: saveProduct(db, await readJson(req), { userId: user.id }) }));
  a.post('/products/:id/duplicate', ({ params }) => ({ product: duplicateProduct(db, Number(params.id)) }));
  a.post('/products/:id/status', async ({ req, params }) => {
    const { status } = await readJson(req);
    if (!['draft', 'active', 'archived'].includes(status)) throw bad('Status inválido.');
    return { product: setProductStatus(db, Number(params.id), status) };
  });

  // Categorias e marcas
  a.get('/taxonomy', () => ({
    categories: db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status <> \'archived\') n FROM categories c ORDER BY sort, name').all(),
    brands: db.prepare('SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.status <> \'archived\') n FROM brands b ORDER BY name').all(),
  }));
  a.post('/categories', async ({ req }) => {
    const b = await readJson(req);
    const name = str(b.name, 80);
    if (!name) throw bad('Informe o nome.');
    if (b.id) {
      db.prepare('UPDATE categories SET name = ?, sort = COALESCE(?, sort), active = ? WHERE id = ?').run(name, int(b.sort), b.active === false ? 0 : 1, b.id);
    } else {
      const slug = slugify(name);
      if (db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug)) throw bad('Já existe uma categoria com esse nome.');
      db.prepare('INSERT INTO categories(slug, name, sort) VALUES (?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM categories))').run(slug, name);
    }
    return { ok: true };
  });
  a.post('/brands', async ({ req }) => {
    const b = await readJson(req);
    const name = str(b.name, 80);
    if (!name) throw bad('Informe o nome.');
    if (b.id) {
      db.prepare('UPDATE brands SET name = ?, logo = ?, active = ?, show_in_home = ? WHERE id = ?')
        .run(name, str(b.logo, 500), b.active === false ? 0 : 1, b.show_in_home ? 1 : 0, b.id);
    } else {
      const slug = slugify(name);
      if (db.prepare('SELECT 1 FROM brands WHERE slug = ?').get(slug)) throw bad('Já existe uma marca com esse nome.');
      db.prepare('INSERT INTO brands(slug, name, logo, show_in_home) VALUES (?,?,?,?)').run(slug, name, str(b.logo, 500), b.show_in_home ? 1 : 0);
    }
    return { ok: true };
  });

  // Estoque
  a.post('/stock/move', async ({ req, user }) => {
    const b = await readJson(req);
    const variantId = int(b.variant_id, { min: 1 });
    if (!variantId) throw bad('Opção inválida.');
    const reason = str(b.reason, 200);
    const balance = tx(db, () => {
      if (b.type === 'ajuste') {
        const target = int(b.target, { min: 0, max: 1_000_000 });
        if (target == null) throw bad('Informe o saldo contado.');
        return setStock(db, { variantId, target, reason: reason || 'Ajuste de inventário', userId: user.id });
      }
      const qty = int(b.qty, { min: 1, max: 1_000_000 });
      if (!qty) throw bad('Informe a quantidade.');
      if (b.type === 'entrada') {
        const cost = b.unit_cost_cents == null || b.unit_cost_cents === '' ? null : int(b.unit_cost_cents, { min: 0 });
        return moveStock(db, { variantId, type: 'entrada', qty, reason: reason || 'Entrada de mercadoria', unitCostCents: cost, userId: user.id });
      }
      if (b.type === 'saida') {
        if (!reason) throw bad('Informe o motivo da saída (ex.: avaria, vencimento, uso interno).');
        return moveStock(db, { variantId, type: 'saida', qty: -qty, reason, userId: user.id });
      }
      throw bad('Tipo de movimento inválido.');
    });
    return { balance };
  });
  a.get('/stock/movements', ({ query }) => {
    const where = [];
    const args = [];
    if (query.variant_id) { where.push('m.variant_id = ?'); args.push(Number(query.variant_id)); }
    if (query.product_id) { where.push('v.product_id = ?'); args.push(Number(query.product_id)); }
    return {
      movements: db.prepare(`SELECT m.*, v.flavor, v.size, p.name product_name, o.code order_code, u.name user_name
                               FROM stock_movements m JOIN variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
                               LEFT JOIN orders o ON o.id = m.order_id LEFT JOIN users u ON u.id = m.user_id
                               ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 200`).all(...args),
    };
  });
  a.get('/stock/low', () => ({ items: lowStock(db, getSettings(db).catalog.low_stock_default) }));

  // Pedidos
  a.get('/orders', ({ query }) => {
    expireReservations(db);
    const where = [];
    const args = [];
    if (query.status === 'abertos') where.push("status IN ('novo','aguardando_pagamento','confirmado','em_separacao','pronto_retirada','saiu_entrega','revisar')");
    else if (query.status) { where.push('status = ?'); args.push(query.status); }
    if (query.q) { where.push('(code LIKE ? OR customer_json LIKE ?)'); args.push(`%${query.q}%`, `%${query.q}%`); }
    if (query.customer_id) { where.push('customer_id = ?'); args.push(Number(query.customer_id)); }
    const rows = db.prepare(`SELECT id, code, channel, status, payment_status, payment_method, stock_state, reservation_expires_at, fulfillment,
                                    total_cents, total_is_final, customer_json, created_at FROM orders
                              ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`).all(...args);
    return { orders: rows.map((o) => ({ ...o, customer: JSON.parse(o.customer_json), customer_json: undefined })) };
  });
  a.get('/orders/:id', ({ params, req }) => {
    const o = getOrder(db, Number(params.id), { includeInternal: true, baseUrl: baseUrlOf(req), settings: getSettings(db) });
    if (!o) throw notFound('Pedido não encontrado.');
    return { order: o };
  });
  a.post('/orders/:id/status', async ({ req, params, user }) => {
    const b = await readJson(req);
    transitionOrder(db, Number(params.id), b.to, { userId: user.id, note: str(b.note, 300) });
    return { order: getOrder(db, Number(params.id), { includeInternal: true }) };
  });
  a.post('/orders/:id/payment', async ({ req, params, user }) => {
    const b = await readJson(req);
    recordManualPayment(db, Number(params.id), { method: str(b.method, 30), amount_cents: int(b.amount_cents, { min: 1 }), userId: user.id });
    return { order: getOrder(db, Number(params.id), { includeInternal: true }) };
  });
  a.post('/orders/:id/refund', async ({ req, params, user }) => {
    const b = await readJson(req);
    recordRefund(db, Number(params.id), { amount_cents: int(b.amount_cents, { min: 1 }), reason: str(b.reason, 300), userId: user.id });
    return { order: getOrder(db, Number(params.id), { includeInternal: true }) };
  });
  a.post('/orders/:id/notes', async ({ req, params, user }) => {
    const b = await readJson(req);
    db.prepare('UPDATE orders SET admin_notes = ?, updated_at = ? WHERE id = ?').run(str(b.admin_notes, 2000), nowIso(), Number(params.id));
    addEvent(db, Number(params.id), 'nota', 'Observação interna atualizada.', user.id);
    return { ok: true };
  });

  // Clientes (somente vinculados a pedidos)
  a.get('/customers', ({ query }) => {
    const q = query.q ? `%${query.q}%` : '%';
    return {
      customers: db.prepare(`SELECT c.*, COUNT(o.id) orders, MAX(o.created_at) last_order,
                                    SUM(CASE WHEN o.payment_status = 'aprovado' THEN o.total_cents ELSE 0 END) paid_cents
                               FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
                              WHERE c.name LIKE ? OR c.phone LIKE ? GROUP BY c.id ORDER BY last_order DESC LIMIT 200`).all(q, q),
    };
  });

  // Banners, seções e páginas
  a.get('/banners', () => ({ banners: db.prepare('SELECT * FROM banners ORDER BY sort, id').all() }));
  a.post('/banners', async ({ req }) => {
    const b = await readJson(req);
    const vals = [str(b.title, 120), str(b.subtitle, 240), str(b.cta_label, 40), str(b.cta_link, 300), str(b.image, 500), str(b.image_mobile, 500),
      str(b.image_note, 300), ['left', 'right', 'cover'].includes(b.image_position) ? b.image_position : 'right', b.active ? 1 : 0, int(b.sort, { def: 0 }),
      str(b.starts_at, 30), str(b.ends_at, 30)];
    if (b.cta_link && !/^\/(?!\/)|^https:\/\//.test(b.cta_link)) throw bad('Link do botão deve começar com / ou https://');
    if (b.id) db.prepare(`UPDATE banners SET title=?, subtitle=?, cta_label=?, cta_link=?, image=?, image_mobile=?, image_note=?, image_position=?, active=?, sort=?, starts_at=?, ends_at=? WHERE id = ?`).run(...vals, b.id);
    else db.prepare(`INSERT INTO banners(title, subtitle, cta_label, cta_link, image, image_mobile, image_note, image_position, active, sort, starts_at, ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals);
    return { ok: true };
  });
  a.post('/banners/:id/delete', ({ params }) => {
    db.prepare('DELETE FROM banners WHERE id = ?').run(Number(params.id));
    return { ok: true };
  });
  a.get('/sections', () => ({ sections: db.prepare('SELECT * FROM sections ORDER BY sort, id').all() }));
  a.post('/sections', async ({ req }) => {
    const { sections } = await readJson(req);
    tx(db, () => {
      for (const s of sections || []) {
        db.prepare('UPDATE sections SET title = ?, active = ?, sort = ?, max_items = ? WHERE id = ?')
          .run(str(s.title, 60) || 'Seção', s.active ? 1 : 0, int(s.sort, { def: 0 }), int(s.max_items, { min: 1, max: 24, def: 8 }), s.id);
      }
    });
    return { ok: true };
  });
  a.get('/pages', () => ({ pages: db.prepare('SELECT * FROM pages ORDER BY id').all() }));
  a.post('/pages', async ({ req }) => {
    const b = await readJson(req);
    if (b.published && /\[Texto a ser preenchido/.test(b.body || '')) throw bad('Substitua o texto modelo antes de publicar.');
    db.prepare('UPDATE pages SET title = ?, body = ?, published = ?, updated_at = ? WHERE id = ?')
      .run(str(b.title, 120), String(b.body || '').slice(0, 20000), b.published ? 1 : 0, nowIso(), b.id);
    return { ok: true };
  });

  // Configurações
  a.get('/settings', ({ req }) => ({
    settings: getSettings(db),
    integrations: {
      payments: {
        mercadopago: { configured: !!(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET), token: !!env.MP_ACCESS_TOKEN, webhook_secret: !!env.MP_WEBHOOK_SECRET },
        demo_allowed: demoPaymentsAllowed(env),
      },
      gtin: providerStatus(getSettings(db), env),
      public_url: baseUrlOf(req),
    },
  }));
  a.post('/settings', async ({ req }) => {
    const b = await readJson(req);
    for (const [k, v] of Object.entries(b)) {
      if (!(k in DEFAULT_SETTINGS)) throw bad(`Configuração desconhecida: ${k}`);
      validateSetting(k, v);
      saveSetting(db, k, v);
    }
    return { settings: getSettings(db) };
  });

  function validateSetting(k, v) {
    if (k === 'checkout' && !['whatsapp', 'site', 'both'].includes(v.mode)) throw bad('Modo de venda inválido.');
    if (k === 'payments') {
      if (!['none', 'mercadopago', 'demo'].includes(v.provider)) throw bad('Provedor de pagamento inválido.');
      if (v.provider === 'demo' && !demoPaymentsAllowed(env)) throw bad('Pagamento de demonstração não é permitido em produção.');
      if (v.pix_discount_pct < 0 || v.pix_discount_pct > 50) throw bad('Desconto no Pix deve estar entre 0 e 50%.');
    }
    if (k === 'delivery') {
      for (const z of v.zones || []) {
        if (!z.id || !z.name) throw bad('Cada região precisa de nome.');
        for (const range of z.cep_ranges || []) {
          if (!normalizeCep(range[0]) || !normalizeCep(range[1]) || Number(range[0]) > Number(range[1])) throw bad(`Faixa de CEP inválida em "${z.name}".`);
        }
        if (z.sla?.type === 'same_day' && !/^\d{2}:\d{2}$/.test(z.sla.cutoff || '')) throw bad(`Informe o horário limite (HH:MM) em "${z.name}".`);
      }
      for (const h of v.holidays || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(h)) throw bad(`Feriado inválido: ${h}`);
    }
  }

  // Upload de imagens (já redimensionadas no navegador)
  a.post('/uploads', async ({ req }) => {
    const b = await readJson(req, 8_000_000);
    const m = /^data:(image\/(webp|jpeg|png));base64,(.+)$/.exec(String(b.data_url || ''));
    if (!m) throw bad('Envie uma imagem JPG, PNG ou WebP.');
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 4_000_000) throw bad('Imagem muito grande (máx. 4 MB).');
    const magic = { webp: buf.slice(8, 12).toString() === 'WEBP', jpeg: buf[0] === 0xff && buf[1] === 0xd8, png: buf.slice(1, 4).toString() === 'PNG' };
    if (!magic[m[2]]) throw bad('Arquivo de imagem inválido.');
    const ym = new Date().toISOString().slice(0, 7);
    const dir = path.join(uploadsDir, ym);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.randomBytes(10).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return { url: `/uploads/${ym}/${name}` };
  });

  // Código de barras
  a.get('/gtin/:code', async ({ params, query }) => {
    const raw = String(params.code).replace(/\D/g, '');
    const g = validateGtin(raw);
    const internal = raw ? findByCode(db, raw) : null;
    if (internal) {
      return { validation: g, internal: { variant_id: internal.id, product_id: internal.product_id, product_name: internal.product_name, flavor: internal.flavor, size: internal.size, stock: internal.stock, status: internal.product_status, image: JSON.parse(internal.images_json || '[]')[0] || null } };
    }
    if (!g.valid) return { validation: g, internal: null, external: [] };
    const s = getSettings(db);
    const external = query.externo === '0' ? [] : await lookupExternal(db, g.code, { settings: s, env, fetchImpl });
    return { validation: g, internal: null, external };
  });

  // CSV
  a.get('/export.csv', () => ({ __raw: exportCsv(db), __type: 'text/csv; charset=utf-8', __filename: `nutauro-produtos-${new Date().toISOString().slice(0, 10)}.csv` }));
  a.post('/import', async ({ req, user }) => {
    const b = await readJson(req, 5_000_000);
    return importCsv(db, String(b.csv || ''), { apply: !!b.apply, userId: user.id });
  });

  // Backup do banco (cópia consistente)
  a.get('/backup', () => {
    const file = path.join(dataDir, `backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(file);
    fs.unlinkSync(file);
    return { __raw: buf, __type: 'application/octet-stream', __filename: `nutauro-backup-${new Date().toISOString().slice(0, 10)}.db` };
  });

  a.post('/demo/remove', () => removeDemoData(db));

  // ---------------------------------------------------------------- HTML com metadados (links compartilháveis)

  const indexHtml = () => fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderShell(req, pathname) {
    const s = getSettings(db);
    const base = baseUrlOf(req);
    let title = `${s.store.name} — ${s.store.tagline}`;
    let description = `Catálogo ${s.store.name}: whey protein, creatina, pré-treino, vitaminas e acessórios. ${s.store.city}.`;
    let image = `${base}/assets/brand/og-nutauro.jpg`;
    let jsonLd = null;
    let status = 200;
    const m = /^\/produto\/([^/]+)$/.exec(pathname);
    const c = /^\/categoria\/([^/]+)$/.exec(pathname);
    if (m) {
      const all = loadProducts(db).map((p) => toPublic(p, reservedMap(db)));
      const p = all.find((x) => x.slug === decodeURIComponent(m[1]));
      if (p) {
        title = `${p.name}${p.brand ? ` — ${p.brand.name}` : ''} | ${s.store.name}`;
        description = [p.presentation, p.price_from_cents != null ? `a partir de ${formatBRL(p.price_from_cents)}` : '', p.in_stock ? 'Disponível' : 'Esgotado'].filter(Boolean).join(' · ');
        if (p.images[0]) image = p.images[0].startsWith('http') ? p.images[0] : base + p.images[0];
        jsonLd = {
          '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: [image],
          brand: p.brand ? { '@type': 'Brand', name: p.brand.name } : undefined, sku: p.variants[0]?.sku || undefined,
          offers: {
            '@type': 'AggregateOffer', priceCurrency: 'BRL', lowPrice: (Math.min(...p.variants.map((v) => v.unit_cents)) / 100).toFixed(2),
            highPrice: (Math.max(...p.variants.map((v) => v.unit_cents)) / 100).toFixed(2),
            availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          },
        };
      } else status = 404;
    } else if (c) {
      const cat = db.prepare('SELECT name FROM categories WHERE slug = ? AND active = 1').get(decodeURIComponent(c[1]));
      if (cat) {
        title = `${cat.name} | ${s.store.name}`;
        description = `${cat.name} no catálogo ${s.store.name}. Escolha sabores e tamanhos e finalize seu pedido.`;
      } else status = 404;
    }
    const meta = [
      `<title>${escHtml(title)}</title>`,
      `<meta name="description" content="${escHtml(description)}">`,
      `<link rel="canonical" href="${escHtml(base + pathname)}">`,
      `<meta property="og:type" content="${m ? 'product' : 'website'}">`,
      `<meta property="og:site_name" content="${escHtml(s.store.name)}">`,
      `<meta property="og:title" content="${escHtml(title)}">`,
      `<meta property="og:description" content="${escHtml(description)}">`,
      `<meta property="og:image" content="${escHtml(image)}">`,
      `<meta property="og:url" content="${escHtml(base + pathname)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '',
    ].join('\n    ');
    return { status, html: indexHtml().replace(/<title>[\s\S]*?<\/title>/, meta) };
  }

  function serveStatic(req, res, pathname) {
    let file;
    if (pathname.startsWith('/uploads/')) file = path.join(uploadsDir, pathname.slice('/uploads/'.length));
    else file = path.join(PUBLIC, pathname);
    const base = pathname.startsWith('/uploads/') ? uploadsDir : PUBLIC;
    if (!file.startsWith(base + path.sep)) return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return true;
    }
    const longCache = pathname.startsWith('/uploads/') || pathname.startsWith('/fonts/') || pathname.startsWith('/vendor/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': longCache ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      ETag: etag,
      ...SECURITY_HEADERS,
    });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  // Expiração periódica das reservas
  const timer = setInterval(() => { try { expireReservations(db); } catch (e) { log('expire error', e.message); } }, 60_000);
  timer.unref();

  async function handler(req, res) {
    const url = new URL(req.url, 'http://local');
    const pathname = decodeURIComponent(url.pathname);
    const query = Object.fromEntries(url.searchParams);
    try {
      if (pathname.startsWith('/api/')) {
        let match;
        let user = null;
        if (pathname.startsWith('/api/admin/')) {
          match = a.match(req.method, pathname.slice('/api/admin'.length));
          if (!match) throw notFound('Rota não encontrada.');
          const isPublic = ['/login', '/logout'].includes(pathname.slice('/api/admin'.length));
          if (!isPublic) user = auth.requireAdmin(db, req);
          else if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'nutauro-admin') throw new HttpError(403, 'Requisição bloqueada.');
        } else {
          match = r.match(req.method, pathname);
          if (!match) throw notFound('Rota não encontrada.');
        }
        const out = await match.handler({ req, res, params: match.params, query, user });
        if (out && out.__raw != null) {
          return send(res, 200, out.__raw, {
            'Content-Type': out.__type, ...(out.__filename ? { 'Content-Disposition': `attachment; filename="${out.__filename}"` } : {}),
          });
        }
        const status = out?.__status || 200;
        const headers = out?.__headers || {};
        if (out) { delete out.__status; delete out.__headers; }
        return send(res, status, out ?? { ok: true }, headers);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw notFound();
      if (pathname === '/robots.txt') {
        return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /pedido/\nDisallow: /carrinho\nDisallow: /finalizar\nSitemap: ${baseUrlOf(req)}/sitemap.xml\n`);
      }
      if (pathname === '/sitemap.xml') {
        const base = baseUrlOf(req);
        const urls = ['/', '/produtos',
          ...db.prepare('SELECT slug FROM categories WHERE active = 1').all().map((x) => `/categoria/${x.slug}`),
          ...db.prepare("SELECT slug FROM products WHERE status = 'active'").all().map((x) => `/produto/${x.slug}`)];
        return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${escHtml(base + u)}</loc></url>`).join('')}</urlset>`, { 'Content-Type': 'application/xml' });
      }
      if (pathname !== '/' && !pathname.endsWith('/') && serveStatic(req, res, pathname)) return;
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'admin', 'index.html'), 'utf8'), { 'Content-Type': MIME['.html'], ...SECURITY_HEADERS });
      }
      if (/\.[a-z0-9]{2,5}$/i.test(pathname)) throw notFound();
      const { status, html } = renderShell(req, pathname);
      return send(res, status, html, { 'Content-Type': MIME['.html'], ...SECURITY_HEADERS });
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, details: e.details });
      log('Erro interno:', e);
      return send(res, 500, { error: 'Erro interno. Tente novamente.' });
    }
  }

  return { handler, close: () => clearInterval(timer) };
}
