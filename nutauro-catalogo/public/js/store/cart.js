// Carrinho no navegador (localStorage). Guarda só referência da variação + quantidade e um "retrato"
// para exibir rápido; preço e estoque são sempre reconferidos no servidor antes de finalizar.

const KEY = 'nt_cart_v1';
const subs = new Set();
let memory = { items: [] };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.items)) memory = d;
    }
  } catch { /* armazenamento indisponível: segue em memória */ }
  return memory;
}

function write(d) {
  memory = d;
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* idem */ }
  subs.forEach((fn) => fn(d));
}

export const cart = {
  get items() { return read().items; },
  count() { return read().items.reduce((s, i) => s + i.qty, 0); },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  add(product, variant, qty = 1) {
    const d = read();
    const max = Number.isFinite(variant.available) ? variant.available : 50;
    const ex = d.items.find((i) => i.variant_id === variant.id);
    const current = ex ? ex.qty : 0;
    const next = Math.min(max, Math.min(50, current + qty));
    if (next <= current) return { added: 0, limited: true };
    const snap = {
      product_name: product.name, slug: product.slug, brand: product.brand?.name || null,
      image: product.images?.[0] || null, flavor: variant.flavor, size: variant.size, sku: variant.sku,
      unit_cents: variant.unit_cents, regular_cents: variant.price_cents, available: variant.available,
    };
    if (ex) Object.assign(ex, snap, { qty: next });
    else d.items.push({ variant_id: variant.id, qty: next, ...snap });
    write({ ...d, updated: Date.now() });
    return { added: next - current, limited: next < current + qty };
  },
  setQty(variantId, qty) {
    const d = read();
    const it = d.items.find((i) => i.variant_id === variantId);
    if (!it) return;
    it.qty = Math.max(1, Math.min(50, Math.floor(qty)));
    write({ ...d, updated: Date.now() });
  },
  remove(variantId) {
    const d = read();
    write({ ...d, items: d.items.filter((i) => i.variant_id !== variantId), updated: Date.now() });
  },
  /** Atualiza o retrato com os dados do servidor (preço/estoque atuais). */
  sync(lines) {
    const d = read();
    const byId = new Map(lines.map((l) => [l.variant_id, l]));
    for (const it of d.items) {
      const l = byId.get(it.variant_id);
      if (!l) continue;
      Object.assign(it, {
        product_name: l.product_name, slug: l.product_slug, brand: l.brand, image: l.image || it.image,
        flavor: l.flavor, size: l.size, unit_cents: l.unit_cents, regular_cents: l.regular_cents, available: l.available,
      });
    }
    write(d);
  },
  clear() { write({ items: [], updated: Date.now() }); },
  payload() { return read().items.map((i) => ({ variant_id: i.variant_id, qty: i.qty })); },
};
