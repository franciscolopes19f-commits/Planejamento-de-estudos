// Indicadores de estudo: tempo, questões, constância e progresso no edital.
import { todayISO, addDays, weekStart, rangeDays, diffDays } from './time.js';

export function minutesByDay(state, from, to) {
  const out = {};
  for (const d of rangeDays(from, diffDays(to, from) + 1)) out[d] = 0;
  for (const l of state.logs) if (l.date >= from && l.date <= to) out[l.date] += (l.durSec || 0) / 60;
  return out;
}

export function minutesOn(state, date) { return state.logs.filter(l => l.date === date).reduce((a, l) => a + (l.durSec || 0) / 60, 0); }

export function weekMinutes(state, today = todayISO()) {
  const ws = weekStart(today);
  return state.logs.filter(l => l.date >= ws && l.date <= addDays(ws, 6)).reduce((a, l) => a + (l.durSec || 0) / 60, 0);
}

export function activeDaysInWeek(state, today = todayISO()) {
  const ws = weekStart(today);
  return new Set(state.logs.filter(l => l.date >= ws && l.date <= today && l.durSec >= 600).map(l => l.date)).size;
}

// Sequência de dias com pelo menos 15 min de estudo. Hoje ainda "não quebra" a sequência.
export function streak(state, today = todayISO()) {
  const byDay = {};
  for (const l of state.logs) byDay[l.date] = (byDay[l.date] || 0) + (l.durSec || 0) / 60;
  let d = (byDay[today] || 0) >= 15 ? today : addDays(today, -1);
  let n = 0;
  while ((byDay[d] || 0) >= 15) { n++; d = addDays(d, -1); }
  let best = 0, cur = 0;
  const days = Object.keys(byDay).sort();
  if (days.length) {
    for (let x = days[0]; x <= today; x = addDays(x, 1)) { cur = (byDay[x] || 0) >= 15 ? cur + 1 : 0; best = Math.max(best, cur); }
  }
  return { current: n, best, studiedToday: (byDay[today] || 0) >= 15 };
}

export function daysSinceLastStudy(state, today = todayISO()) {
  const last = state.logs.reduce((m, l) => (l.date > m ? l.date : m), '');
  return last ? diffDays(today, last) : null;
}

export function questionTotals(state, from = '0000', to = '9999') {
  let q = 0, ok = 0, err = 0;
  for (const l of state.logs) if (l.date >= from && l.date <= to) { q += l.questoes || 0; ok += l.acertos || 0; err += l.erros || 0; }
  return { q, ok, err, acc: q ? ok / q : null };
}

export function bySubject(state) {
  return state.subjects.map(s => {
    let min = 0, q = 0, ok = 0, err = 0;
    for (const l of state.logs) if (l.subjectId === s.id) { min += (l.durSec || 0) / 60; q += l.questoes || 0; ok += l.acertos || 0; err += l.erros || 0; }
    const total = s.topics.length, done = s.topics.filter(t => t.done).length;
    return { id: s.id, nome: s.nome, min, q, ok, err, acc: q ? ok / q : null, errRate: q ? err / q : null, total, done, pct: total ? done / total : 0 };
  });
}

export function editalProgress(state, contestId = null) {
  const subs = contestId ? state.subjects.filter(s => !s.contestIds?.length || s.contestIds.includes(contestId)) : state.subjects;
  const total = subs.reduce((a, s) => a + s.topics.length, 0);
  const done = subs.reduce((a, s) => a + s.topics.filter(t => t.done).length, 0);
  return { total, done, pct: total ? done / total : 0 };
}

export function weeklySeries(state, weeks = 8, today = todayISO()) {
  const ws = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const s = addDays(ws, -7 * (weeks - 1 - i));
    const e = addDays(s, 6);
    const min = state.logs.filter(l => l.date >= s && l.date <= e).reduce((a, l) => a + (l.durSec || 0) / 60, 0);
    return { start: s, min };
  });
}

const FRASES = [
  'Constância vence intensidade.',
  'Um bloco bem feito hoje vale mais que um plano perfeito amanhã.',
  'Seu futuro cargo está sendo construído agora, uma questão por vez.',
  'Errar na questão é acertar na prova.',
  'Pouco todo dia é muito no fim do edital.',
  'Não precisa ser fácil, só precisa ser feito.',
  'Revisão é o que transforma estudo em aprovação.',
  'Dia corrido? 25 minutos já mantêm a engrenagem girando.',
  'Quem estuda com método não depende de motivação.',
  'A aprovação é a soma de dias comuns bem aproveitados.',
];
export function fraseDoDia(today = todayISO()) {
  const n = today.split('-').reduce((a, x) => a + Number(x), 0);
  return FRASES[n % FRASES.length];
}

// Mensagem gentil de retomada, sem culpa.
export function comebackMessage(state, today = todayISO()) {
  const gap = daysSinceLastStudy(state, today);
  if (gap == null) return 'Primeiro passo: faça um bloco curto hoje e registre. O plano se ajusta a você.';
  if (gap <= 1) return null;
  if (gap === 2) return 'Ontem não rolou — tudo bem. Um bloco de 25 minutos hoje já retoma o ritmo.';
  return `Faz ${gap} dias desde o último estudo. Recomece leve: escolha a primeira sessão de hoje e só dê o play.`;
}
