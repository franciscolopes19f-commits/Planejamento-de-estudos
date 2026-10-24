// Consultas públicas do catálogo. Nunca expõe custo, margem ou dados internos.

import { reservedMap } from './stock.js';
import { isPromoActive, unitPrice } from '../public/shared/pricing.js';

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function parseJson(s, def) {
  try { return s ? JSON.parse(s) : def; } catch { return def; }
}

export function loadProducts(db, { includeInactive = false, ids = null } = {}) {
  const where = [];
  if (!includeInactive) where.push("p.status = 'active'");
  if (ids) where.push(`p.id IN (${ids.map(Number).join(',') || 0})`);
  const rows = db.prepare(`
    SELECT p.*, b.name AS brand_name, b.slug AS brand_slug, c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.updated_at DESC`).all();
  const vs = db.prepare('SELECT * FROM variants WHERE active = 1 ORDER BY sort, id').all();
  const byProduct = new Map();
  for (const v of vs) {
    if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
    byProduct.get(v.product_id).push(v);
  }
  return rows.map((p) => ({ ...p, variants: byProduct.get(p.id) || [] }));
}

export function toPublic(p, reserved, now = new Date()) {
  const variants = p.variants.map((v) => {
    const available = Math.max(0, v.stock - (reserved.get(v.id) || 0));
    const promo = isPromoActive(v, now);
    return {
      id: v.id,
      sku: v.sku,
      flavor: v.flavor,
      size: v.size,
      price_cents: v.price_cents,
      promo_price_cents: promo ? v.promo_price_cents : null,
      promo_ends_at: promo ? v.promo_ends_at : null,
      unit_cents: unitPrice(v, now),
      available,
      in_stock: available > 0,
    };
  }).filter((v) => v.price_cents > 0);
  const inStock = variants.filter((v) => v.in_stock);
  const pool = inStock.length ? inStock : variants;
  const cheapest = pool.reduce((a, v) => (a == null || v.unit_cents < a.unit_cents ? v : a), null);
  const images = parseJson(p.images_json, []);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand_name ? { name: p.brand_name, slug: p.brand_slug } : null,
    category: p.category_name ? { name: p.category_name, slug: p.category_slug } : null,
    presentation: p.presentation,
    description: p.description,
    ingredients: p.ingredients,
    allergens: p.allergens,
    nutrition: parseJson(p.nutrition_json, null),
    nutrition_source: p.nutrition_source,
    images,
    featured: !!p.featured,
    is_new: !!p.is_new,
    is_kit: !!p.is_kit,
    is_demo: !!p.is_demo,
    tags: p.tags,
    variants,
    flavors: [...new Set(variants.map((v) => v.flavor).filter(Boolean))],
    sizes: [...new Set(variants.map((v) => v.size).filter(Boolean))],
    needs_choice: variants.length > 1,
    price_from_cents: cheapest?.unit_cents ?? null,
    regular_from_cents: cheapest?.price_cents ?? null,
    has_promo: variants.some((v) => v.promo_price_cents != null),
    price_varies: new Set(variants.map((v) => v.unit_cents)).size > 1,
    in_stock: inStock.length > 0,
    updated_at: p.updated_at,
  };
}

export function publicProducts(db, opts = {}) {
  const reserved = reservedMap(db);
  return loadProducts(db, opts).map((p) => toPublic(p, reserved)).filter((p) => p.variants.length > 0);
}

export function searchProducts(all, q) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return all;
  return all.filter((p) => {
    const hay = fold([p.name, p.brand?.name, p.category?.name, p.presentation, p.tags, ...p.flavors, ...p.sizes, ...p.variants.map((v) => v.sku)].join(' '));
    return terms.every((t) => hay.includes(t));
  });
}

export function filterProducts(all, f) {
  let list = searchProducts(all, f.q);
  if (f.category) list = list.filter((p) => p.category?.slug === f.category);
  if (f.brand) {
    const set = new Set(String(f.brand).split(','));
    list = list.filter((p) => p.brand && set.has(p.brand.slug));
  }
  if (f.min != null) list = list.filter((p) => p.price_from_cents >= f.min);
  if (f.max != null) list = list.filter((p) => p.price_from_cents <= f.max);
  if (f.available) list = list.filter((p) => p.in_stock);
  if (f.promo) list = list.filter((p) => p.has_promo);
  if (f.kind === 'new') list = list.filter((p) => p.is_new);
  if (f.kind === 'featured') list = list.filter((p) => p.featured);
  if (f.kind === 'kits') list = list.filter((p) => p.is_kit);
  if (f.kind === 'offers') list = list.filter((p) => p.has_promo);
  const sorters = {
    relevance: (a, b) => (b.in_stock - a.in_stock) || (b.featured - a.featured) || a.name.localeCompare(b.name, 'pt-BR'),
    price_asc: (a, b) => (b.in_stock - a.in_stock) || a.price_from_cents - b.price_from_cents,
    price_desc: (a, b) => (b.in_stock - a.in_stock) || b.price_from_cents - a.price_from_cents,
    name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    newest: (a, b) => (b.in_stock - a.in_stock) || String(b.updated_at).localeCompare(String(a.updated_at)),
  };
  return [...list].sort(sorters[f.sort] || sorters.relevance);
}

/** Facetas calculadas sobre o resultado da busca (antes de aplicar o próprio filtro da faceta). */
export function facets(all) {
  const brands = new Map();
  const cats = new Map();
  let min = Infinity;
  let max = 0;
  for (const p of all) {
    if (p.brand) brands.set(p.brand.slug, { ...p.brand, count: (brands.get(p.brand.slug)?.count || 0) + 1 });
    if (p.category) cats.set(p.category.slug, { ...p.category, count: (cats.get(p.category.slug)?.count || 0) + 1 });
    if (p.price_from_cents != null) {
      min = Math.min(min, p.price_from_cents);
      max = Math.max(max, p.price_from_cents);
    }
  }
  return {
    brands: [...brands.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    categories: [...cats.values()],
    price: all.length ? { min, max } : null,
  };
}

export function relatedProducts(all, p, n = 8) {
  const score = (x) => (x.category?.slug === p.category?.slug ? 2 : 0) + (x.brand?.slug === p.brand?.slug ? 1 : 0);
  return all
    .filter((x) => x.id !== p.id && x.in_stock && score(x) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}
