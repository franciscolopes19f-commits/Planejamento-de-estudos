// Dados iniciais: categorias sugeridas, seções da vitrine, banner com o mascote, páginas institucionais
// em rascunho e — opcionalmente — poucos produtos ILUSTRATIVOS marcados como demonstração.

import { gtinCheckDigit } from '../public/shared/gtin.js';
import { saveProduct } from './admin-products.js';
import { tx } from './db.js';

export const CATEGORIES = [
  ['whey-protein', 'Whey Protein'], ['creatina', 'Creatina'], ['pre-treino', 'Pré-treino'], ['vitaminas', 'Vitaminas'],
  ['hipercaloricos', 'Hipercalóricos'], ['barras-e-snacks', 'Barras e Snacks'], ['acessorios', 'Acessórios'],
];

const PAGE_PLACEHOLDER = (topic) => `[Texto a ser preenchido e validado pela Nutauro: ${topic}.]`;

export function seedBase(db) {
  if (db.prepare('SELECT COUNT(*) n FROM categories').get().n === 0) {
    const ins = db.prepare('INSERT INTO categories(slug, name, sort) VALUES (?,?,?)');
    CATEGORIES.forEach(([slug, name], i) => ins.run(slug, name, i + 1));
  }
  if (db.prepare('SELECT COUNT(*) n FROM sections').get().n === 0) {
    const ins = db.prepare('INSERT INTO sections(kind, title, sort, max_items) VALUES (?,?,?,?)');
    [['offers', 'Ofertas'], ['featured', 'Destaques'], ['new', 'Novidades'], ['kits', 'Kits']].forEach(([k, t], i) => ins.run(k, t, i + 1, 8));
  }
  if (db.prepare('SELECT COUNT(*) n FROM banners').get().n === 0) {
    db.prepare(`INSERT INTO banners(title, subtitle, cta_label, cta_link, image, image_note, image_position, active, sort) VALUES (?,?,?,?,?,?,?,1,1)`).run(
      'Suplementação com atendimento de verdade',
      'Escolha sabor e tamanho, monte o carrinho e finalize com a equipe Nutauro.',
      'Ver produtos', '/produtos',
      '/assets/mascote/mascote-provisorio.jpg',
      'ARTE PROVISÓRIA: recorte da composição enviada. Substitua pelo arquivo final licenciado do mascote (PNG/WebP, mín. 1600×1600 px, fundo transparente ou preto).',
      'right',
    );
  }
  if (db.prepare('SELECT COUNT(*) n FROM pages').get().n === 0) {
    const ins = db.prepare('INSERT INTO pages(slug, title, body, published) VALUES (?,?,?,0)');
    ins.run('sobre', 'Sobre a Nutauro', PAGE_PLACEHOLDER('história da loja, endereço, CNPJ e horário de funcionamento'));
    ins.run('entregas', 'Entregas e retirada', PAGE_PLACEHOLDER('regiões atendidas, prazos, taxas e regras de retirada'));
    ins.run('trocas', 'Trocas e devoluções', PAGE_PLACEHOLDER('política de trocas e direito de arrependimento (CDC, art. 49)'));
    ins.run('privacidade', 'Privacidade', PAGE_PLACEHOLDER('quais dados são coletados, para quê, por quanto tempo e como solicitar exclusão (LGPD)'));
    ins.run('atendimento', 'Atendimento', PAGE_PLACEHOLDER('canais e horários de atendimento'));
  }
}

const DESC = 'Produto ilustrativo para demonstração do catálogo. Substitua por um produto real com os dados do fabricante.';

const DEMO = [
  { name: 'Whey Protein Concentrado', brand: 'Fabricante Demo A', cat: 'Whey Protein', presentation: 'Pote 900 g', img: 'whey', featured: 1,
    variants: [['Chocolate', '900 g', 12990, 11990, 8500, 8], ['Baunilha', '900 g', 12990, null, 8500, 5], ['Morango', '900 g', 12990, null, 8500, 0]] },
  { name: 'Creatina Monohidratada', brand: 'Fabricante Demo B', cat: 'Creatina', presentation: 'Pote', img: 'creatina', featured: 1,
    variants: [[null, '150 g', 5990, null, 3500, 10], [null, '300 g', 9990, 8990, 6200, 6]] },
  { name: 'Pré-treino em pó', brand: 'Fabricante Demo A', cat: 'Pré-treino', presentation: 'Pote 300 g', img: 'pre-treino', is_new: 1,
    variants: [['Frutas vermelhas', '300 g', 10990, null, 6800, 4], ['Limão', '300 g', 10990, null, 6800, 2]] },
  { name: 'Multivitamínico', brand: 'Fabricante Demo C', cat: 'Vitaminas', presentation: 'Frasco 60 cápsulas', img: 'vitaminas',
    variants: [[null, '60 cápsulas', 4990, null, 2600, 15]] },
  { name: 'Hipercalórico', brand: 'Fabricante Demo B', cat: 'Hipercalóricos', presentation: 'Embalagem 3 kg', img: 'hipercalorico', is_new: 1,
    variants: [['Chocolate', '3 kg', 13990, null, 9000, 3], ['Baunilha', '3 kg', 13990, null, 9000, 3]] },
  { name: 'Barra de proteína', brand: 'Fabricante Demo C', cat: 'Barras e Snacks', presentation: 'Caixa com 12 unidades', img: 'barra',
    variants: [['Cookies', 'Caixa 12 un.', 8990, null, 5600, 6], ['Amendoim', 'Caixa 12 un.', 8990, null, 5600, 4]] },
  { name: 'Coqueteleira', brand: 'Fabricante Demo C', cat: 'Acessórios', presentation: '600 ml', img: 'coqueteleira',
    variants: [[null, '600 ml', 2990, null, 1200, 20]] },
  { name: 'Kit Whey + Creatina', brand: 'Fabricante Demo A', cat: 'Whey Protein', presentation: 'Whey 900 g + Creatina 300 g', img: 'kit', is_kit: 1, featured: 1,
    variants: [['Chocolate', 'Kit', 21990, 19990, 14700, 3]] },
  { name: 'Glutamina', brand: 'Fabricante Demo B', cat: 'Vitaminas', presentation: 'Pote 300 g', img: 'glutamina',
    variants: [[null, '300 g', 7990, null, 4500, 0]] },
];

// Códigos fictícios na faixa 200–299 (GS1: circulação restrita/uso interno), para não coincidir com produtos reais.
let demoSeq = 0;
export function demoGtin(n = ++demoSeq) {
  const body = `200${String(n).padStart(9, '0')}`;
  return body + gtinCheckDigit(body);
}

/** Produtos de demonstração. Marcados com is_demo para remoção em um clique no painel. */
export function seedDemoProducts(db) {
  if (db.prepare('SELECT COUNT(*) n FROM products').get().n > 0) return 0;
  demoSeq = 0;
  for (const p of DEMO) {
    const saved = saveProduct(db, {
      name: p.name, brand_name: p.brand, category_name: p.cat, presentation: p.presentation, description: DESC,
      images: [`/assets/demo/${p.img}.svg`], status: 'active', featured: p.featured, is_new: p.is_new, is_kit: p.is_kit,
      variants: p.variants.map(([flavor, size, price, promo, cost, stock], i) => ({
        flavor, size, price_cents: price, promo_price_cents: promo, cost_cents: cost, initial_stock: stock,
        sku: `DEMO-${p.img.toUpperCase()}-${i + 1}`,
        gtin: demoGtin(),
      })),
    });
    tx(db, () => {
      db.prepare('UPDATE products SET is_demo = 1 WHERE id = ?').run(saved.id);
      db.prepare('UPDATE brands SET is_demo = 1 WHERE id = ?').run(saved.brand_id);
    });
  }
  return DEMO.length;
}

export function removeDemoData(db) {
  return tx(db, () => {
    const ids = db.prepare('SELECT id FROM products WHERE is_demo = 1').all().map((r) => r.id);
    let removed = 0;
    let archived = 0;
    for (const id of ids) {
      const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(id);
      if (used) {
        db.prepare("UPDATE products SET status = 'archived' WHERE id = ?").run(id);
        archived++;
      } else {
        db.prepare('DELETE FROM stock_movements WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)').run(id);
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        removed++;
      }
    }
    db.prepare('DELETE FROM brands WHERE is_demo = 1 AND id NOT IN (SELECT brand_id FROM products WHERE brand_id IS NOT NULL)').run();
    return { removed, archived };
  });
}

