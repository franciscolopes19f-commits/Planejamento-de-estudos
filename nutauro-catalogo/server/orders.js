import crypto from 'node:crypto';
import { tx } from './db.js';
import { HttpError, bad, nowIso, str } from './http.js';
import { reservedMap, commitOrderStock, releaseOrderStock } from './stock.js';
import { cartTotals, unitPrice, variantLabel } from '../public/shared/pricing.js';
import { quoteShipping, normalizeCep } from '../public/shared/shipping.js';
import { normalizePhoneBR, buildOrderMessage, waLink } from '../public/shared/whatsapp.js';
import { ADMIN_TRANSITIONS, FINAL_STATUSES } from '../public/shared/status.js';

const MAX_LINES = 30;
const MAX_QTY = 50;

export function paymentsReady(settings, env) {
  const p = settings.payments.provider;
  if (p === 'mercadopago') return !!(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET);
  if (p === 'demo') return demoPaymentsAllowed(env);
  return false;
}

export function demoPaymentsAllowed(env) {
  return env.NODE_ENV !== 'production' || env.ALLOW_DEMO_PAYMENTS === '1';
}

/** Canais efetivamente disponíveis para o cliente, considerando a configuração e as credenciais. */
export function availableChannels(settings, env) {
  const mode = settings.checkout.mode;
  const whatsappOk = !!normalizePhoneBR(settings.store.whatsapp);
  return {
    whatsapp: (mode === 'whatsapp' || mode === 'both') && whatsappOk,
    site: (mode === 'site' || mode === 'both') && paymentsReady(settings, env),
    whatsapp_configured: whatsappOk,
    payment_demo: settings.payments.provider === 'demo' && paymentsReady(settings, env),
  };
}

function normItems(raw) {
  if (!Array.isArray(raw) || !raw.length) throw bad('Carrinho vazio.');
  const merged = new Map();
  for (const it of raw) {
    const id = Number(it?.variant_id);
    const q = Number(it?.qty);
    if (!Number.isInteger(id) || id <= 0) throw bad('Item inválido no carrinho.');
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) throw bad(`Quantidade inválida (1 a ${MAX_QTY}).`);
    merged.set(id, (merged.get(id) || 0) + q);
  }
  if (merged.size > MAX_LINES) throw bad(`Máximo de ${MAX_LINES} itens diferentes por pedido.`);
  for (const q of merged.values()) if (q > MAX_QTY) throw bad(`Quantidade máxima por item: ${MAX_QTY}.`);
  return merged;
}

/**
 * Reavalia o carrinho com preços e estoque atuais do servidor.
 * Retorna linhas válidas e problemas encontrados (sem lançar erro).
 */
export function priceCart(db, rawItems, { now = new Date(), excludeOrderId = 0 } = {}) {
  const merged = normItems(rawItems);
  const reserved = reservedMap(db, { now: now.toISOString(), excludeOrderId });
  const lines = [];
  const problems = [];
  for (const [variantId, qty] of merged) {
    const v = db.prepare(`
      SELECT v.*, p.name AS product_name, p.slug AS product_slug, p.status AS product_status, p.images_json, b.name AS brand
        FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN brands b ON b.id = p.brand_id
       WHERE v.id = ?`).get(variantId);
    if (!v || !v.active || v.product_status !== 'active' || v.price_cents <= 0) {
      problems.push({ variant_id: variantId, code: 'unavailable', message: 'Produto indisponível no catálogo.' });
      continue;
    }
    const available = Math.max(0, v.stock - (reserved.get(v.id) || 0));
    if (available < qty) {
      problems.push({
        variant_id: variantId, code: available ? 'insufficient' : 'out_of_stock', available,
        message: available ? `Restam ${available} unidade(s) disponível(is).` : 'Esgotado.',
      });
    }
    let image = null;
    try { image = JSON.parse(v.images_json || '[]')[0] || null; } catch {}
    lines.push({
      variant_id: v.id, product_id: v.product_id, product_slug: v.product_slug,
      product_name: v.product_name, brand: v.brand, variant_label: variantLabel(v), sku: v.sku,
      flavor: v.flavor, size: v.size, image,
      qty, available, regular_cents: v.price_cents, unit_cents: unitPrice(v, now),
      unit_cost_cents: v.cost_cents, total_cents: unitPrice(v, now) * qty,
    });
  }
  return { lines, problems };
}

function validateCustomer(c, { requireEmail = false } = {}) {
  const name = str(c?.name, 80);
  if (!name || name.length < 2) throw bad('Informe seu nome.');
  const phone = normalizePhoneBR(c?.phone);
  if (!phone) throw bad('Informe um WhatsApp/telefone válido com DDD.');
  const email = str(c?.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('E-mail inválido.');
  if (requireEmail && !email) throw bad('Informe seu e-mail para receber a confirmação do pagamento.');
  return { name, phone, email };
}

function validateAddress(a) {
  const cep = normalizeCep(a?.cep);
  if (!cep) throw bad('Informe um CEP válido.');
  const out = {
    cep,
    street: str(a.street, 120), number: str(a.number, 20), complement: str(a.complement, 80),
    district: str(a.district, 80), city: str(a.city, 80), uf: str(a.uf, 2)?.toUpperCase() || null,
    reference: str(a.reference, 160),
  };
  for (const [k, label] of [['street', 'rua'], ['number', 'número'], ['district', 'bairro'], ['city', 'cidade'], ['uf', 'UF']]) {
    if (!out[k]) throw bad(`Endereço incompleto: informe ${label}.`);
  }
  return out;
}

function upsertCustomer(db, c, now) {
  const ex = db.prepare('SELECT id FROM customers WHERE phone = ?').get(c.phone);
  if (ex) {
    db.prepare('UPDATE customers SET name = ?, email = COALESCE(?, email), updated_at = ? WHERE id = ?').run(c.name, c.email, now, ex.id);
    return ex.id;
  }
  return Number(db.prepare('INSERT INTO customers(name, phone, email, created_at, updated_at) VALUES (?,?,?,?,?)').run(c.name, c.phone, c.email, now, now).lastInsertRowid);
}

const fmtBR = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function addEvent(db, orderId, type, message, userId = null) {
  db.prepare('INSERT INTO order_events(order_id, type, message, user_id, created_at) VALUES (?,?,?,?,?)').run(orderId, type, message, userId, nowIso());
}

/**
 * Cria pedido com reserva temporária de estoque. Toda a validação de preço, estoque e frete é feita aqui.
 * @param {object} ctx { db, settings, env, now, baseUrl }
 */
export function createOrder(ctx, input) {
  const { db, settings, env } = ctx;
  const now = ctx.now || new Date();
  const channel = input?.channel;
  const ch = availableChannels(settings, env);
  if (channel !== 'whatsapp' && channel !== 'site') throw bad('Canal inválido.');
  if (!ch[channel]) {
    throw bad(channel === 'site' ? 'A compra pelo site não está disponível no momento.' : 'O pedido pelo WhatsApp não está disponível no momento.');
  }
  const customer = validateCustomer(input.customer);
  const fulfillment = input.fulfillment === 'pickup' ? 'pickup' : input.fulfillment === 'delivery' ? 'delivery' : null;
  if (!fulfillment) throw bad('Escolha retirada ou entrega.');
  if (fulfillment === 'pickup' && !settings.pickup.enabled) throw bad('Retirada na loja indisponível.');
  const address = fulfillment === 'delivery' ? validateAddress(input.address) : null;

  let paymentMethod = str(input.payment_method, 30);
  if (channel === 'site') {
    if (!['pix', 'card'].includes(paymentMethod)) throw bad('Escolha Pix ou cartão.');
  } else if (paymentMethod && !settings.payments.whatsapp_methods.includes(paymentMethod)) {
    paymentMethod = null;
  }
  const notes = str(input.notes, 500);

  return tx(db, () => {
    const { lines, problems } = priceCart(db, input.items, { now });
    if (problems.length) throw new HttpError(409, 'Alguns itens mudaram de disponibilidade. Revise o carrinho.', { problems });
    const itemsCents = lines.reduce((s, l) => s + l.total_cents, 0);
    if (settings.checkout.min_order_cents > 0 && itemsCents < settings.checkout.min_order_cents) {
      throw bad('Valor mínimo do pedido não atingido.');
    }

    let shipping;
    if (fulfillment === 'pickup') {
      shipping = { status: 'pickup', fee_cents: 0, label: 'Retirada na loja', estimate_text: settings.pickup.estimate_text || '' };
    } else {
      const q = quoteShipping({ cep: address.cep, delivery: settings.delivery, pickup: null, now, itemsCents, allInStock: true });
      const opt = q.options.find((o) => o.kind === 'delivery');
      if (!opt) throw bad(q.message || q.error || 'Não há entrega configurada para este CEP.');
      shipping = { status: opt.status, fee_cents: opt.fee_cents, label: opt.label, zone_id: opt.zone_id, estimate_text: opt.estimate.text, same_day_possible: !!opt.estimate.same_day };
      if (channel === 'site' && shipping.status === 'to_confirm') {
        throw bad('Para este CEP o frete precisa ser combinado. Finalize pelo WhatsApp ou escolha retirada.');
      }
    }

    const totals = cartTotals({ lines, shipping, paymentMethod, payments: settings.payments });
    const nowS = now.toISOString();
    const minutes = channel === 'site' ? settings.checkout.site_reservation_minutes : settings.checkout.whatsapp_reservation_minutes;
    const expires = new Date(now.getTime() + Math.max(5, Number(minutes) || 60) * 60_000).toISOString();
    const customerId = upsertCustomer(db, customer, nowS);
    const token = crypto.randomBytes(16).toString('base64url');
    const status = channel === 'site' ? 'aguardando_pagamento' : 'novo';
    const r = db.prepare(`
      INSERT INTO orders(public_token, channel, status, payment_status, payment_method, stock_state, reservation_expires_at,
        fulfillment, customer_id, customer_json, address_json, shipping_json,
        subtotal_cents, promo_discount_cents, pix_discount_cents, shipping_cents, total_cents, total_is_final, notes, created_at, updated_at)
      VALUES (?,?,?,?,?,'reserved',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      token, channel, status, channel === 'site' ? 'pendente' : 'nao_iniciado', paymentMethod, expires,
      fulfillment, customerId, JSON.stringify(customer), address ? JSON.stringify(address) : null, JSON.stringify(shipping),
      totals.subtotal_cents, totals.promo_discount_cents, totals.pix_discount_cents, totals.shipping_cents, totals.total_cents,
      totals.total_is_final ? 1 : 0, notes, nowS, nowS,
    );
    const orderId = Number(r.lastInsertRowid);
    const code = `NT-${String(orderId).padStart(6, '0')}`;
    db.prepare('UPDATE orders SET code = ? WHERE id = ?').run(code, orderId);
    const ins = db.prepare(`INSERT INTO order_items(order_id, variant_id, product_id, product_name, brand, variant_label, sku, qty, regular_cents, unit_cents, unit_cost_cents, total_cents)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lines) ins.run(orderId, l.variant_id, l.product_id, l.product_name, l.brand, l.variant_label, l.sku, l.qty, l.regular_cents, l.unit_cents, l.unit_cost_cents, l.total_cents);
    addEvent(db, orderId, 'criado', channel === 'whatsapp'
      ? `Pedido criado pelo catálogo (WhatsApp). Itens reservados até ${fmtBR(expires)}.`
      : `Pedido criado no site. Itens reservados até ${fmtBR(expires)} aguardando pagamento.`);
    return getOrder(db, orderId, { baseUrl: ctx.baseUrl, settings });
  });
}

export function getOrder(db, idOrCode, { baseUrl = '', settings = null, includeInternal = false } = {}) {
  const o = typeof idOrCode === 'number'
    ? db.prepare('SELECT * FROM orders WHERE id = ?').get(idOrCode)
    : db.prepare('SELECT * FROM orders WHERE code = ?').get(idOrCode);
  if (!o) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  const shipping = JSON.parse(o.shipping_json || 'null');
  const out = {
    id: o.id,
    code: o.code,
    channel: o.channel,
    status: o.status,
    payment_status: o.payment_status,
    payment_method: o.payment_method,
    stock_state: o.stock_state,
    reservation_expires_at: o.stock_state === 'reserved' ? o.reservation_expires_at : null,
    fulfillment: o.fulfillment,
    customer: JSON.parse(o.customer_json),
    address: JSON.parse(o.address_json || 'null'),
    shipping,
    notes: o.notes,
    items: items.map((i) => ({
      variant_id: i.variant_id, product_id: i.product_id, product_name: i.product_name, brand: i.brand,
      variant_label: i.variant_label, sku: i.sku, qty: i.qty, regular_cents: i.regular_cents,
      unit_cents: i.unit_cents, total_cents: i.total_cents,
      ...(includeInternal ? { unit_cost_cents: i.unit_cost_cents } : {}),
    })),
    totals: {
      subtotal_cents: o.subtotal_cents,
      promo_discount_cents: o.promo_discount_cents,
      pix_discount_cents: o.pix_discount_cents,
      shipping_status: shipping?.status,
      shipping_cents: o.shipping_cents,
      total_cents: o.total_cents,
      total_is_final: !!o.total_is_final,
    },
    created_at: o.created_at,
    updated_at: o.updated_at,
    status_url: `${baseUrl}/pedido/${o.code}?t=${o.public_token}`,
  };
  if (includeInternal) {
    out.public_token = o.public_token;
    out.admin_notes = o.admin_notes;
    out.customer_id = o.customer_id;
    out.events = db.prepare('SELECT type, message, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(o.id);
    out.payments = db.prepare('SELECT id, provider, provider_ref, method, status, amount_cents, refunded_cents, created_at, updated_at FROM payments WHERE order_id = ? ORDER BY id').all(o.id);
    const cost = items.reduce((s, i) => s + (i.unit_cost_cents ?? 0) * i.qty, 0);
    const missingCost = items.some((i) => i.unit_cost_cents == null);
    out.margin = { cost_cents: cost, missing_cost: missingCost, gross_cents: o.subtotal_cents - o.promo_discount_cents - o.pix_discount_cents - cost };
  }
  if (settings && o.channel === 'whatsapp') {
    out.whatsapp_message = buildOrderMessage(out, { storeName: settings.store.name });
    out.whatsapp_url = waLink(settings.store.whatsapp, out.whatsapp_message);
  }
  return out;
}

export function verifyOrderToken(db, code, token) {
  const o = db.prepare('SELECT public_token FROM orders WHERE code = ?').get(code);
  if (!o || !token) return false;
  const a = Buffer.from(o.public_token);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Expira reservas vencidas de pedidos que não foram confirmados. */
export function expireReservations(db, now = new Date()) {
  const nowS = now.toISOString();
  return tx(db, () => {
    const rows = db.prepare(`SELECT id FROM orders WHERE stock_state = 'reserved' AND reservation_expires_at <= ?
                               AND status IN ('novo','aguardando_pagamento')`).all(nowS);
    for (const r of rows) {
      db.prepare("UPDATE orders SET status = 'expirado', stock_state = 'released', reservation_expires_at = NULL, updated_at = ? WHERE id = ?").run(nowS, r.id);
      addEvent(db, r.id, 'expirado', 'Reserva expirou sem confirmação. Itens liberados.');
    }
    return rows.length;
  });
}

/** Mudança de status feita no painel. */
export function transitionOrder(db, orderId, to, { userId = null, note = null } = {}) {
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!o) throw new HttpError(404, 'Pedido não encontrado.');
    const allowed = ADMIN_TRANSITIONS[o.status] || [];
    if (!allowed.includes(to)) throw bad(`Não é possível mudar de "${o.status}" para "${to}".`);
    if (to === 'confirmado') commitOrderStock(db, orderId, { userId });
    if (to === 'cancelado') releaseOrderStock(db, orderId, { userId, reason: `Pedido ${o.code} cancelado` });
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(to, nowIso(), orderId);
    addEvent(db, orderId, `status:${to}`, note, userId);
    if (to === 'cancelado' && o.payment_status === 'aprovado') {
      addEvent(db, orderId, 'alerta', 'Pedido cancelado com pagamento recebido: registre o estorno quando for devolvido.', userId);
    }
    return true;
  });
}

/** Recebimento registrado manualmente (Pix direto na conta, dinheiro, maquininha). */
export function recordManualPayment(db, orderId, { method, amount_cents, userId = null }) {
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!o) throw new HttpError(404, 'Pedido não encontrado.');
    if (!Number.isInteger(amount_cents) || amount_cents <= 0) throw bad('Valor inválido.');
    if (o.payment_status === 'aprovado') throw bad('Este pedido já tem pagamento registrado.');
    const ref = `manual-${orderId}-${Date.now()}`;
    db.prepare('INSERT INTO payments(order_id, provider, provider_ref, method, status, amount_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(orderId, 'manual', ref, method || null, 'aprovado', amount_cents, nowIso(), nowIso());
    db.prepare("UPDATE orders SET payment_status = 'aprovado', payment_method = COALESCE(?, payment_method), updated_at = ? WHERE id = ?").run(method || null, nowIso(), orderId);
    addEvent(db, orderId, 'pagamento', `Recebimento registrado manualmente (${method || 'não informado'}).`, userId);
    return true;
  });
}

export function recordRefund(db, orderId, { amount_cents, userId = null, reason = null }) {
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!o) throw new HttpError(404, 'Pedido não encontrado.');
    if (o.payment_status !== 'aprovado') throw bad('Não há pagamento recebido para estornar.');
    const p = db.prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'aprovado' ORDER BY id DESC").get(orderId);
    if (p) db.prepare("UPDATE payments SET status = 'estornado', refunded_cents = ?, updated_at = ? WHERE id = ?").run(amount_cents ?? p.amount_cents, nowIso(), p.id);
    db.prepare("UPDATE orders SET payment_status = 'estornado', updated_at = ? WHERE id = ?").run(nowIso(), orderId);
    addEvent(db, orderId, 'estorno', reason || 'Estorno registrado.', userId);
    return true;
  });
}

const PROVIDER_STATUS = {
  approved: 'aprovado', authorized: 'pendente', pending: 'pendente', in_process: 'pendente', in_mediation: 'pendente',
  rejected: 'recusado', cancelled: 'recusado', refunded: 'estornado', charged_back: 'estornado',
};

/**
 * Aplica uma atualização de pagamento JÁ VERIFICADA junto ao provedor.
 * Idempotente por (provider, eventKey) e também pelo estado do pedido.
 * @returns {{ result: string }}
 */
export function applyPaymentUpdate(db, { provider, eventKey, providerRef, orderCode, providerStatus, amountCents, method = null, raw = null }) {
  method = method ?? null;
  return tx(db, () => {
    const ins = db.prepare('INSERT OR IGNORE INTO payment_events(provider, event_key, payload, created_at) VALUES (?,?,?,?)')
      .run(provider, eventKey, JSON.stringify(raw ?? null), nowIso());
    if (ins.changes === 0) return { result: 'duplicate' };
    const setResult = (result) => {
      db.prepare('UPDATE payment_events SET result = ? WHERE provider = ? AND event_key = ?').run(result, provider, eventKey);
      return { result };
    };
    const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(orderCode);
    if (!o) return setResult('order_not_found');
    const status = PROVIDER_STATUS[providerStatus] || 'pendente';
    const now = nowIso();
    const existing = db.prepare('SELECT id FROM payments WHERE provider = ? AND provider_ref = ?').get(provider, providerRef);
    if (existing) {
      db.prepare('UPDATE payments SET status = ?, amount_cents = ?, method = COALESCE(?, method), raw_json = ?, updated_at = ? WHERE id = ?')
        .run(status, amountCents, method, JSON.stringify(raw ?? null), now, existing.id);
    } else {
      db.prepare('INSERT INTO payments(order_id, provider, provider_ref, method, status, amount_cents, raw_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(o.id, provider, providerRef, method, status, amountCents, JSON.stringify(raw ?? null), now, now);
    }

    if (status === 'aprovado') {
      if (o.payment_status === 'aprovado') return setResult('already_paid');
      db.prepare("UPDATE orders SET payment_status = 'aprovado', updated_at = ? WHERE id = ?").run(now, o.id);
      if (amountCents < o.total_cents) {
        db.prepare("UPDATE orders SET status = 'revisar' WHERE id = ?").run(o.id);
        addEvent(db, o.id, 'alerta', `Valor pago (R$ ${(amountCents / 100).toFixed(2)}) menor que o total do pedido (R$ ${(o.total_cents / 100).toFixed(2)}). Revisar.`);
        return setResult('amount_mismatch');
      }
      if (FINAL_STATUSES.includes(o.status)) {
        addEvent(db, o.id, 'alerta', `Pagamento aprovado para pedido ${o.status}. Avaliar estorno.`);
        return setResult('paid_on_final_order');
      }
      try {
        commitOrderStock(db, o.id);
        if (['novo', 'aguardando_pagamento', 'expirado', 'revisar'].includes(o.status)) {
          db.prepare("UPDATE orders SET status = 'confirmado' WHERE id = ?").run(o.id);
        }
        addEvent(db, o.id, 'pagamento', `Pagamento aprovado (${provider}). Venda confirmada e estoque baixado.`);
        return setResult('paid');
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        db.prepare("UPDATE orders SET status = 'revisar' WHERE id = ?").run(o.id);
        addEvent(db, o.id, 'alerta', 'Pagamento aprovado, mas sem estoque suficiente para confirmar. Contatar cliente ou estornar.');
        return setResult('paid_without_stock');
      }
    }
    if (status === 'estornado') {
      db.prepare("UPDATE orders SET payment_status = 'estornado', updated_at = ? WHERE id = ?").run(now, o.id);
      if (!FINAL_STATUSES.includes(o.status) && !['saiu_entrega'].includes(o.status)) {
        releaseOrderStock(db, o.id, { reason: `Estorno do pedido ${o.code}` });
        db.prepare("UPDATE orders SET status = 'cancelado' WHERE id = ?").run(o.id);
      }
      addEvent(db, o.id, 'estorno', `Pagamento estornado pelo provedor (${provider}).`);
      return setResult('refunded');
    }
    if (status === 'recusado' && o.payment_status !== 'aprovado') {
      db.prepare("UPDATE orders SET payment_status = 'recusado', updated_at = ? WHERE id = ?").run(now, o.id);
      addEvent(db, o.id, 'pagamento', 'Pagamento recusado/cancelado. O cliente pode tentar novamente enquanto a reserva valer.');
      return setResult('rejected');
    }
    if (o.payment_status !== 'aprovado') db.prepare("UPDATE orders SET payment_status = 'pendente', updated_at = ? WHERE id = ?").run(now, o.id);
    return setResult('pending');
  });
}
