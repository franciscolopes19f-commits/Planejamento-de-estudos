// Consulta de dados por código de barras em fontes externas.
// Ler o código NÃO garante dados: cobertura varia por fonte e por produto, e tudo passa por revisão humana.
//
// Fontes preparadas:
//  - Open Food Facts: aberta e gratuita, sem chave. Base colaborativa; cobertura de suplementos no Brasil é parcial.
//    Licença dos dados: ODbL; imagens: CC BY-SA. Exige atribuição.
//  - Cosmos (Bluesoft): base brasileira de GTIN, tende a cobrir melhor produtos nacionais. Exige token (COSMOS_TOKEN);
//    há limite de consultas conforme o plano contratado.

import { nowIso } from './http.js';

const UA = 'NutauroCatalogo/0.1 (catalogo de loja; contato via painel)';
const CACHE_DAYS_FOUND = 30;
const CACHE_DAYS_MISS = 1;

export const PROVIDERS = {
  openfoodfacts: {
    label: 'Open Food Facts',
    attribution: 'Dados de Open Food Facts (ODbL). Base colaborativa: confira com o rótulo.',
    enabled: (settings) => settings.gtin.openfoodfacts_enabled !== false,
    configured: () => true,
    async fetch(code, { fetchImpl }) {
      const fields = 'product_name,product_name_pt,brands,image_front_url,image_url,quantity,generic_name,generic_name_pt,ingredients_text_pt,ingredients_text,categories';
      const r = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000),
      });
      if (r.status === 404) return { found: false };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.status !== 1 || !j.product) return { found: false };
      const p = j.product;
      return {
        found: true,
        fields: clean({
          name: p.product_name_pt || p.product_name,
          brand: (p.brands || '').split(',')[0]?.trim(),
          image_url: p.image_front_url || p.image_url,
          size: p.quantity,
          description: p.generic_name_pt || p.generic_name,
          ingredients: p.ingredients_text_pt || p.ingredients_text,
        }),
      };
    },
  },
  cosmos: {
    label: 'Cosmos (Bluesoft)',
    attribution: 'Dados da base Cosmos/Bluesoft: confira com a embalagem.',
    enabled: (settings) => settings.gtin.cosmos_enabled !== false,
    configured: (env) => !!env.COSMOS_TOKEN,
    async fetch(code, { fetchImpl, env }) {
      const r = await fetchImpl(`https://api.cosmos.bluesoft.com.br/gtins/${code}.json`, {
        headers: { 'X-Cosmos-Token': env.COSMOS_TOKEN, 'User-Agent': UA }, signal: AbortSignal.timeout(8000),
      });
      if (r.status === 404) return { found: false };
      if (r.status === 429) throw new Error('Limite de consultas do plano atingido');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = await r.json();
      return {
        found: !!p.description,
        fields: clean({
          name: p.description,
          brand: p.brand?.name,
          image_url: p.thumbnail,
          size: p.net_weight ? `${p.net_weight} g` : null,
        }),
      };
    },
  },
};

function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => [k, String(v).trim()]));
}

export function providerStatus(settings, env) {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, label: p.label, enabled: p.enabled(settings), configured: p.configured(env),
  }));
}

/** Consulta todas as fontes ativas e configuradas, com cache. Falhas de rede não interrompem o fluxo. */
export async function lookupExternal(db, code, { settings, env, fetchImpl = fetch, now = new Date() }) {
  const results = [];
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (!p.enabled(settings)) continue;
    if (!p.configured(env)) {
      results.push({ provider: id, label: p.label, status: 'not_configured' });
      continue;
    }
    const cached = db.prepare('SELECT * FROM gtin_cache WHERE gtin = ? AND provider = ?').get(code, id);
    if (cached) {
      const ageDays = (now - new Date(cached.fetched_at)) / 86_400_000;
      if (ageDays < (cached.found ? CACHE_DAYS_FOUND : CACHE_DAYS_MISS)) {
        const payload = JSON.parse(cached.payload || '{}');
        results.push({ provider: id, label: p.label, status: cached.found ? 'found' : 'not_found', fields: payload.fields, attribution: p.attribution, fetched_at: cached.fetched_at, cached: true });
        continue;
      }
    }
    try {
      const r = await p.fetch(code, { fetchImpl, env });
      const fetched = nowIso();
      db.prepare('INSERT OR REPLACE INTO gtin_cache(gtin, provider, found, payload, fetched_at) VALUES (?,?,?,?,?)')
        .run(code, id, r.found ? 1 : 0, JSON.stringify(r), fetched);
      results.push({ provider: id, label: p.label, status: r.found ? 'found' : 'not_found', fields: r.fields, attribution: p.attribution, fetched_at: fetched });
    } catch (e) {
      results.push({ provider: id, label: p.label, status: 'error', error: e.name === 'TimeoutError' ? 'Tempo esgotado' : 'Fonte indisponível no momento' });
    }
  }
  return results;
}
