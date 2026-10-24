import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SETTINGS = {
  store: {
    name: 'Nutauro Suplementos',
    tagline: 'Suplementação e nutrição esportiva',
    whatsapp: '', // ex.: 21999999999 — configurar no painel
    email: '',
    instagram: '',
    address: '',
    city: 'Duque de Caxias – RJ',
    cnpj: '',
    hours_text: '',
    public_url: '',
  },
  checkout: {
    mode: 'whatsapp', // 'whatsapp' | 'site' | 'both'
    whatsapp_reservation_minutes: 120,
    site_reservation_minutes: 30,
    min_order_cents: 0,
  },
  payments: {
    pix_discount_pct: 0,
    installments: { enabled: false, max: 0, min_installment_cents: 0, interest_free: true },
    provider: 'none', // 'none' | 'mercadopago' | 'demo'
    whatsapp_methods: ['pix', 'cash', 'card_on_delivery', 'combine'],
  },
  delivery: {
    timezone: 'America/Sao_Paulo',
    operating_days: [1, 2, 3, 4, 5, 6],
    holidays: [],
    prep_minutes: 60,
    zones: [
      {
        id: 'caxias', name: 'Duque de Caxias', active: true,
        cep_ranges: [['25000000', '25299999']],
        fee_cents: null, free_over_cents: null,
        sla: { type: 'same_day', cutoff: '15:00', fallback_business_days: 1 },
        note: '',
        admin_note: 'Faixa de CEP inicial (25000-000 a 25299-999) — confira antes de divulgar.',
      },
      {
        id: 'rio', name: 'Rio de Janeiro (regiões atendidas)', active: true,
        cep_ranges: [['20000000', '23799999']],
        fee_cents: null, free_over_cents: null,
        sla: { type: 'hours', hours: 48 },
        note: '',
        admin_note: 'Faixa inicial = município do Rio (20000-000 a 23799-999). Inclua/retire as regiões realmente atendidas.',
      },
      {
        id: 'brasil', name: 'Demais regiões do Brasil', active: true,
        cep_ranges: [['01000000', '99999999']],
        fee_cents: null, free_over_cents: null,
        sla: { type: 'carrier' },
        note: '',
      },
    ],
  },
  pickup: { enabled: true, address: '', estimate_text: '', instructions: '' },
  catalog: { show_out_of_stock: true, low_stock_default: 3, brands_section_enabled: false },
  gtin: { openfoodfacts_enabled: true, cosmos_enabled: true },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT NOT NULL DEFAULT 'owner',
  pass_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, logo TEXT, active INTEGER DEFAULT 1,
  show_in_home INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  brand_id INTEGER REFERENCES brands(id), category_id INTEGER REFERENCES categories(id),
  presentation TEXT, description TEXT, ingredients TEXT, allergens TEXT,
  nutrition_json TEXT, nutrition_source TEXT,
  images_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  featured INTEGER DEFAULT 0, is_new INTEGER DEFAULT 0, is_kit INTEGER DEFAULT 0,
  tags TEXT, data_source_json TEXT, is_demo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT, gtin TEXT, flavor TEXT, size TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  promo_price_cents INTEGER, promo_starts_at TEXT, promo_ends_at TEXT,
  cost_cents INTEGER,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER,
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_variants_gtin ON variants(gtin) WHERE gtin IS NOT NULL AND gtin <> '';
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY, variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, qty INTEGER NOT NULL, balance_after INTEGER NOT NULL,
  reason TEXT, unit_cost_cents INTEGER, order_id INTEGER, user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_mov_variant ON stock_movements(variant_id);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
-- Pedidos: status (fluxo comercial), payment_status (dinheiro), stock_state (estoque) são independentes.
-- channel prevê 'balcao' para a futura venda presencial com o mesmo estoque.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, public_token TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','site','balcao')),
  status TEXT NOT NULL DEFAULT 'novo',
  payment_status TEXT NOT NULL DEFAULT 'nao_iniciado',
  payment_method TEXT,
  stock_state TEXT NOT NULL DEFAULT 'reserved' CHECK (stock_state IN ('reserved','committed','released')),
  reservation_expires_at TEXT,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup','delivery')),
  customer_id INTEGER REFERENCES customers(id),
  customer_json TEXT NOT NULL, address_json TEXT, shipping_json TEXT,
  subtotal_cents INTEGER NOT NULL, promo_discount_cents INTEGER NOT NULL DEFAULT 0,
  pix_discount_cents INTEGER NOT NULL DEFAULT 0, shipping_cents INTEGER,
  total_cents INTEGER NOT NULL, total_is_final INTEGER NOT NULL DEFAULT 1,
  notes TEXT, admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id), product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL, brand TEXT, variant_label TEXT, sku TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0), regular_cents INTEGER NOT NULL, unit_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER, total_cents INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_variant ON order_items(variant_id);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, message TEXT, user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
-- Pagamentos: um pedido pode ter várias tentativas. Recebimento manual (Pix na conta, dinheiro) também entra aqui.
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL, provider_ref TEXT, method TEXT, status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, refunded_cents INTEGER NOT NULL DEFAULT 0, raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_ref ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;
-- Eventos recebidos dos provedores: chave única impede processar o mesmo evento duas vezes.
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY, provider TEXT NOT NULL, event_key TEXT NOT NULL, payload TEXT,
  result TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(provider, event_key));
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY, title TEXT, subtitle TEXT, cta_label TEXT, cta_link TEXT,
  image TEXT, image_mobile TEXT, image_note TEXT, image_position TEXT DEFAULT 'right',
  active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, starts_at TEXT, ends_at TEXT);
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, active INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0, max_items INTEGER DEFAULT 8, ref TEXT);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS gtin_cache (
  gtin TEXT NOT NULL, provider TEXT NOT NULL, found INTEGER NOT NULL, payload TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (gtin, provider));
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '1')").run();
  return db;
}

/** Executa fn dentro de uma transação exclusiva de escrita. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over ?? base;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = deepMerge(DEFAULT_SETTINGS[k], stored[k]);
  return out;
}

export function saveSetting(db, key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`Configuração desconhecida: ${key}`);
  db.prepare(
    "INSERT INTO settings(key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(key, JSON.stringify(value));
}
