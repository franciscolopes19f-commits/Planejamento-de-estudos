// Geração do plano de estudos: respeita janelas livres, compromissos, meta semanal,
// peso/dificuldade das matérias, desempenho em questões e proximidade da prova.
import { todayISO, addDays, dow, diffDays, hmToMin, minToHM, rangeDays, weekStart, nowHM } from './time.js';

export const MODALIDADES = {
  teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão', simulado: 'Simulado',
};

const MIN_BLOCK = 20;

function eventOnDate(ev, date) {
  if (ev.date) return ev.date === date;
  return Array.isArray(ev.dows) && ev.dows.includes(dow(date));
}

export function eventsOn(state, date) {
  return state.events.filter(e => eventOnDate(e, date)).sort((a, b) => a.start.localeCompare(b.start));
}

function subtract(intervals, busy) {
  let out = intervals.map(i => [...i]);
  for (const [bs, be] of busy) {
    const next = [];
    for (const [s, e] of out) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    out = next;
  }
  return out.filter(([s, e]) => e - s >= MIN_BLOCK).sort((a, b) => a[0] - b[0]);
}

// Janelas livres de um dia = disponibilidade − compromissos − sessões já marcadas.
export function freeSlots(state, date, { ignoreSessions = false, extraBusy = [] } = {}) {
  const avail = state.availability.filter(a => a.dow === dow(date)).map(a => [hmToMin(a.start), hmToMin(a.end)]);
  const busy = eventsOn(state, date).map(e => [hmToMin(e.start), hmToMin(e.end)]);
  if (!ignoreSessions) {
    for (const s of state.plan.sessions) {
      if (s.date === date && s.status !== 'descartado' && s.status !== 'recuperado' && s.start) busy.push([hmToMin(s.start), hmToMin(s.start) + s.dur]);
    }
  }
  busy.push(...extraBusy);
  return subtract(avail, busy);
}

export function subjectStats(state, today = todayISO()) {
  const from = addDays(today, -60);
  const map = {};
  for (const s of state.subjects) map[s.id] = { q: 0, ok: 0, err: 0, min: 0, lastDate: null };
  for (const l of state.logs) {
    const m = map[l.subjectId]; if (!m) continue;
    m.min += (l.durSec || 0) / 60;
    if (!m.lastDate || l.date > m.lastDate) m.lastDate = l.date;
    if (l.date >= from) { m.q += l.questoes || 0; m.ok += l.acertos || 0; m.err += l.erros || 0; }
  }
  for (const id in map) { const m = map[id]; m.errRate = m.q ? m.err / m.q : 0; m.acc = m.q ? m.ok / m.q : null; }
  return map;
}

// Concurso-alvo: o de prova mais próxima entre os que estou acompanhando ativamente.
export function targetContests(state, contests, today = todayISO()) {
  const active = ['interesse', 'vou_inscrever', 'inscrito'];
  return contests
    .filter(c => state.my[c.id] && active.includes(state.my[c.id].status))
    .map(c => ({ ...c, examDate: c.prova && c.prova >= today ? c.prova : null }))
    .sort((a, b) => {
      const pa = a.id === state.profile.targetContestId ? 0 : 1, pb = b.id === state.profile.targetContestId ? 0 : 1;
      return pa - pb || (a.examDate || '9999').localeCompare(b.examDate || '9999');
    });
}

export function subjectPriority(subject, stats, examDays = null) {
  const st = stats[subject.id] || { errRate: 0, q: 0 };
  const total = subject.topics.length || 1;
  const remaining = subject.topics.filter(t => !t.done).length / total;
  let score = (subject.peso || 3) * (0.6 + 0.2 * (subject.dificuldade || 3)) * (1 + 1.5 * st.errRate) * (0.45 + 0.55 * remaining);
  if (examDays != null) score *= 1 + 30 / Math.max(examDays, 15); // prova perto: prioriza as matérias do concurso-alvo
  return score;
}

// Concurso de referência da matéria: o prioritário (se a matéria cai nele) ou o de prova mais próxima.
function examDaysFor(subject, targets, today) {
  const applies = c => !subject.contestIds?.length || subject.contestIds.includes(c.id);
  const prio = targets[0] && targets[0].id && applies(targets[0]) ? targets[0] : null;
  const t = prio?.examDate ? prio : targets.find(c => c.examDate && applies(c));
  const days = t ? diffDays(t.examDate, today) : prio ? 60 : null; // prioridade sem data de prova: trata como prova em ~2 meses
  return { days, contestId: (prio || t || targets[0])?.id || null };
}

function lastModality(state, topicId) {
  let last = null;
  for (const l of state.logs) if (l.topicId === topicId && (!last || l.date >= last.date)) last = l;
  return last?.modalidade || null;
}

// Orçamento de minutos por dia: a meta semanal é repartida entre os dias de cada semana
// (segunda a domingo) proporcionalmente ao tempo livre de cada dia.
export function dayBudgets(state, days) {
  const freeOf = d => freeSlots(state, d, { ignoreSessions: true }).reduce((a, [s, e]) => a + e - s, 0);
  const weekly = state.profile.weeklyGoalMin || 600;
  const weekFree = {};
  return days.map(d => {
    const ws = weekStart(d);
    if (weekFree[ws] == null) weekFree[ws] = rangeDays(ws, 7).reduce((a, x) => a + freeOf(x), 0) || 1;
    const f = freeOf(d);
    return Math.min(f, Math.round((weekly * f) / weekFree[ws]));
  });
}

/**
 * Gera (ou regenera) o plano para `days` dias a partir de `start`.
 * Mantém sessões concluídas, travadas (editadas por mim) e as do passado.
 */
export function generatePlan(state, contests, { start = todayISO(), days = 7, uid } = {}) {
  const today = todayISO();
  const period = rangeDays(start, days);
  const keep = state.plan.sessions.filter(s => s.date < start || s.date > period[period.length - 1] || s.status !== 'pendente' || s.locked);
  state.plan.sessions = keep;

  const subjects = state.subjects.filter(s => s.topics.length && !s.paused);
  if (!subjects.length) { state.plan.generatedAt = new Date().toISOString(); return state.plan; }

  const stats = subjectStats(state, today);
  const targets = targetContests(state, contests, today);
  const meta = Object.fromEntries(subjects.map(s => [s.id, examDaysFor(s, targets, today)]));
  const prio = Object.fromEntries(subjects.map(s => [s.id, subjectPriority(s, stats, meta[s.id].days)]));
  const prioSum = Object.values(prio).reduce((a, b) => a + b, 0);
  const allocated = Object.fromEntries(subjects.map(s => [s.id, 0]));
  let allocatedTotal = 0;
  const usedTopics = new Set(keep.filter(s => s.status === 'pendente').map(s => s.topicId));
  const followUps = {}; // subjectId -> [{topicId, modalidade}] (ex.: questões depois da teoria)
  const budgets = dayBudgets(state, period);
  const nearestExam = Math.min(...Object.values(meta).map(m => m.days ?? 9999));
  let simuladoThisWeek = keep.some(s => s.modalidade === 'simulado' && period.includes(s.date));
  const reviewsQueued = new Set(keep.map(s => s.reviewId).filter(Boolean));
  const sessionMin = state.profile.sessionMin || 50;

  period.forEach((date, di) => {
    let budget = budgets[di] - keep.filter(s => s.date === date && s.status !== 'descartado' && s.status !== 'recuperado').reduce((a, s) => a + s.dur, 0);
    let slots = freeSlots(state, date);
    if (date === today) { // não agenda no passado de hoje
      const nowMin = hmToMin(nowHM());
      slots = subtract(slots, [[0, nowMin + 5]]);
    }
    let prevSubject = null;
    const push = (slot, dur, fields) => {
      const s = { id: uid('ses'), date, start: minToHM(slot[0]), dur, status: 'pendente', locked: false, origin: 'auto', ...fields };
      state.plan.sessions.push(s);
      slot[0] += dur + 10; // 10 min de intervalo
      budget -= dur;
      allocated[s.subjectId] = (allocated[s.subjectId] || 0) + dur; allocatedTotal += dur;
      prevSubject = s.subjectId;
    };

    // 1) Revisões vencidas até o dia (máx. 2 por dia, curtas)
    const due = state.reviews.filter(r => !r.done && r.due <= date && !reviewsQueued.has(r.id)).slice(0, 2);
    for (const r of due) {
      const slot = slots.find(([s, e]) => e - s >= MIN_BLOCK);
      if (!slot || budget < MIN_BLOCK) break;
      const dur = Math.min(25, slot[1] - slot[0], budget);
      reviewsQueued.add(r.id);
      push(slot, dur, { subjectId: r.subjectId, topicId: r.topicId, modalidade: 'revisao', reviewId: r.id, contestId: meta[r.subjectId]?.contestId || null });
    }

    // 2) Simulado semanal no sábado quando a prova está a até 60 dias
    if (!simuladoThisWeek && dow(date) === 6 && nearestExam <= 60) {
      const slot = slots.find(([s, e]) => e - s >= 90);
      if (slot && budget >= 90) {
        const dur = Math.min(150, slot[1] - slot[0], budget);
        const s = { id: uid('ses'), date, start: minToHM(slot[0]), dur, status: 'pendente', locked: false, origin: 'auto', subjectId: null, topicId: null, modalidade: 'simulado', contestId: targets[0]?.id || null };
        state.plan.sessions.push(s); slot[0] += dur + 10; budget -= dur; simuladoThisWeek = true;
      }
    }

    // 3) Sessões de estudo distribuídas pelo "déficit" de cada matéria
    for (const slot of slots) {
      while (slot[1] - slot[0] >= MIN_BLOCK && budget >= MIN_BLOCK) {
        const dur = Math.min(sessionMin, slot[1] - slot[0], budget);
        const ranked = subjects
          .map(s => ({ s, deficit: (prio[s.id] / prioSum) * (allocatedTotal + dur) - allocated[s.id] }))
          .sort((a, b) => b.deficit - a.deficit);
        const pick = (ranked.find(r => r.s.id !== prevSubject) || ranked[0]).s;
        let topicId = null, modalidade = 'teoria';
        const fu = followUps[pick.id]?.shift();
        if (fu) { topicId = fu.topicId; modalidade = fu.modalidade; }
        else {
          const next = pick.topics.find(t => !t.done && !usedTopics.has(t.id));
          if (next) {
            topicId = next.id;
            const lm = lastModality(state, next.id);
            modalidade = lm === 'teoria' ? 'questoes' : 'teoria';
            if (modalidade === 'teoria') (followUps[pick.id] ||= []).push({ topicId: next.id, modalidade: 'questoes' });
          } else {
            // tudo estudado: questões no assunto praticado há mais tempo
            const done = pick.topics.slice().sort((a, b) => (a.doneAt || '').localeCompare(b.doneAt || ''));
            topicId = done.find(t => !usedTopics.has(t.id))?.id || done[0]?.id || null;
            modalidade = 'questoes';
          }
          usedTopics.add(topicId);
        }
        push(slot, dur, { subjectId: pick.id, topicId, modalidade, contestId: meta[pick.id]?.contestId || null });
      }
    }
  });
  state.plan.sessions.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  state.plan.generatedAt = new Date().toISOString();
  return state.plan;
}

export function pendingPast(state, today = todayISO()) {
  return state.plan.sessions.filter(s => s.date < today && s.status === 'pendente');
}

/**
 * Recupera sessões atrasadas SEM bola de neve: no máximo 1 recuperação por dia nos próximos 7 dias.
 * O que não couber é descartado — o assunto continua "a estudar" e volta naturalmente no próximo plano.
 */
export function recoverPending(state, contests, { uid, today = todayISO(), maxPerDay = 1 } = {}) {
  const stats = subjectStats(state, today);
  const pend = pendingPast(state, today)
    .sort((a, b) => {
      const pa = a.subjectId ? subjectPriority(state.subjects.find(s => s.id === a.subjectId) || { topics: [] }, stats) : 0;
      const pb = b.subjectId ? subjectPriority(state.subjects.find(s => s.id === b.subjectId) || { topics: [] }, stats) : 0;
      return pb - pa || b.date.localeCompare(a.date);
    });
  const result = { recovered: 0, dropped: 0 };
  const perDay = {};
  for (const old of pend) {
    let placed = false;
    for (const date of rangeDays(today, 7)) {
      if ((perDay[date] || 0) >= maxPerDay) continue;
      let slots = freeSlots(state, date);
      if (date === today) slots = subtract(slots, [[0, hmToMin(nowHM()) + 5]]);
      const slot = slots.find(([s, e]) => e - s >= Math.min(old.dur, 30));
      let start = null, dur = old.dur;
      if (slot) { start = minToHM(slot[0]); dur = Math.min(old.dur, slot[1] - slot[0]); }
      else {
        // sem espaço: substitui uma sessão automática pendente do dia (ela será regenerada depois)
        const victim = state.plan.sessions.find(s => s.date === date && s.status === 'pendente' && s.origin === 'auto' && !s.locked && s.modalidade !== 'simulado' && s.subjectId !== old.subjectId);
        if (!victim) continue;
        start = victim.start; dur = Math.min(old.dur, victim.dur);
        state.plan.sessions = state.plan.sessions.filter(s => s !== victim);
      }
      state.plan.sessions.push({ ...old, id: uid('ses'), date, start, dur, status: 'pendente', origin: 'recuperada', recoveredFrom: old.date, locked: true });
      old.status = 'recuperado';
      perDay[date] = (perDay[date] || 0) + 1;
      result.recovered++; placed = true; break;
    }
    if (!placed) { old.status = 'descartado'; result.dropped++; }
  }
  state.plan.sessions.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  state.plan.lastRecoverAt = new Date().toISOString();
  return result;
}

export function moveSession(state, id, date, start) {
  const s = state.plan.sessions.find(x => x.id === id);
  if (!s) return;
  s.date = date; if (start) s.start = start;
  s.locked = true;
  state.plan.sessions.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
}

// ---- Ciclo de estudos ----
export function buildCycle(state, contests, today = todayISO()) {
  const stats = subjectStats(state, today);
  const targets = targetContests(state, contests, today);
  const subjects = state.subjects.filter(s => s.topics.length && !s.paused);
  const prios = subjects.map(s => ({ s, p: subjectPriority(s, stats, examDaysFor(s, targets, today).days) }));
  const sum = prios.reduce((a, b) => a + b.p, 0) || 1;
  const weekly = state.profile.weeklyGoalMin || 600;
  const items = prios.sort((a, b) => b.p - a.p).map(({ s, p }) => ({ subjectId: s.id, targetMin: Math.max(30, Math.round((weekly * p) / sum / 10) * 10) }));
  return { startedAt: new Date().toISOString(), startDate: today, items };
}

export function cycleProgress(state) {
  const c = state.cycle; if (!c?.items?.length) return null;
  const done = {};
  for (const l of state.logs) {
    const inCycle = l.createdAt ? l.createdAt >= c.startedAt : l.date >= c.startDate;
    if (inCycle) done[l.subjectId] = (done[l.subjectId] || 0) + (l.durSec || 0) / 60;
  }
  const items = c.items.map(i => ({ ...i, doneMin: Math.round(done[i.subjectId] || 0) }));
  const total = items.reduce((a, i) => a + i.targetMin, 0);
  const got = items.reduce((a, i) => a + Math.min(i.doneMin, i.targetMin), 0);
  return { items, pct: total ? got / total : 0, next: items.find(i => i.doneMin < i.targetMin) || null };
}

// Sessões sugeridas para hoje no modo ciclo (sem gravar no plano).
export function cycleToday(state, today = todayISO()) {
  const prog = cycleProgress(state); if (!prog) return [];
  let slots = subtract(freeSlots(state, today), [[0, hmToMin(nowHM()) + 5]]);
  let budget = Math.min(dayBudgets(state, rangeDays(weekStart(today), 7))[(dow(today) + 6) % 7] || 0, 240);
  const out = [];
  const queue = prog.items.filter(i => i.doneMin < i.targetMin);
  for (const it of queue) {
    const slot = slots.find(([s, e]) => e - s >= MIN_BLOCK);
    if (!slot || budget < MIN_BLOCK) break;
    const dur = Math.min(state.profile.sessionMin || 50, it.targetMin - it.doneMin, slot[1] - slot[0], budget);
    if (dur < 15) continue;
    const subj = state.subjects.find(s => s.id === it.subjectId);
    const topic = subj?.topics.find(t => !t.done) || subj?.topics[0];
    out.push({ id: `ciclo_${it.subjectId}`, date: today, start: minToHM(slot[0]), dur, subjectId: it.subjectId, topicId: topic?.id || null, modalidade: topic && !topic.done ? 'teoria' : 'questoes', status: 'pendente', origin: 'ciclo' });
    slot[0] += dur + 10; budget -= dur;
  }
  return out;
}

// ---- Revisões espaçadas (1, 7 e 30 dias) ----
export const REVIEW_STEPS = [1, 7, 30];
export function scheduleReviews(state, log, uid) {
  if (!log.topicId || log.modalidade === 'simulado') return;
  if (log.modalidade === 'revisao') {
    const r = state.reviews.filter(x => x.topicId === log.topicId && !x.done).sort((a, b) => a.due.localeCompare(b.due))[0];
    if (r) { r.done = true; r.doneAt = log.date; }
    return;
  }
  if (state.reviews.some(r => r.topicId === log.topicId && !r.done)) return;
  const hasHistory = state.reviews.some(r => r.topicId === log.topicId);
  if (hasHistory) return;
  for (const d of REVIEW_STEPS) state.reviews.push({ id: uid('rev'), subjectId: log.subjectId, topicId: log.topicId, due: addDays(log.date, d), step: d, done: false });
}
