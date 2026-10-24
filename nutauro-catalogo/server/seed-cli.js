// Recria os produtos de demonstração em um banco vazio de produtos: npm run seed:demo
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { seedBase, seedDemoProducts } from './seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(path.join(path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')), 'nutauro.db'));
seedBase(db);
const n = seedDemoProducts(db);
console.log(n ? `${n} produtos de demonstração criados.` : 'Já existem produtos cadastrados; nada foi alterado.');
