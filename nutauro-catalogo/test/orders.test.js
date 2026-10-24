// Pedidos, reservas, baixa de estoque, pagamentos idempotentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startApp, variantBySku, customer, addressCaxias } from './helpers.js';
import { expireReservations, applyPaymentUpdate } from '../server/orders.js';
import { verifyMercadoPagoSignature } from '../server/payments.js';

const WA = { store: { whatsapp: '21999990000' } };

test('Pedido WhatsApp: preço vem do servidor, estoque é reservado e não baixado; excesso é bloqueado', async () => {
  const t = await startApp();
  try {
    t.configure(WA);
    const choc = variantBySku(t.db, 'DEMO-WHEY-1'); // estoque 8, promo 119,90
    const r = await t.req('POST', '/api/orders', {
      channel: 'whatsapp', items: [{ variant_id: choc.id, qty: 3, unit_cents: 1 }], customer, fulfillment: 'pickup', payment_method: 'pix',
    });
    assert.equal(r.status, 200, r.text);
    const o = r.body.order;
    assert.equal(o.items[0].unit_cents, 11990); // ignora preço enviado pelo navegador
    assert.equal(o.status, 'novo');
    assert.equal(o.stock_state, 'reserved');
    assert.match(o.whatsapp_url, /^https:\/\/wa\.me\/5521999990000/);
    assert.equal(variantBySku(t.db, 'DEMO-WHEY-1').stock, 8, 'clicar no WhatsApp não baixa estoque');
    // disponível público caiu para 5
    const p = await t.req('GET', '/api/products/whey-protein-concentrado-pote-900-g');
    assert.equal(p.body.product.variants.find((v) => v.id === choc.id).available, 5);
    // tentar comprar 6 → 409
    const r2 = await t.req('POST', '/api/orders', { channel: 'whatsapp', items: [{ variant_id: choc.id, qty: 6 }], customer, fulfillment: 'pickup' });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.details.problems[0].available, 5);
    // esgotado (morango, estoque 0)
    const out = variantBySku(t.db, 'DEMO-WHEY-3');
    const r3 = await t.req('POST', '/api/orders', { channel: 'whatsapp', items: [{ variant_id: out.id, qty: 1 }], customer, fulfillment: 'pickup' });
    assert.equal(r3.status, 409);
    // custo nunca aparece na API pública
    assert.ok(!JSON.stringify(p.body).includes('cost'));
    assert.ok(!JSON.stringify(r.body).includes('cost'));
  } finally { t.close(); }
});

test('Reserva expira e libera estoque; confirmação manual baixa uma única vez; cancelamento devolve', async () => {
  const t = await startApp();
  try {
    t.configure(WA);
    await t.login();
    const v = variantBySku(t.db, 'DEMO-CREATINA-1'); // 10 un.
    const { body } = await t.req('POST', '/api/orders', { channel: 'whatsapp', items: [{ variant_id: v.id, qty: 4 }], customer, fulfillment: 'delivery', address: addressCaxias });
    const id = body.order.id;
    assert.equal(body.order.totals.total_is_final, false); // frete a confirmar
    // expira
    const n = expireReservations(t.db, new Date(Date.now() + 3 * 3600_000));
    assert.equal(n, 1);
    let o = (await t.req('GET', `/api/admin/orders/${id}`, undefined, { admin: true })).body.order;
    assert.equal(o.status, 'expirado');
    assert.equal(o.stock_state, 'released');
    // loja confirma mesmo após expirar (cliente mandou a mensagem tarde) — há estoque
    let r = await t.req('POST', `/api/admin/orders/${id}/status`, { to: 'confirmado' }, { admin: true });
    assert.equal(r.status, 200, r.text);
    assert.equal(variantBySku(t.db, 'DEMO-CREATINA-1').stock, 6);
    // confirmar de novo não é transição válida
    r = await t.req('POST', `/api/admin/orders/${id}/status`, { to: 'confirmado' }, { admin: true });
    assert.equal(r.status, 400);
    assert.equal(variantBySku(t.db, 'DEMO-CREATINA-1').stock, 6);
    // recebimento é separado da confirmação
    o = (await t.req('GET', `/api/admin/orders/${id}`, undefined, { admin: true })).body.order;
    assert.equal(o.payment_status, 'nao_iniciado');
    r = await t.req('POST', `/api/admin/orders/${id}/payment`, { method: 'pix', amount_cents: o.totals.total_cents }, { admin: true });
    assert.equal(r.body.order.payment_status, 'aprovado');
    // cancelar devolve ao estoque e alerta sobre estorno
    r = await t.req('POST', `/api/admin/orders/${id}/status`, { to: 'cancelado' }, { admin: true });
    assert.equal(variantBySku(t.db, 'DEMO-CREATINA-1').stock, 10);
    assert.ok(r.body.order.events.some((e) => /estorno/i.test(e.message || '')));
    const movs = t.db.prepare('SELECT type, qty FROM stock_movements WHERE variant_id = ? ORDER BY id').all(v.id);
    assert.deepEqual(movs.map((m) => [m.type, m.qty]), [['entrada', 10], ['venda', -4], ['devolucao', 4]]);
  } finally { t.close(); }
});

test('Venda confirmada nunca deixa estoque negativo (venda acima do estoque bloqueada)', async () => {
  const t = await startApp();
  try {
    t.configure(WA);
    await t.login();
    const v = variantBySku(t.db, 'DEMO-PRE-TREINO-2'); // 2 un.
    const a = await t.req('POST', '/api/orders', { channel: 'whatsapp', items: [{ variant_id: v.id, qty: 2 }], customer, fulfillment: 'pickup' });
    expireReservations(t.db, new Date(Date.now() + 3 * 3600_000));
    const b = await t.req('POST', '/api/orders', { channel: 'whatsapp', items: [{ variant_id: v.id, qty: 2 }], customer, fulfillment: 'pickup' });
    assert.equal(b.status, 200);
    await t.req('POST', `/api/admin/orders/${b.body.order.id}/status`, { to: 'confirmado' }, { admin: true });
    const r = await t.req('POST', `/api/admin/orders/${a.body.order.id}/status`, { to: 'confirmado' }, { admin: true });
    assert.equal(r.status, 409);
    assert.equal(variantBySku(t.db, 'DEMO-PRE-TREINO-2').stock, 0);
  } finally { t.close(); }
});

test('Compra pelo site: exige provedor; frete a confirmar bloqueia pagamento; evento repetido não duplica baixa', async () => {
  const t = await startApp();
  try {
    t.configure({ ...WA, checkout: { mode: 'both' } });
    const v = variantBySku(t.db, 'DEMO-WHEY-2'); // 5 un.
    let r = await t.req('POST', '/api/orders', { channel: 'site', items: [{ variant_id: v.id, qty: 1 }], customer, fulfillment: 'pickup', payment_method: 'pix' });
    assert.equal(r.status, 400, 'sem provedor, compra pelo site indisponível');
    t.configure({ payments: { provider: 'demo' } });
    r = await t.req('POST', '/api/orders', { channel: 'site', items: [{ variant_id: v.id, qty: 1 }], customer, fulfillment: 'delivery', address: addressCaxias, payment_method: 'pix' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /frete precisa ser combinado/);
    r = await t.req('POST', '/api/orders', { channel: 'site', items: [{ variant_id: v.id, qty: 2 }], customer, fulfillment: 'pickup', payment_method: 'pix' });
    assert.equal(r.status, 200);
    const { order, token } = r.body;
    assert.equal(order.status, 'aguardando_pagamento');
    // pagamento simulado passa pelo mesmo caminho do webhook
    const p1 = await t.req('POST', `/api/orders/${order.code}/demo-pay`, { t: token, outcome: 'approved' });
    assert.equal(p1.body.result, 'paid');
    assert.equal(variantBySku(t.db, 'DEMO-WHEY-2').stock, 3);
    // mesmo evento reenviado
    const ev = t.db.prepare("SELECT event_key FROM payment_events WHERE provider = 'demo'").get();
    const again = applyPaymentUpdate(t.db, { provider: 'demo', eventKey: ev.event_key, providerRef: `demo-${order.code}`, orderCode: order.code, providerStatus: 'approved', amountCents: order.totals.total_cents });
    assert.equal(again.result, 'duplicate');
    // outro evento "aprovado" para o mesmo pagamento
    const p2 = await t.req('POST', `/api/orders/${order.code}/demo-pay`, { t: token, outcome: 'approved' });
    assert.equal(p2.body.result, 'already_paid');
    assert.equal(variantBySku(t.db, 'DEMO-WHEY-2').stock, 3, 'estoque baixado uma única vez');
    assert.equal(t.db.prepare('SELECT COUNT(*) n FROM payments WHERE order_id = ?').get(order.id).n, 1);
    const st = await t.req('GET', `/api/orders/${order.code}?t=${token}`);
    assert.equal(st.body.order.status, 'confirmado');
    assert.equal(st.body.order.payment_status, 'aprovado');
    // token errado não expõe pedido
    assert.equal((await t.req('GET', `/api/orders/${order.code}?t=errado`)).status, 404);
    // webhook demo com assinatura falsa
    const bad = await t.req('POST', '/api/webhooks/demo', { event_id: 'x', order_code: order.code, status: 'approved' }, { headers: { 'x-demo-signature': 'abc' } });
    assert.equal(bad.status, 401);
  } finally { t.close(); }
});

test('Pagamento aprovado sem estoque disponível vai para revisão, sem baixa negativa', async () => {
  const t = await startApp();
  try {
    t.configure({ ...WA, checkout: { mode: 'both' }, payments: { provider: 'demo' } });
    await t.login();
    const v = variantBySku(t.db, 'DEMO-PRE-TREINO-2'); // 2 un.
    const s = await t.req('POST', '/api/orders', { channel: 'site', items: [{ variant_id: v.id, qty: 2 }], customer, fulfillment: 'pickup', payment_method: 'card' });
    expireReservations(t.db, new Date(Date.now() + 3600_000));
    const w = await t.req('POST', '/api/orders', { channel: 'whatsapp', items: [{ variant_id: v.id, qty: 2 }], customer, fulfillment: 'pickup' });
    await t.req('POST', `/api/admin/orders/${w.body.order.id}/status`, { to: 'confirmado' }, { admin: true });
    const res = applyPaymentUpdate(t.db, { provider: 'demo', eventKey: 'late-1', providerRef: 'late', orderCode: s.body.order.code, providerStatus: 'approved', amountCents: s.body.order.totals.total_cents });
    assert.equal(res.result, 'paid_without_stock');
    const o = t.db.prepare('SELECT status, payment_status FROM orders WHERE id = ?').get(s.body.order.id);
    assert.deepEqual([o.status, o.payment_status], ['revisar', 'aprovado']);
    assert.equal(variantBySku(t.db, 'DEMO-PRE-TREINO-2').stock, 0);
  } finally { t.close(); }
});

test('Mercado Pago: assinatura HMAC validada e status sempre reconsultado na API', async () => {
  const secret = 'segredo-webhook';
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:123456;request-id:req-1;ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  assert.equal(verifyMercadoPagoSignature({ secret, xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1', dataId: '123456' }), true);
  assert.equal(verifyMercadoPagoSignature({ secret, xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-2', dataId: '123456' }), false);
  assert.equal(verifyMercadoPagoSignature({ secret, xSignature: `ts=1000,v1=${v1}`, xRequestId: 'req-1', dataId: '123456' }), false);

  let orderCode = null;
  let total = 0;
  const fetchImpl = async (url) => {
    assert.match(String(url), /api\.mercadopago\.com\/v1\/payments\/123456/);
    return new Response(JSON.stringify({ id: 123456, status: 'approved', external_reference: orderCode, transaction_amount: total / 100, payment_type_id: 'bank_transfer' }), { status: 200 });
  };
  const t = await startApp({ env: { MP_ACCESS_TOKEN: 'TEST-x', MP_WEBHOOK_SECRET: secret }, fetchImpl });
  try {
    t.configure({ ...WA, checkout: { mode: 'site' }, payments: { provider: 'mercadopago' } });
    const v = variantBySku(t.db, 'DEMO-VITAMINAS-1');
    const r = await t.req('POST', '/api/orders', { channel: 'site', items: [{ variant_id: v.id, qty: 1 }], customer, fulfillment: 'pickup', payment_method: 'pix' });
    orderCode = r.body.order.code;
    total = r.body.order.totals.total_cents;
    const headers = { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' };
    const w1 = await t.req('POST', '/api/webhooks/mercadopago?data.id=123456&type=payment', { type: 'payment', data: { id: '123456' } }, { headers });
    assert.equal(w1.body.result, 'paid');
    const w2 = await t.req('POST', '/api/webhooks/mercadopago?data.id=123456&type=payment', { type: 'payment', data: { id: '123456' } }, { headers });
    assert.equal(w2.body.result, 'duplicate');
    assert.equal(variantBySku(t.db, 'DEMO-VITAMINAS-1').stock, 14);
    const forged = await t.req('POST', '/api/webhooks/mercadopago?data.id=123456&type=payment', { type: 'payment' }, { headers: { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': 'req-1' } });
    assert.equal(forged.status, 401);
  } finally { t.close(); }
});
