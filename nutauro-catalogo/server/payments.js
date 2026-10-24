// Integração de pagamento: Mercado Pago Checkout Pro (Pix e cartão em página do provedor).
// A loja nunca recebe nem armazena dados de cartão.
// Confirmação: a notificação (webhook) é autenticada por HMAC (x-signature) e o status é sempre
// reconsultado na API do Mercado Pago antes de aplicar ao pedido.

import crypto from 'node:crypto';
import { applyPaymentUpdate, demoPaymentsAllowed } from './orders.js';
import { HttpError } from './http.js';

const MP_API = 'https://api.mercadopago.com';

export async function createMercadoPagoPreference({ env, order, settings, baseUrl, fetchImpl = fetch }) {
  const body = {
    // Um item com o total do pedido garante que o valor cobrado é exatamente o calculado pelo servidor.
    items: [{
      id: order.code,
      title: `Pedido ${order.code} — ${settings.store.name}`,
      quantity: 1,
      unit_price: order.totals.total_cents / 100,
      currency_id: 'BRL',
    }],
    payer: { name: order.customer.name, email: order.customer.email || undefined },
    external_reference: order.code,
    notification_url: `${baseUrl}/api/webhooks/mercadopago`,
    back_urls: {
      success: order.status_url, pending: order.status_url, failure: order.status_url,
    },
    auto_return: 'approved',
    statement_descriptor: 'NUTAURO',
    expires: !!order.reservation_expires_at,
    expiration_date_to: order.reservation_expires_at || undefined,
    payment_methods: order.payment_method === 'pix'
      ? { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }, { id: 'prepaid_card' }] }
      : {
          excluded_payment_types: [{ id: 'bank_transfer' }, { id: 'ticket' }],
          installments: settings.payments.installments.enabled ? Math.max(1, settings.payments.installments.max) : 1,
        },
  };
  const r = await fetchImpl(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `pref-${order.code}-${order.payment_method}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new HttpError(502, 'Não foi possível iniciar o pagamento. Tente novamente em instantes.');
  const j = await r.json();
  return { redirect_url: j.init_point, preference_id: j.id };
}

/** Valida a assinatura do webhook do Mercado Pago (manifesto id;request-id;ts). */
export function verifyMercadoPagoSignature({ secret, xSignature, xRequestId, dataId, toleranceSec = 600, now = Date.now() }) {
  if (!secret || !xSignature || !dataId) return false;
  const parts = Object.fromEntries(String(xSignature).split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > toleranceSec * 1000) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleMercadoPagoWebhook({ db, env, headers, query, body, fetchImpl = fetch }) {
  const type = body?.type || query.type || query.topic;
  const dataId = query['data.id'] || body?.data?.id;
  if (type !== 'payment') return { status: 200, result: 'ignored' };
  const ok = verifyMercadoPagoSignature({
    secret: env.MP_WEBHOOK_SECRET, xSignature: headers['x-signature'], xRequestId: headers['x-request-id'], dataId,
  });
  if (!ok) return { status: 401, result: 'invalid_signature' };
  // Nunca confiar no corpo da notificação: buscar o pagamento na API.
  const r = await fetchImpl(`${MP_API}/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) return { status: 502, result: 'fetch_failed' }; // MP reenvia a notificação
  const p = await r.json();
  const res = applyPaymentUpdate(db, {
    provider: 'mercadopago',
    eventKey: `payment:${p.id}:${p.status}`,
    providerRef: String(p.id),
    orderCode: p.external_reference,
    providerStatus: p.status,
    amountCents: Math.round(Number(p.transaction_amount) * 100),
    method: p.payment_type_id === 'bank_transfer' ? 'pix' : p.payment_type_id,
    raw: { id: p.id, status: p.status, status_detail: p.status_detail, payment_type_id: p.payment_type_id, transaction_amount: p.transaction_amount },
  });
  return { status: 200, ...res };
}

// ---- Provedor de demonstração -----------------------------------------------------------
// Simula o ciclo provedor → evento assinado → confirmação no servidor, usando o mesmo caminho
// idempotente do pagamento real. Nenhum valor é cobrado. Bloqueado em produção salvo ALLOW_DEMO_PAYMENTS=1.

export function demoSecret(env) {
  return env.DEMO_PAYMENT_SECRET || 'demo-secret-local';
}

export function signDemoEvent(env, payload) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', demoSecret(env)).update(body).digest('hex');
  return { body, sig };
}

export function handleDemoWebhook({ db, env, rawBody, signature }) {
  if (!demoPaymentsAllowed(env)) return { status: 403, result: 'demo_disabled' };
  const expected = crypto.createHmac('sha256', demoSecret(env)).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { status: 401, result: 'invalid_signature' };
  const ev = JSON.parse(rawBody);
  const res = applyPaymentUpdate(db, {
    provider: 'demo', eventKey: ev.event_id, providerRef: ev.payment_id, orderCode: ev.order_code,
    providerStatus: ev.status, amountCents: ev.amount_cents, method: ev.method, raw: ev,
  });
  return { status: 200, ...res };
}
