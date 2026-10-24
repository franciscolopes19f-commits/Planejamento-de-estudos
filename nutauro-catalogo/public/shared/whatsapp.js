// Montagem da mensagem de pedido para o WhatsApp.
// Abrir o WhatsApp não envia a mensagem nem confirma o pedido: o cliente ainda precisa tocar em "enviar"
// e a loja precisa confirmar disponibilidade e pagamento.

import { formatBRL } from './money.js';
import { formatCep } from './shipping.js';

export const PAYMENT_LABELS = {
  pix: 'Pix',
  card: 'Cartão',
  cash: 'Dinheiro',
  card_on_delivery: 'Cartão na entrega/retirada',
  combine: 'A combinar',
};

export function normalizePhoneBR(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!(d.length === 12 || d.length === 13) || !d.startsWith('55')) return null;
  return d;
}

export function formatPhoneBR(raw) {
  const d = (normalizePhoneBR(raw) || '').slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(raw ?? '');
}

export function waLink(phone, text) {
  const p = normalizePhoneBR(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

function shippingLine(o) {
  if (o.fulfillment === 'pickup') return 'Retirada na loja (sem custo)';
  const s = o.shipping || {};
  if (s.status === 'free') return 'Grátis';
  if (s.status === 'fixed') return formatBRL(s.fee_cents);
  return 'A confirmar com a loja';
}

function fmtDateTime(iso, tz = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function buildOrderMessage(o, { storeName = 'Nutauro Suplementos' } = {}) {
  const L = [];
  L.push(`*Pedido ${o.code} — ${storeName}*`);
  L.push('Olá! Montei este pedido pelo catálogo:');
  L.push('');
  o.items.forEach((it, i) => {
    L.push(`${i + 1}) ${it.qty}x ${it.product_name}${it.brand ? ` — ${it.brand}` : ''}`);
    if (it.variant_label) L.push(`   ${it.variant_label}`);
    L.push(`   ${formatBRL(it.unit_cents)} un. = ${formatBRL(it.total_cents)}`);
  });
  L.push('');
  const t = o.totals;
  L.push(`Subtotal: ${formatBRL(t.subtotal_cents)}`);
  if (t.promo_discount_cents > 0) L.push(`Descontos de promoção: -${formatBRL(t.promo_discount_cents)}`);
  if (t.pix_discount_cents > 0) L.push(`Desconto no Pix: -${formatBRL(t.pix_discount_cents)}`);
  L.push(`Frete: ${shippingLine(o)}`);
  L.push(t.total_is_final ? `*Total: ${formatBRL(t.total_cents)}*` : `*Total dos produtos: ${formatBRL(t.total_cents)}* (+ frete a confirmar)`);
  L.push('');
  if (o.fulfillment === 'pickup') {
    L.push('*Recebimento:* Retirada na loja');
  } else {
    const a = o.address || {};
    const parts = [
      [a.street, a.number].filter(Boolean).join(', '),
      a.complement, a.district,
      [a.city, a.uf].filter(Boolean).join('/'),
      a.cep ? `CEP ${formatCep(a.cep)}` : '',
    ].filter(Boolean);
    L.push(`*Entrega:* ${parts.join(' — ')}`);
    if (a.reference) L.push(`Referência: ${a.reference}`);
    if (o.shipping?.estimate_text) L.push(`Prazo informado: ${o.shipping.estimate_text}`);
  }
  L.push(`*Nome:* ${o.customer?.name || ''}`);
  if (o.customer?.phone) L.push(`*Telefone:* ${formatPhoneBR(o.customer.phone)}`);
  if (o.payment_method) L.push(`*Pagamento preferido:* ${PAYMENT_LABELS[o.payment_method] || o.payment_method}`);
  if (o.notes) L.push(`*Observações:* ${o.notes}`);
  L.push('');
  if (o.reservation_expires_at) L.push(`Itens reservados até ${fmtDateTime(o.reservation_expires_at)}.`);
  L.push('Aguardo a confirmação de disponibilidade, total e forma de pagamento.');
  if (o.status_url) L.push(`Acompanhar: ${o.status_url}`);
  return L.join('\n').replace(/\u00a0/g, ' ');
}

export function buildProductQuestion(p, variant, url) {
  const lines = [`Olá! Tenho uma dúvida sobre o produto:`, `*${p.name}*${p.brand_name ? ` — ${p.brand_name}` : ''}`];
  if (variant) lines.push(`Opção: ${[variant.flavor, variant.size].filter(Boolean).join(' · ')}${variant.sku ? ` (cód. ${variant.sku})` : ''}`);
  if (url) lines.push(url);
  return lines.join('\n');
}
