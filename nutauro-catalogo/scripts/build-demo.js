// Gera dist/nutauro-demo.html: loja + painel em UM arquivo, sem servidor, para visualização.
// Uso: npm run build:demo   (requer a dependência de desenvolvimento esbuild)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { openDb, getSettings } from '../server/db.js';
import { seedBase, seedDemoProducts } from '../server/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');

// 1) Dados iniciais gerados pelo próprio código do servidor
const db = openDb(':memory:');
seedBase(db);
seedDemoProducts(db);
const settings = getSettings(db);
settings.checkout.mode = 'both';
settings.payments.provider = 'demo';
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const products = db.prepare('SELECT * FROM products').all().map((p) => ({
  ...p, images: parse(p.images_json, []), nutrition: parse(p.nutrition_json, null), data_source: parse(p.data_source_json, null),
  variants: db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id').all(p.id),
}));
for (const p of products) { delete p.images_json; delete p.nutrition_json; delete p.data_source_json; }
const max = (t) => db.prepare(`SELECT COALESCE(MAX(id),0) m FROM ${t}`).get().m;
const seed = {
  version: `demo-${Date.now()}`,
  settings,
  categories: db.prepare('SELECT * FROM categories').all(),
  brands: db.prepare('SELECT * FROM brands').all(),
  products,
  banners: db.prepare('SELECT * FROM banners').all(),
  sections: db.prepare('SELECT * FROM sections').all(),
  pages: db.prepare('SELECT * FROM pages').all(),
  movements: db.prepare('SELECT * FROM stock_movements ORDER BY id DESC').all(),
  orders: [], customers: [],
  seq: { product: max('products'), variant: max('variants'), brand: max('brands'), category: max('categories'), banner: max('banners'), mov: max('stock_movements'), order: 0, customer: 0 },
};

// 2) Empacota JS (imports "/shared/..." apontam para public/shared)
const alias = {
  name: 'abs-public',
  setup(b) {
    b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: path.join(PUB, a.path) }));
  },
};
const out = await esbuild.build({
  entryPoints: [path.join(ROOT, 'demo/entry.js')],
  bundle: true, write: false, format: 'iife', minify: true, target: 'es2020',
  loader: { '.html': 'text', '.css': 'text' },
  plugins: [alias],
});
let js = out.outputFiles[0].text;

// 3) Embute fontes e imagens como data URI (arquivo único)
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const cache = new Map();
const dataUri = (rel) => {
  if (cache.has(rel)) return cache.get(rel);
  const f = path.join(PUB, rel);
  const uri = `data:${mime[path.extname(f)]};base64,${fs.readFileSync(f).toString('base64')}`;
  cache.set(rel, uri);
  return uri;
};
const inline = (s) => s.replace(/\/(assets|fonts)\/[\w\-./]+\.(png|jpg|svg|woff2)/g, (m) => (fs.existsSync(path.join(PUB, m)) ? dataUri(m) : m));
js = inline(js);
const seedJson = inline(JSON.stringify(seed)).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0b0a">
<meta name="robots" content="noindex">
<title>Nutauro Suplementos (demonstração)</title>
<style id="app-css"></style>
</head>
<body>
<script>window.NT_DEMO_SEED = ${seedJson};</script>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const file = path.join(ROOT, 'dist/nutauro-demo.html');
fs.writeFileSync(file, html);
console.log(`Demonstração gerada: ${path.relative(ROOT, file)} (${(html.length / 1024).toFixed(0)} KB)`);
