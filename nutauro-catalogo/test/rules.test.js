// Regras puras: GTIN, preço, frete/prazos, mensagem do WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGtin } from '../public/shared/gtin.js';
import { cartTotals, installmentInfo, isPromoActive, pixPrice } from '../public/shared/pricing.js';
import { quoteShipping } from '../public/shared/shipping.js';
import { buildOrderMessage, normalizePhoneBR, waLink } from '../public/shared/whatsapp.js';
import { parseBRL } from '../public/shared/money.js';
import { DEFAULT_SETTINGS } from '../server/db.js';

test('GTIN: aceita EAN-13/EAN-8/UPC-A válidos e rejeita dígito errado', () => {
  assert.equal(validateGtin('7894900011517').valid, true);
  assert.equal(validateGtin('7891234567890').valid, false);
  assert.match(validateGtin('7891234567890').error, /verificador/);
  assert.equal(validateGtin('96385074').valid, true); // EAN-8
  assert.equal(validateGtin('036000291452').valid, true); // UPC-A
  assert.equal(validateGtin('12345').valid, false);
  assert.equal(validateGtin('0000000000000').valid, false);
  assert.equal(validateGtin(' 789-4900-01151-7 ').code, '7894900011517');
});

test('Preço: promoção respeita validade; Pix e parcelamento só quando configurados', () => {
  const v = { price_cents: 10000, promo_price_cents: 9000, promo_ends_at: '2026-10-01T00:00:00Z' };
  assert.equal(isPromoActive(v, new Date('2026-09-30T12:00:00Z')), true);
  assert.equal(isPromoActive(v, new Date('2026-10-02T12:00:00Z')), false);
  assert.equal(pixPrice(10000, { pix_discount_pct: 0 }), null);
  assert.equal(pixPrice(10000, { pix_discount_pct: 5 }), 9500);
  assert.equal(installmentInfo(10000, { installments: { enabled: false, max: 6 } }), null);
  assert.deepEqual(installmentInfo(10000, { installments: { enabled: true, max: 6, min_installment_cents: 2500, interest_free: true } }), { n: 4, value_cents: 2500, interest_free: true });
  assert.equal(parseBRL('1.299,90'), 129990);
  assert.equal(parseBRL('129.90'), 12990);
});

test('Totais: frete a confirmar não entra no total e marca total como não definitivo', () => {
  const lines = [{ regular_cents: 12990, unit_cents: 11990, qty: 2 }];
  const t = cartTotals({ lines, shipping: { status: 'to_confirm', fee_cents: null }, paymentMethod: 'pix', payments: { pix_discount_pct: 5 } });
  assert.equal(t.subtotal_cents, 25980);
  assert.equal(t.promo_discount_cents, 2000);
  assert.equal(t.pix_discount_cents, 1199);
  assert.equal(t.total_cents, 23980 - 1199);
  assert.equal(t.total_is_final, false);
  const t2 = cartTotals({ lines, shipping: { status: 'fixed', fee_cents: 1000 }, payments: {} });
  assert.equal(t2.total_cents, 24980);
  assert.equal(t2.total_is_final, true);
});

const delivery = { ...DEFAULT_SETTINGS.delivery, holidays: ['2026-11-20'], prep_minutes: 60 };
const at = (iso) => new Date(iso);

test('Entrega no mesmo dia: só em Duque de Caxias, antes do horário limite (com preparo), dia útil e com estoque', () => {
  // Sexta 23/10/2026 13:00 em São Paulo (16:00Z): 13:00 + 60 min ≤ 15:00 → possível hoje
  let q = quoteShipping({ cep: '25010000', delivery, pickup: { enabled: true }, now: at('2026-10-23T16:00:00Z') });
  let opt = q.options.find((o) => o.kind === 'delivery');
  assert.equal(q.zone.id, 'caxias');
  assert.equal(opt.estimate.same_day, true);
  assert.equal(opt.status, 'to_confirm'); // taxa não configurada → a confirmar, nunca inventada
  assert.ok(q.options.find((o) => o.kind === 'pickup'));
  // 14:30 local: 14:30 + 60 > 15:00 → próximo dia útil (sábado opera por padrão)
  q = quoteShipping({ cep: '25010000', delivery, now: at('2026-10-23T17:30:00Z') });
  opt = q.options.find((o) => o.kind === 'delivery');
  assert.equal(opt.estimate.same_day, false);
  assert.equal(opt.estimate.date, '2026-10-24');
  // Sem estoque imediato: nunca promete mesmo dia
  q = quoteShipping({ cep: '25010000', delivery, now: at('2026-10-23T13:00:00Z'), allInStock: false });
  assert.equal(q.options.find((o) => o.kind === 'delivery').estimate.same_day, false);
  // Domingo → segunda
  q = quoteShipping({ cep: '25010000', delivery, now: at('2026-10-25T13:00:00Z') });
  assert.equal(q.options.find((o) => o.kind === 'delivery').estimate.date, '2026-10-26');
  // Feriado (20/11, sexta) pula para sábado 21/11
  q = quoteShipping({ cep: '25010000', delivery, now: at('2026-11-19T20:00:00Z') });
  assert.equal(q.options.find((o) => o.kind === 'delivery').estimate.date, '2026-11-21');
});

test('Outras regiões: horas corridas no Rio; transportadora no Brasil; CEP inválido; frete grátis e exceção', () => {
  let q = quoteShipping({ cep: '20040-002', delivery, now: at('2026-10-23T16:00:00Z') });
  assert.equal(q.zone.id, 'rio');
  assert.match(q.options[0].estimate.text, /48 horas corridas/);
  q = quoteShipping({ cep: '01310-100', delivery, now: at('2026-10-23T16:00:00Z') });
  assert.equal(q.zone.id, 'brasil');
  assert.equal(q.options[0].status, 'to_confirm');
  assert.ok(quoteShipping({ cep: '123', delivery }).error);
  const d2 = { ...delivery, zones: [
    { id: 'bloq', name: 'Área sem entrega', blocked: true, cep_ranges: [['25000000', '25009999']] },
    { ...delivery.zones[0], fee_cents: 800, free_over_cents: 20000 },
  ] };
  assert.equal(quoteShipping({ cep: '25005000', delivery: d2 }).options.length, 0);
  assert.equal(quoteShipping({ cep: '25010000', delivery: d2, itemsCents: 10000 }).options[0].fee_cents, 800);
  assert.equal(quoteShipping({ cep: '25010000', delivery: d2, itemsCents: 25000 }).options[0].status, 'free');
});

test('WhatsApp: telefone normalizado e mensagem completa com sabores, quantidades, preços e total', () => {
  assert.equal(normalizePhoneBR('(21) 99999-0000'), '5521999990000');
  assert.equal(normalizePhoneBR('123'), null);
  const o = {
    code: 'NT-000123',
    items: [{ qty: 2, product_name: 'Whey', brand: 'Marca X', variant_label: 'Chocolate · 900 g', unit_cents: 11990, total_cents: 23980 }],
    totals: cartTotals({ lines: [{ regular_cents: 12990, unit_cents: 11990, qty: 2 }], shipping: { status: 'fixed', fee_cents: 1000 }, payments: {} }),
    fulfillment: 'delivery', shipping: { status: 'fixed', fee_cents: 1000, estimate_text: 'Hoje' },
    address: { cep: '25010000', street: 'Rua A', number: '10', district: 'Centro', city: 'Duque de Caxias', uf: 'RJ' },
    customer: { name: 'Ana', phone: '5521988887777' }, payment_method: 'pix', reservation_expires_at: '2026-10-23T18:00:00Z',
  };
  const m = buildOrderMessage(o);
  for (const s of ['NT-000123', '2x Whey', 'Chocolate · 900 g', 'R$ 119,90', 'Frete: R$ 10,00', '*Total: R$ 249,80*', 'CEP 25010-000', 'Pix', '(21) 98888-7777', '15:00']) {
    assert.ok(m.includes(s), `mensagem deveria conter "${s}"\n${m}`);
  }
  assert.ok(waLink('21999990000', m).startsWith('https://wa.me/5521999990000?text='));
});
