// Radar de concursos: classificação por situação, filtro por preferências e remoção de duplicatas.
import { todayISO, diffDays } from './time.js';

export const AREAS = {
  fiscal: 'Fiscal', contabil: 'Contábil', financeira: 'Financeira', controle: 'Controle', policial: 'Policial', outra: 'Outra',
};

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
export const LOCAIS = ['Federal', ...UFS];

export const SITUACOES = [
  { id: 'previsto', label: 'Previsto' },
  { id: 'edital', label: 'Edital publicado' },
  { id: 'abertas', label: 'Inscrições abertas' },
  { id: 'encerradas', label: 'Inscrições encerradas' },
  { id: 'prova_proxima', label: 'Prova próxima' },
];
export const SITUACAO_LABEL = Object.fromEntries(SITUACOES.map(s => [s.id, s.label]));

export const CONFIABILIDADE = {
  oficial: { label: 'Oficial', desc: 'Conferido no edital ou página oficial do órgão/banca' },
  noticia: { label: 'Notícia', desc: 'Divulgado por veículo especializado; confirme no edital' },
  previsao: { label: 'Previsão', desc: 'Pedido, autorização ou expectativa; ainda não confirmado' },
};

export const MY_STATUS = [
  { id: 'interesse', label: 'Tenho interesse' },
  { id: 'vou_inscrever', label: 'Vou me inscrever' },
  { id: 'inscrito', label: 'Inscrito' },
  { id: 'prova_realizada', label: 'Prova realizada' },
  { id: 'desisti', label: 'Desisti' },
];
export const MY_STATUS_LABEL = Object.fromEntries(MY_STATUS.map(s => [s.id, s.label]));

// Situação calculada a partir das datas; o campo "situacao" informado vale como piso (ex.: edital publicado sem datas).
export function situacao(c, today = todayISO()) {
  const { inscInicio, inscFim, prova } = c;
  if (prova && prova >= today && diffDays(prova, today) <= 45 && (!inscFim || inscFim < today)) return 'prova_proxima';
  if (inscInicio && inscFim && inscInicio <= today && today <= inscFim) return 'abertas';
  if (!inscInicio && inscFim && today <= inscFim && c.situacao === 'abertas') return 'abertas';
  if (inscFim && inscFim < today) return 'encerradas';
  if (prova && prova < today) return 'encerradas';
  if (inscInicio && inscInicio > today) return 'edital';
  return c.situacao && SITUACAO_LABEL[c.situacao] ? c.situacao : 'previsto';
}

export function normalize(s = '') {
  return s.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function dedupeKey(c) {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em']);
  const cargo = normalize(c.cargo).split(' ').filter(w => w && !stop.has(w)).slice(0, 2).join(' ');
  return `${normalize(c.orgao)}|${cargo}|${normalize(c.local)}`;
}

export function matchesPrefs(c, prefs) {
  if (!prefs) return true;
  if (prefs.excluirLocais?.includes(c.local)) return false;
  if (prefs.locais?.length && !prefs.locais.includes(c.local)) return false;
  if (prefs.areas?.length && c.area && !prefs.areas.includes(c.area)) return false;
  if (prefs.cargos?.length && c.cargo) {
    const cargo = normalize(c.cargo);
    const ok = prefs.cargos.some(k => cargo.includes(normalize(k)));
    if (!ok) return false;
  }
  return true;
}

// Junta concursos do radar (arquivo publicado) com os cadastrados/editados pelo usuário.
// Um concurso do usuário com o mesmo id ou a mesma chave substitui o do radar.
export function mergeContests(radarList = [], userList = [], hidden = []) {
  const out = new Map();
  for (const c of radarList) {
    if (hidden.includes(c.id)) continue;
    out.set(c.id, { ...c, origem: 'radar' });
  }
  const byKey = new Map([...out.values()].map(c => [dedupeKey(c), c.id]));
  for (const c of userList) {
    const sameId = out.has(c.id) ? c.id : null;
    const sameKey = byKey.get(dedupeKey(c));
    const target = sameId || sameKey;
    if (target) {
      const base = out.get(target);
      out.delete(target);
      out.set(c.id, { ...base, ...c, origem: c.origem || 'manual', radarId: base.id });
    } else {
      out.set(c.id, { ...c, origem: c.origem || 'manual' });
    }
  }
  return [...out.values()];
}

export function findDuplicate(candidate, list) {
  const k = dedupeKey(candidate);
  return list.find(c => c.id !== candidate.id && dedupeKey(c) === k) || null;
}

export function searchContests(list, { q = '', situacao: sit = '', area = '', local = '', onlyPrefs = false, prefs = null } = {}, today = todayISO()) {
  const nq = normalize(q);
  return list.filter(c => {
    if (onlyPrefs && !matchesPrefs(c, prefs)) return false;
    if (sit && situacao(c, today) !== sit) return false;
    if (area && c.area !== area) return false;
    if (local && c.local !== local) return false;
    if (nq) {
      const hay = normalize([c.orgao, c.cargo, c.local, c.banca, c.obs].join(' '));
      if (!nq.split(' ').every(w => hay.includes(w))) return false;
    }
    return true;
  });
}

export function nextDate(c, today = todayISO()) {
  const ds = [c.inscFim, c.prova].filter(d => d && d >= today).sort();
  return ds[0] || null;
}
