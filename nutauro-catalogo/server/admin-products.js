import { tx } from './db.js';
import { HttpError, bad, slugify, nowIso, str, int } from './http.js';
import { moveStock, setStock, reservedMap } from './stock.js';
import { validateGtin } from '../public/shared/gtin.js';
import { parseBRL, centsToInput } from '../public/shared/money.js';
import { parseCsv, toCsv } from './csv.js';

function uniqueSlug(db, table, base, exceptId = 0) {
  let slug = slugify(base);
  for (let i = 2; db.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id <> ?`).get(slug, exceptId); i++) slug = `${slugify(base)}-${i}`;
  return slug;
}

export function findOrCreateBrand(db, name) {
  const n = str(name, 80);
  if (!n) return null;
  const ex = db.prepare('SELECT id FROM brands WHERE lower(name) = lower(?)').get(n);
  if (ex) return ex.id;
  return Number(db.prepare('INSERT INTO brands(slug, name) VALUES (?,?)').run(uniqueSlug(db, 'brands', n), n).lastInsertRowid);
}

export function findOrCreateCategory(db, name) {
  const n = str(name, 80);
  if (!n) return null;
  const ex = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?) OR slug = ?').get(n, slugify(n));
  if (ex) return ex.id;
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 s FROM categories').get().s;
  return Number(db.prepare('INSERT INTO categories(slug, name, sort) VALUES (?,?,?)').run(uniqueSlug(db, 'categories', n), n, sort).lastInsertRowid);
}

/** O que falta preencher. "required" bloqueia publicação; "recommended" é orientação. */
export function completeness(p) {
  const required = [];
  const recommended = [];
  const vs = (p.variants || []).filter((v) => v.active !== 0 && v.active !== false);
  if (!p.name) required.push('Nome do produto');
  if (!p.category_id) required.push('Categoria');
  if (!vs.length) required.push('Ao menos uma opção (sabor/tamanho) ativa');
  if (vs.some((v) => !(v.price_cents > 0))) required.push('Preço de venda em todas as opções');
  if (vs.length > 1 && vs.some((v) => !v.flavor && !v.size)) required.push('Sabor ou tamanho para diferenciar as opções');
  const images = Array.isArray(p.images) ? p.images : JSON.parse(p.images_json || '[]');
  if (!images.length) recommended.push('Foto');
  if (!p.brand_id) recommended.push('Marca');
  if (!p.presentation) recommended.push('Apresentação (ex.: pote 900 g)');
  if (!p.description) recommended.push('Descrição');
  if (vs.some((v) => v.cost_cents == null)) recommended.push('Custo (para calcular margem)');
  if (vs.some((v) => !v.gtin)) recommended.push('Código de barras');
  return { required, recommended, can_publish: required.length === 0 };
}

export function getAdminProduct(db, id) {
  const p = db.prepare(`SELECT p.*, b.name AS brand_name, c.name AS category_name FROM products p
                        LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`).get(id);
  if (!p) return null;
  const reserved = reservedMap(db);
  const variants = db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id').all(id)
    .map((v) => ({ ...v, reserved: reserved.get(v.id) || 0, available: Math.max(0, v.stock - (reserved.get(v.id) || 0)) }));
  const out = {
    ...p,
    images: JSON.parse(p.images_json || '[]'),
    nutrition: p.nutrition_json ? JSON.parse(p.nutrition_json) : null,
    data_source: p.data_source_json ? JSON.parse(p.data_source_json) : null,
    variants,
  };
  delete out.images_json; delete out.nutrition_json; delete out.data_source_json;
  out.completeness = completeness(out);
  return out;
}

export function listAdminProducts(db, { q, status, category, stock } = {}) {
  const reserved = reservedMap(db);
  const rows = db.prepare(`SELECT p.id, p.slug, p.name, p.status, p.images_json, p.is_demo, p.updated_at, p.category_id, p.brand_id,
                                  p.presentation, p.description, b.name brand_name, c.name category_name
                             FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
                            ORDER BY p.updated_at DESC`).all();
  const vs = db.prepare('SELECT * FROM variants ORDER BY sort, id').all();
  const byP = new Map();
  for (const v of vs) (byP.get(v.product_id) || byP.set(v.product_id, []).get(v.product_id)).push(v);
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let list = rows.map((p) => {
    const variants = byP.get(p.id) || [];
    const active = variants.filter((v) => v.active);
    const totalStock = active.reduce((s, v) => s + v.stock, 0);
    const available = active.reduce((s, v) => s + Math.max(0, v.stock - (reserved.get(v.id) || 0)), 0);
    const prices = active.map((v) => v.price_cents).filter((x) => x > 0);
    const c = completeness({ ...p, variants });
    return {
      id: p.id, slug: p.slug, name: p.name, status: p.status, is_demo: !!p.is_demo,
      image: JSON.parse(p.images_json || '[]')[0] || null,
      brand_name: p.brand_name, category_name: p.category_name, category_id: p.category_id,
      variants_count: active.length, stock: totalStock, available,
      price_min_cents: prices.length ? Math.min(...prices) : null,
      gtins: variants.map((v) => v.gtin).filter(Boolean), skus: variants.map((v) => v.sku).filter(Boolean),
      missing_required: c.required, missing_recommended: c.recommended,
      updated_at: p.updated_at,
    };
  });
  if (q) {
    const t = fold(q);
    list = list.filter((p) => fold([p.name, p.brand_name, p.category_name, ...p.gtins, ...p.skus].join(' ')).includes(t));
  }
  if (status) list = list.filter((p) => p.status === status);
  else list = list.filter((p) => p.status !== 'archived');
  if (category) list = list.filter((p) => String(p.category_id) === String(category));
  if (stock === 'out') list = list.filter((p) => p.available === 0);
  if (stock === 'incomplete') list = list.filter((p) => p.missing_required.length);
  return list;
}

function money(v) {
  if (v == null || v === '') return null;
  if (Number.isInteger(v)) return v;
  const c = parseBRL(v);
  if (c == null || c < 0) throw bad(`Valor inválido: ${v}`);
  return c;
}

function normVariant(v, i) {
  const gtin = str(v.gtin, 20);
  if (gtin) {
    const g = validateGtin(gtin);
    if (!g.valid) throw bad(`Opção ${i + 1}: ${g.error}`);
  }
  const promo = money(v.promo_price_cents ?? v.promo_price);
  const price = money(v.price_cents ?? v.price) ?? 0;
  if (promo != null && promo >= price && price > 0) throw bad(`Opção ${i + 1}: o preço promocional deve ser menor que o preço normal.`);
  return {
    id: int(v.id, { min: 1 }),
    sku: str(v.sku, 60), gtin: gtin ? validateGtin(gtin).code : null,
    flavor: str(v.flavor, 60), size: str(v.size, 60),
    price_cents: price, promo_price_cents: promo,
    promo_starts_at: str(v.promo_starts_at, 30), promo_ends_at: str(v.promo_ends_at, 30),
    cost_cents: money(v.cost_cents ?? v.cost),
    low_stock_threshold: int(v.low_stock_threshold, { min: 0, max: 100000 }),
    active: v.active === false || v.active === 0 ? 0 : 1,
    initial_stock: int(v.initial_stock, { min: 0, max: 1_000_000, def: 0 }),
  };
}

/** Cria ou atualiza produto com suas opções numa única transação. */
export function saveProduct(db, input, { userId = null } = {}) {
  const name = str(input.name, 140);
  if (!name) throw bad('Informe o nome do produto.');
  const status = ['draft', 'active', 'archived'].includes(input.status) ? input.status : 'draft';
  const variants = (input.variants || []).map(normVariant);
  return tx(db, () => {
    const brandId = input.brand_id ? int(input.brand_id, { min: 1 }) : findOrCreateBrand(db, input.brand_name);
    const categoryId = input.category_id ? int(input.category_id, { min: 1 }) : findOrCreateCategory(db, input.category_name);
    const images = (Array.isArray(input.images) ? input.images : []).map((u) => str(u, 500)).filter(Boolean).slice(0, 10);
    const check = completeness({ name, category_id: categoryId, brand_id: brandId, images, presentation: input.presentation, description: input.description, variants });
    if (status === 'active' && !check.can_publish) {
      throw new HttpError(400, `Para publicar, falta: ${check.required.join(', ')}.`, { completeness: check });
    }
    const fields = {
      name, brand_id: brandId, category_id: categoryId,
      presentation: str(input.presentation, 120), description: str(input.description, 4000),
      ingredients: str(input.ingredients, 4000), allergens: str(input.allergens, 1000),
      nutrition_json: input.nutrition ? JSON.stringify(input.nutrition) : null,
      nutrition_source: str(input.nutrition_source, 200),
      images_json: JSON.stringify(images), status,
      featured: input.featured ? 1 : 0, is_new: input.is_new ? 1 : 0, is_kit: input.is_kit ? 1 : 0,
      tags: str(input.tags, 300),
      data_source_json: input.data_source ? JSON.stringify(input.data_source) : null,
      updated_at: nowIso(),
    };
    let id = int(input.id, { min: 1 });
    if (id) {
      const ex = db.prepare('SELECT id, is_demo, data_source_json FROM products WHERE id = ?').get(id);
      if (!ex) throw new HttpError(404, 'Produto não encontrado.');
      if (!input.data_source) fields.data_source_json = ex.data_source_json;
      const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE products SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);
    } else {
      fields.slug = uniqueSlug(db, 'products', [name, input.presentation].filter(Boolean).join(' '));
      const cols = Object.keys(fields);
      id = Number(db.prepare(`INSERT INTO products(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(fields)).lastInsertRowid);
    }

    const keep = new Set();
    variants.forEach((v, i) => {
      if (v.gtin) {
        const dup = db.prepare('SELECT v.id, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE v.gtin = ? AND v.id <> ?').get(v.gtin, v.id || 0);
        if (dup) throw bad(`O código ${v.gtin} já está cadastrado em "${dup.name}".`);
      }
      const vals = [v.sku, v.gtin, v.flavor, v.size, v.price_cents, v.promo_price_cents, v.promo_starts_at, v.promo_ends_at, v.cost_cents, v.low_stock_threshold, v.active, i];
      if (v.id) {
        const own = db.prepare('SELECT id FROM variants WHERE id = ? AND product_id = ?').get(v.id, id);
        if (!own) throw bad('Opção não pertence a este produto.');
        db.prepare(`UPDATE variants SET sku=?, gtin=?, flavor=?, size=?, price_cents=?, promo_price_cents=?, promo_starts_at=?, promo_ends_at=?,
                    cost_cents=?, low_stock_threshold=?, active=?, sort=? WHERE id = ?`).run(...vals, v.id);
        keep.add(v.id);
      } else {
        const vid = Number(db.prepare(`INSERT INTO variants(product_id, sku, gtin, flavor, size, price_cents, promo_price_cents, promo_starts_at, promo_ends_at,
                    cost_cents, low_stock_threshold, active, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, ...vals).lastInsertRowid);
        keep.add(vid);
        if (v.initial_stock > 0) moveStock(db, { variantId: vid, type: 'entrada', qty: v.initial_stock, reason: 'Estoque inicial no cadastro', unitCostCents: v.cost_cents, userId });
      }
    });
    // Opções removidas: apagar se não têm histórico; senão apenas desativar.
    for (const old of db.prepare('SELECT id FROM variants WHERE product_id = ?').all(id)) {
      if (keep.has(old.id)) continue;
      const used = db.prepare('SELECT 1 FROM order_items WHERE variant_id = ? UNION SELECT 1 FROM stock_movements WHERE variant_id = ? LIMIT 1').get(old.id, old.id);
      if (used) db.prepare('UPDATE variants SET active = 0 WHERE id = ?').run(old.id);
      else db.prepare('DELETE FROM variants WHERE id = ?').run(old.id);
    }
    return getAdminProduct(db, id);
  });
}

export function duplicateProduct(db, id) {
  const p = getAdminProduct(db, id);
  if (!p) throw new HttpError(404, 'Produto não encontrado.');
  return saveProduct(db, {
    ...p, id: null, name: `${p.name} (cópia)`, status: 'draft', data_source: null,
    variants: p.variants.map((v) => ({ ...v, id: null, gtin: null, sku: null, initial_stock: 0 })),
  });
}

export function setProductStatus(db, id, status) {
  const p = getAdminProduct(db, id);
  if (!p) throw new HttpError(404, 'Produto não encontrado.');
  if (status === 'active' && !p.completeness.can_publish) throw bad(`Para publicar, falta: ${p.completeness.required.join(', ')}.`);
  db.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
  return getAdminProduct(db, id);
}

/** Busca interna por código: GTIN, SKU. */
export function findByCode(db, code) {
  return db.prepare(`SELECT v.*, p.name AS product_name, p.status AS product_status, p.images_json
                       FROM variants v JOIN products p ON p.id = v.product_id
                      WHERE v.gtin = ? OR ltrim(v.gtin, '0') = ltrim(?, '0') OR v.sku = ? LIMIT 1`).get(code, code, code) || null;
}

// ---- CSV -------------------------------------------------------------------------------

export const CSV_HEADER = [
  'produto_slug', 'produto', 'marca', 'categoria', 'apresentacao', 'status', 'destaque', 'novidade', 'kit', 'descricao',
  'sku', 'gtin', 'sabor', 'tamanho', 'preco', 'preco_promocional', 'promocao_ate', 'custo', 'estoque', 'estoque_minimo', 'fotos',
];

export function exportCsv(db) {
  const rows = db.prepare(`SELECT p.*, b.name brand, c.name category, v.sku, v.gtin, v.flavor, v.size, v.price_cents, v.promo_price_cents,
                                  v.promo_ends_at, v.cost_cents, v.stock, v.low_stock_threshold
                             FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
                             LEFT JOIN variants v ON v.product_id = p.id AND v.active = 1
                            ORDER BY p.name, v.sort, v.id`).all();
  const status = { draft: 'rascunho', active: 'publicado', archived: 'arquivado' };
  return toCsv(CSV_HEADER, rows.map((r) => ({
    produto_slug: r.slug, produto: r.name, marca: r.brand, categoria: r.category, apresentacao: r.presentation,
    status: status[r.status], destaque: r.featured ? 'sim' : '', novidade: r.is_new ? 'sim' : '', kit: r.is_kit ? 'sim' : '',
    descricao: r.description, sku: r.sku, gtin: r.gtin, sabor: r.flavor, tamanho: r.size,
    preco: centsToInput(r.price_cents), preco_promocional: centsToInput(r.promo_price_cents), promocao_ate: r.promo_ends_at || '',
    custo: centsToInput(r.cost_cents), estoque: r.stock ?? '', estoque_minimo: r.low_stock_threshold ?? '',
    fotos: JSON.parse(r.images_json || '[]').join(' | '),
  })));
}

const yes = (s) => /^(sim|s|1|true|x)$/i.test(String(s || '').trim());

/**
 * Importa CSV. Com apply=false apenas valida e mostra o que será feito.
 * Casa opções por GTIN, depois SKU, depois produto+sabor+tamanho.
 * Diferença de estoque gera movimento de ajuste rastreável.
 */
export function importCsv(db, text, { apply = false, userId = null } = {}) {
  const { header, records } = parseCsv(text);
  const missing = ['produto', 'preco'].filter((h) => !header.includes(h));
  if (missing.length) throw bad(`Colunas obrigatórias ausentes: ${missing.join(', ')}. Baixe o modelo pela exportação.`);
  const errors = [];
  const plan = [];
  for (const { line, data } of records) {
    try {
      const price = parseBRL(data.preco);
      if (price == null || price <= 0) throw new Error('preço inválido');
      if (data.gtin && !validateGtin(data.gtin).valid) throw new Error(`código de barras inválido (${validateGtin(data.gtin).error})`);
      const stock = data.estoque === '' || data.estoque == null ? null : Number(data.estoque);
      if (stock != null && (!Number.isInteger(stock) || stock < 0)) throw new Error('estoque deve ser inteiro ≥ 0');
      let existing = null;
      if (data.gtin) existing = db.prepare('SELECT * FROM variants WHERE gtin = ?').get(validateGtin(data.gtin).code);
      if (!existing && data.sku) existing = db.prepare('SELECT * FROM variants WHERE sku = ?').get(data.sku);
      if (!existing && data.produto_slug) {
        existing = db.prepare(`SELECT v.* FROM variants v JOIN products p ON p.id = v.product_id
                                WHERE p.slug = ? AND COALESCE(v.flavor,'') = ? AND COALESCE(v.size,'') = ?`).get(data.produto_slug, data.sabor || '', data.tamanho || '');
      }
      plan.push({ line, data, price, stock, existing, action: existing ? 'atualizar' : 'criar' });
    } catch (e) {
      errors.push({ line, message: e.message });
    }
  }
  const summary = { total: records.length, create: plan.filter((p) => p.action === 'criar').length, update: plan.filter((p) => p.action === 'atualizar').length, errors };
  if (!apply || errors.length) return { applied: false, ...summary };

  tx(db, () => {
    const statusMap = { rascunho: 'draft', publicado: 'active', arquivado: 'archived' };
    const productIdBySlug = new Map();
    for (const it of plan) {
      const d = it.data;
      let productId = it.existing?.product_id;
      if (!productId) {
        const key = d.produto_slug || slugify(`${d.produto} ${d.apresentacao || ''}`);
        productId = productIdBySlug.get(key) || db.prepare('SELECT id FROM products WHERE slug = ?').get(key)?.id;
        if (!productId) {
          const slug = uniqueSlug(db, 'products', d.produto_slug || `${d.produto} ${d.apresentacao || ''}`);
          productId = Number(db.prepare(`INSERT INTO products(slug, name, brand_id, category_id, presentation, description, status, featured, is_new, is_kit, images_json, updated_at)
                                         VALUES (?,?,?,?,?,?,'draft',?,?,?,?,?)`).run(
            slug, d.produto, findOrCreateBrand(db, d.marca), findOrCreateCategory(db, d.categoria), d.apresentacao || null, d.descricao || null,
            yes(d.destaque) ? 1 : 0, yes(d.novidade) ? 1 : 0, yes(d.kit) ? 1 : 0,
            JSON.stringify((d.fotos || '').split('|').map((s) => s.trim()).filter(Boolean)), nowIso()).lastInsertRowid);
        }
        productIdBySlug.set(key, productId);
      } else {
        db.prepare(`UPDATE products SET name = ?, brand_id = COALESCE(?, brand_id), category_id = COALESCE(?, category_id),
                    presentation = COALESCE(?, presentation), description = COALESCE(?, description), updated_at = ? WHERE id = ?`).run(
          d.produto, findOrCreateBrand(db, d.marca), findOrCreateCategory(db, d.categoria), d.apresentacao || null, d.descricao || null, nowIso(), productId);
      }
      const vals = [d.sku || null, d.gtin ? validateGtin(d.gtin).code : null, d.sabor || null, d.tamanho || null, it.price,
        parseBRL(d.preco_promocional), d.promocao_ate || null, parseBRL(d.custo), d.estoque_minimo === '' || d.estoque_minimo == null ? null : Number(d.estoque_minimo)];
      let variantId = it.existing?.id;
      if (variantId) {
        db.prepare(`UPDATE variants SET sku = COALESCE(?, sku), gtin = COALESCE(?, gtin), flavor = ?, size = ?, price_cents = ?, promo_price_cents = ?,
                    promo_ends_at = ?, cost_cents = COALESCE(?, cost_cents), low_stock_threshold = ?, active = 1 WHERE id = ?`).run(...vals, variantId);
      } else {
        variantId = Number(db.prepare(`INSERT INTO variants(product_id, sku, gtin, flavor, size, price_cents, promo_price_cents, promo_ends_at, cost_cents, low_stock_threshold)
                                       VALUES (?,?,?,?,?,?,?,?,?,?)`).run(productId, ...vals).lastInsertRowid);
      }
      if (it.stock != null) setStock(db, { variantId, target: it.stock, reason: 'Importação CSV', userId });
      if (d.status && statusMap[d.status.toLowerCase()]) {
        const target = statusMap[d.status.toLowerCase()];
        if (target === 'active') {
          const c = completeness(getAdminProduct(db, productId));
          db.prepare('UPDATE products SET status = ? WHERE id = ?').run(c.can_publish ? 'active' : 'draft', productId);
        } else db.prepare('UPDATE products SET status = ? WHERE id = ?').run(target, productId);
      }
    }
  });
  return { applied: true, ...summary };
}
