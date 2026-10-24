// Regras de preço compartilhadas (vitrine, carrinho, servidor).
// O servidor sempre recalcula: valores vindos do navegador nunca são confiáveis.

export function isPromoActive(v, now = new Date()) {
  if (v.promo_price_cents == null || v.promo_price_cents <= 0) return false;
  if (v.promo_price_cents >= v.price_cents) return false;
  if (v.promo_starts_at && new Date(v.promo_starts_at) > now) return false;
  if (v.promo_ends_at && new Date(v.promo_ends_at) <= now) return false;
  return true;
}

export function unitPrice(v, now = new Date()) {
  return isPromoActive(v, now) ? v.promo_price_cents : v.price_cents;
}

export function pixPrice(cents, payments) {
  const pct = Number(payments?.pix_discount_pct) || 0;
  if (pct <= 0) return null;
  return cents - Math.round((cents * pct) / 100);
}

/** Parcelamento só aparece se configurado. Retorna null quando não se aplica. */
export function installmentInfo(cents, payments) {
  const inst = payments?.installments;
  if (!inst?.enabled) return null;
  const max = Math.floor(Number(inst.max) || 0);
  if (max < 2) return null;
  const min = Number(inst.min_installment_cents) || 0;
  const n = min > 0 ? Math.min(max, Math.floor(cents / min)) : max;
  if (n < 2) return null;
  return { n, value_cents: Math.ceil(cents / n), interest_free: inst.interest_free !== false };
}

/**
 * @param {object} p
 * @param {{regular_cents:number, unit_cents:number, qty:number}[]} p.lines
 * @param {{status:'free'|'fixed'|'to_confirm'|'pickup'|'none', fee_cents?:number|null}} [p.shipping]
 * @param {string} [p.paymentMethod]
 * @param {object} [p.payments]  configuração de pagamentos
 */
export function cartTotals({ lines, shipping, paymentMethod, payments }) {
  let subtotal = 0;
  let promo = 0;
  for (const l of lines) {
    subtotal += l.regular_cents * l.qty;
    promo += (l.regular_cents - l.unit_cents) * l.qty;
  }
  const items = subtotal - promo;
  const pct = Number(payments?.pix_discount_pct) || 0;
  const pix = paymentMethod === 'pix' && pct > 0 ? Math.round((items * pct) / 100) : 0;
  const ship = shipping || { status: 'none' };
  const shipFee = ship.status === 'fixed' ? ship.fee_cents || 0 : 0;
  const total = items - pix + shipFee;
  return {
    subtotal_cents: subtotal,
    promo_discount_cents: promo,
    pix_discount_cents: pix,
    items_cents: items,
    shipping_status: ship.status,
    shipping_cents: ship.status === 'to_confirm' || ship.status === 'none' ? null : shipFee,
    total_cents: total,
    // Total é definitivo apenas quando o frete está definido (ou é retirada).
    total_is_final: ship.status !== 'to_confirm' && ship.status !== 'none',
  };
}

export function variantLabel(v) {
  return [v.flavor, v.size].filter(Boolean).join(' · ');
}
