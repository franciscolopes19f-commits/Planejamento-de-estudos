#!/usr/bin/env node
// Atualização automática do radar de concursos.
// Roda no GitHub Actions (agendado) e grava app/data/radar.json, que o app publicado lê.
//
// O que faz:
//  1. Lê os feeds RSS listados em scripts/radar-fontes.json (blogs/portais especializados).
//  2. Mantém só notícias sobre concursos das áreas de interesse (fiscal, contábil, financeira, controle, policial).
//  3. Detecta UF/esfera, remove duplicatas e guarda título, link, fonte e data — sem inventar vagas,
//     salários ou datas. Essas notícias aparecem no app como "a confirmar".
//  4. Preserva a lista "concursos" (itens conferidos manualmente) e registra o status de cada fonte.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RADAR = path.join(ROOT, 'app/data/radar.json');
const FONTES = path.join(ROOT, 'scripts/radar-fontes.json');
const MAX_DAYS = 60, MAX_ITEMS = 150;

export const AREA_KEYWORDS = {
  fiscal: ['sefaz', 'receita federal', 'receita estadual', 'auditor fiscal', 'auditor-fiscal', 'fiscal de tributos', 'fiscal de rendas', 'iss ', 'icms', 'tributári', 'fazenda', 'sefin', 'semef', 'agente fiscal'],
  contabil: ['contador', 'contábil', 'contabilidade', 'ciências contábeis'],
  financeira: ['bacen', 'banco central', 'tesouro', 'cvm', 'susep', 'finanças', 'planejamento e orçamento', ' apo ', 'analista financeiro', 'bndes', 'previc'],
  controle: ['tce', 'tcm', 'tcu', 'cgu', 'cge', 'controladoria', 'controle externo', 'controle interno', 'tribunal de contas'],
  policial: ['polícia federal', ' pf ', 'pf:', 'prf', 'polícia rodoviária', 'polícia civil', 'pcerj', 'pc rj', 'pc-rj', 'pc rs', 'pc sc', 'pc pr', 'polícia penal', 'polícia militar', 'pm ', 'delegado', 'escrivão', 'inspetor de polícia', 'papiloscopista', 'perito criminal'],
};
const UF_NAMES = {
  AC: 'acre', AL: 'alagoas', AP: 'amapá', AM: 'amazonas', BA: 'bahia', CE: 'ceará', DF: 'distrito federal', ES: 'espírito santo', GO: 'goiás',
  MA: 'maranhão', MT: 'mato grosso', MS: 'mato grosso do sul', MG: 'minas gerais', PA: 'pará', PB: 'paraíba', PR: 'paraná', PE: 'pernambuco',
  PI: 'piauí', RJ: 'rio de janeiro', RN: 'rio grande do norte', RS: 'rio grande do sul', RO: 'rondônia', RR: 'roraima', SC: 'santa catarina',
  SP: 'são paulo', SE: 'sergipe', TO: 'tocantins',
};
const FEDERAL = ['polícia federal', ' pf ', 'pf:', 'prf', 'receita federal', 'tcu', 'cgu', 'bacen', 'banco central', 'tesouro nacional', 'cvm', 'susep', 'inss', 'ministério', 'federal', 'bndes', 'previc'];

function decode(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const b of blocks) {
    const get = tag => { const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? decode(m[1]) : ''; };
    let link = get('link');
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/); link = m ? m[1] : ''; }
    const date = get('pubDate') || get('published') || get('updated') || get('dc:date');
    items.push({ titulo: get('title'), link: link.trim(), data: date ? new Date(date) : null, resumo: get('description').slice(0, 400) });
  }
  return items;
}

const norm = s => ` ${s.toLowerCase().normalize('NFC').replace(/[–—]/g, '-')} `;

export function classify(item) {
  const t = norm(item.titulo);
  const full = norm(`${item.titulo} ${item.resumo || ''}`);
  if (!/concurso|edital|inscri|vagas|certame|seleção/.test(t)) return null;
  let area = null;
  for (const [k, words] of Object.entries(AREA_KEYWORDS)) if (words.some(w => t.includes(w))) { area = k; break; }
  if (!area) return null;
  let uf = null;
  const m = t.match(/[\s(/-](AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)[\s):,/-]/i);
  if (m && !/^(pa|pe|to|se|ma|es|al)$/i.test(m[1])) uf = m[1].toUpperCase();
  else if (m && item.titulo.includes(m[1].toUpperCase())) uf = m[1].toUpperCase(); // siglas ambíguas só em maiúsculas
  if (!uf) for (const [k, name] of Object.entries(UF_NAMES).sort((a, b) => b[1].length - a[1].length)) if (full.includes(name)) { uf = k; break; }
  if (!uf && FEDERAL.some(w => t.includes(w))) uf = 'Federal';
  const om = item.titulo.match(/concurso\s+(?:d[aoe]s?\s+)?([^:–—,|]+?)(?:\s+20\d\d|\s*[:–—,|]|$)/i);
  const orgao = om ? om[1].trim().replace(/\s+(tem|abre|sai|terá|deve|pode|é|está|recebe|divulga|publica|confirma)\b.*$/i, '').slice(0, 60) : '';
  return { area, uf, orgao };
}

const titleKey = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3).slice(0, 8).join(' ');

async function fetchText(url) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'RumoRadar/1.0 (+uso pessoal; atualização 2x ao dia)', Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(tm); }
}

export async function run({ now = new Date(), fetcher = fetchText } = {}) {
  const radar = JSON.parse(await readFile(RADAR, 'utf8'));
  const fontes = JSON.parse(await readFile(FONTES, 'utf8'));
  const cutoff = new Date(now.getTime() - MAX_DAYS * 86400000);
  const byLink = new Map((radar.noticias || []).map(n => [n.link, n]));
  const byTitle = new Set([...byLink.values()].map(n => titleKey(n.titulo)));
  const status = [];
  for (const f of fontes) {
    const st = { nome: f.nome, url: f.url, ok: false, itens: 0, consultadoEm: now.toISOString() };
    try {
      const items = parseFeed(await fetcher(f.url));
      for (const it of items) {
        if (!it.link || !it.titulo || (it.data && it.data < cutoff)) continue;
        const c = classify(it); if (!c) continue;
        const k = titleKey(it.titulo);
        if (byLink.has(it.link) || byTitle.has(k)) continue;
        byLink.set(it.link, { titulo: it.titulo, link: it.link, fonte: f.nome, data: it.data ? it.data.toISOString().slice(0, 10) : now.toISOString().slice(0, 10), uf: c.uf, area: c.area, orgao: c.orgao, confiabilidade: 'noticia' });
        byTitle.add(k); st.itens++;
      }
      st.ok = true;
    } catch (e) { st.erro = String(e.message || e).slice(0, 120); }
    status.push(st);
  }
  const noticias = [...byLink.values()].filter(n => new Date(n.data) >= cutoff).sort((a, b) => b.data.localeCompare(a.data)).slice(0, MAX_ITEMS);
  radar.noticias = noticias;
  radar.fontes = status;
  if (status.some(s => s.ok)) radar.atualizadoEm = now.toISOString();
  await writeFile(RADAR, JSON.stringify(radar, null, 2) + '\n');
  return { novas: status.reduce((a, s) => a + s.itens, 0), status };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().then(r => {
    for (const s of r.status) console.log(`${s.ok ? 'OK ' : 'ERRO'} ${s.nome}: ${s.ok ? `${s.itens} nova(s)` : s.erro}`);
    console.log(`Total de notícias novas: ${r.novas}`);
  }).catch(e => { console.error(e); process.exit(1); });
}
