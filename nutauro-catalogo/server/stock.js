// Estoque: saldo físico em variants.stock; reservas derivadas dos pedidos com stock_state='reserved'
// e reserva ainda válida. Disponível = saldo − reservas ativas.
// Baixa definitiva só acontece na confirmação da venda (manual no painel ou pagamento aprovado).

import { HttpError, nowIso } from './http.js';

export function reservedMap(db, { now = nowIso(), excludeOrderId = 0 } = {}) {
  const rows = db.prepare(`
    SELECT oi.variant_id AS id, SUM(oi.qty) AS qty
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.stock_state = 'reserved' AND o.reservation_expires_at > ? AND o.id <> ?
     GROUP BY oi.variant_id`).all(now, excludeOrderId);
  return new Map(rows.map((r) => [r.id, r.qty]));
}

export function availableFor(db, variantId, opts) {
  const v = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantId);
  if (!v) return 0;
  const reserved = reservedMap(db, opts).get(variantId) || 0;
  return Math.max(0, v.stock - reserved);
}

/** Registra movimento e atualiza saldo. qty com sinal. Deve rodar dentro de transação. */
export function moveStock(db, { variantId, type, qty, reason = null, unitCostCents = null, orderId = null, userId = null }) {
  if (!Number.isInteger(qty) || qty === 0) throw new HttpError(400, 'Quantidade inválida.');
  const v = db.prepare('SELECT id, stock FROM variants WHERE id = ?').get(variantId);
  if (!v) throw new HttpError(404, 'Variação não encontrada.');
  const balance = v.stock + qty;
  if (balance < 0) throw new HttpError(409, `Saldo insuficiente (saldo atual ${v.stock}).`);
  db.prepare('UPDATE variants SET stock = ? WHERE id = ?').run(balance, variantId);
  db.prepare(`INSERT INTO stock_movements(variant_id, type, qty, balance_after, reason, unit_cost_cents, order_id, user_id, created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(variantId, type, qty, balance, reason, unitCostCents, orderId, userId, nowIso());
  if (type === 'entrada' && unitCostCents != null) {
    db.prepare('UPDATE variants SET cost_cents = ? WHERE id = ?').run(unitCostCents, variantId);
  }
  return balance;
}

/** Define o saldo exato (inventário), gerando movimento de ajuste com a diferença. */
export function setStock(db, { variantId, target, reason, userId }) {
  const v = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantId);
  if (!v) throw new HttpError(404, 'Variação não encontrada.');
  if (!Number.isInteger(target) || target < 0) throw new HttpError(400, 'Saldo inválido.');
  if (target === v.stock) return v.stock;
  return moveStock(db, { variantId, type: 'ajuste', qty: target - v.stock, reason: reason || 'Ajuste de inventário', userId });
}

/**
 * Converte a reserva de um pedido em baixa definitiva. Idempotente: se já baixado, não faz nada.
 * Verifica disponibilidade descontando reservas de OUTROS pedidos (a reserva deste pode ter expirado).
 * Deve rodar dentro de transação.
 */
export function commitOrderStock(db, orderId, { userId = null } = {}) {
  const o = db.prepare('SELECT id, stock_state FROM orders WHERE id = ?').get(orderId);
  if (!o) throw new HttpError(404, 'Pedido não encontrado.');
  if (o.stock_state === 'committed') return { already: true };
  const items = db.prepare('SELECT variant_id, SUM(qty) qty, MIN(product_name) name, MIN(variant_label) label FROM order_items WHERE order_id = ? GROUP BY variant_id').all(orderId);
  const others = reservedMap(db, { excludeOrderId: orderId });
  const short = [];
  for (const it of items) {
    const v = db.prepare('SELECT stock FROM variants WHERE id = ?').get(it.variant_id);
    const avail = (v?.stock ?? 0) - (others.get(it.variant_id) || 0);
    if (avail < it.qty) short.push({ variant_id: it.variant_id, name: it.name, label: it.label, requested: it.qty, available: Math.max(0, avail) });
  }
  if (short.length) throw new HttpError(409, 'Estoque insuficiente para confirmar a venda.', { short });
  for (const it of items) {
    moveStock(db, { variantId: it.variant_id, type: 'venda', qty: -it.qty, reason: 'Venda confirmada', orderId, userId });
  }
  db.prepare("UPDATE orders SET stock_state = 'committed', reservation_expires_at = NULL WHERE id = ?").run(orderId);
  return { committed: true };
}

/** Libera reserva ou devolve ao estoque o que já foi baixado. Idempotente. */
export function releaseOrderStock(db, orderId, { userId = null, reason = 'Pedido cancelado' } = {}) {
  const o = db.prepare('SELECT id, stock_state FROM orders WHERE id = ?').get(orderId);
  if (!o || o.stock_state === 'released') return { already: true };
  if (o.stock_state === 'committed') {
    const items = db.prepare('SELECT variant_id, SUM(qty) qty FROM order_items WHERE order_id = ? GROUP BY variant_id').all(orderId);
    for (const it of items) moveStock(db, { variantId: it.variant_id, type: 'devolucao', qty: it.qty, reason, orderId, userId });
  }
  db.prepare("UPDATE orders SET stock_state = 'released', reservation_expires_at = NULL WHERE id = ?").run(orderId);
  return { released: true };
}

export function lowStock(db, defaultThreshold = 3) {
  const reserved = reservedMap(db);
  const rows = db.prepare(`
    SELECT v.id, v.flavor, v.size, v.sku, v.stock, COALESCE(v.low_stock_threshold, ?) AS threshold,
           p.id AS product_id, p.name AS product_name, p.status
      FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.active = 1 AND p.status <> 'archived'`).all(defaultThreshold);
  return rows
    .map((r) => ({ ...r, reserved: reserved.get(r.id) || 0, available: Math.max(0, r.stock - (reserved.get(r.id) || 0)) }))
    .filter((r) => r.available <= r.threshold)
    .sort((a, b) => a.available - b.available);
}
