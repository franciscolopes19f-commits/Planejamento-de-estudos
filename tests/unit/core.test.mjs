import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setClockOffset, todayISO, weekStart, brToUTC, hmToMin, addDays, dow } from '../../app/js/time.js';
import { situacao, matchesPrefs, mergeContests, findDuplicate } from '../../app/js/radar.js';
import { generatePlan, freeSlots, eventsOn, recoverPending, moveSession, scheduleReviews, buildCycle, cycleProgress } from '../../app/js/planner.js';
import { createTimer, pause, resume, elapsedMs, tick, awayDecision, CONFIRM_GRACE_MS } from '../../app/js/timer.js';
import { computeAlerts, buildICS, contestCalendarItems } from '../../app/js/alerts.js';
import { streak, weekMinutes } from '../../app/js/stats.js';
import { _empty, uid } from '../../app/js/store.js';
import { createSeed } from '../../app/js/seed.js';

// "Agora" fixo: segunda-feira, 28/09/2026, 05:00 em Brasília (08:00 UTC)
setClockOffset(Date.UTC(2026, 8, 28, 8, 0) - Date.now());
const TODAY = '2026-09-28';

function freshState() { const s = _empty(); Object.assign(s, createSeed(uid)); return s; }

test('datas no horário de Brasília', () => {
  assert.equal(todayISO(new Date(Date.UTC(2026, 8, 28, 2, 30))), '2026-09-27'); // 23h30 em Brasília
  assert.equal(todayISO(), TODAY);
  assert.equal(weekStart('2026-10-04'), '2026-09-28'); // domingo pertence à semana iniciada na segunda
  assert.equal(brToUTC('2026-11-22', '08:00').toISOString(), '2026-11-22T11:00:00.000Z');
});

test('situação do concurso é calculada pelas datas', () => {
  const base = { orgao: 'X', cargo: 'Auditor', local: 'SC', area: 'fiscal' };
  assert.equal(situacao({ ...base, inscInicio: '2026-09-04', inscFim: '2026-10-05', prova: '2026-11-22' }, TODAY), 'abertas');
  assert.equal(situacao({ ...base, inscInicio: '2026-10-10', inscFim: '2026-11-05' }, TODAY), 'edital');
  assert.equal(situacao({ ...base, inscInicio: '2026-08-01', inscFim: '2026-08-30', prova: '2026-10-20' }, TODAY), 'prova_proxima');
  assert.equal(situacao({ ...base, inscInicio: '2026-06-01', inscFim: '2026-06-30', prova: '2026-12-20' }, TODAY), 'encerradas');
  assert.equal(situacao({ ...base, situacao: 'previsto' }, TODAY), 'previsto');
});

test('preferências excluem a Bahia e filtram área/cargo', () => {
  const prefs = freshState().prefs;
  assert.equal(matchesPrefs({ local: 'BA', area: 'fiscal', cargo: 'Auditor Fiscal' }, prefs), false);
  assert.equal(matchesPrefs({ local: 'RJ', area: 'fiscal', cargo: 'Auditor Fiscal' }, prefs), true);
  assert.equal(matchesPrefs({ local: 'Federal', area: 'policial', cargo: 'Policial Rodoviário Federal' }, prefs), true);
  assert.equal(matchesPrefs({ local: 'SP', area: 'fiscal', cargo: 'Auditor' }, prefs), false);
  assert.equal(matchesPrefs({ local: 'RJ', area: 'outra', cargo: 'Professor' }, prefs), false);
});

test('mescla radar + cadastros sem duplicar', () => {
  const radar = [{ id: 'r1', orgao: 'SEFAZ SC', cargo: 'Auditor Estadual de Finanças Públicas', local: 'SC' }];
  const user = [{ id: 'u1', orgao: 'Sefaz-SC', cargo: 'Auditor estadual de finanças', local: 'SC', numero: 1 }];
  const merged = mergeContests(radar, user, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'u1');
  assert.ok(findDuplicate({ id: 'n', orgao: 'SEFAZ SC', cargo: 'Auditor Estadual', local: 'SC' }, radar));
  assert.equal(mergeContests(radar, [], ['r1']).length, 0);
});

test('plano respeita janelas livres, compromissos e meta semanal', () => {
  const s = freshState();
  generatePlan(s, [], { start: TODAY, days: 7, uid });
  const ses = s.plan.sessions;
  assert.ok(ses.length > 5, 'deve gerar sessões');
  const total = ses.reduce((a, x) => a + x.dur, 0);
  assert.ok(total <= s.profile.weeklyGoalMin + 5, `total ${total} dentro da meta`);
  assert.ok(total >= s.profile.weeklyGoalMin * 0.8, `total ${total} próximo da meta`);
  for (const x of ses) {
    const st = hmToMin(x.start), en = st + x.dur;
    const inWindow = s.availability.some(a => a.dow === dow(x.date) && hmToMin(a.start) <= st && en <= hmToMin(a.end));
    assert.ok(inWindow, `sessão ${x.date} ${x.start} dentro de janela livre`);
    for (const e of eventsOn(s, x.date)) assert.ok(en <= hmToMin(e.start) || st >= hmToMin(e.end), 'sem conflito com compromisso');
    assert.ok(x.subjectId && x.modalidade);
  }
  // matérias de maior peso recebem mais tempo
  const bySub = {}; for (const x of ses) bySub[x.subjectId] = (bySub[x.subjectId] || 0) + x.dur;
  const trib = s.subjects.find(x => x.nome === 'Direito Tributário').id, rl = s.subjects.find(x => x.nome.startsWith('Raciocínio')).id;
  assert.ok((bySub[trib] || 0) > (bySub[rl] || 0));
});

test('regenerar preserva sessões concluídas e editadas', () => {
  const s = freshState();
  generatePlan(s, [], { start: TODAY, days: 7, uid });
  const [a, b] = s.plan.sessions;
  a.status = 'feito';
  moveSession(s, b.id, addDays(TODAY, 2), '06:00');
  generatePlan(s, [], { start: TODAY, days: 7, uid });
  assert.ok(s.plan.sessions.some(x => x.id === a.id && x.status === 'feito'));
  assert.ok(s.plan.sessions.some(x => x.id === b.id && x.locked && x.date === addDays(TODAY, 2)));
});

test('recuperar pendentes sem bola de neve (máx. 1 por dia)', () => {
  const s = freshState();
  generatePlan(s, [], { start: addDays(TODAY, -7), days: 7, uid }); // semana passada, nada feito
  const late = s.plan.sessions.filter(x => x.date < TODAY).length;
  generatePlan(s, [], { start: TODAY, days: 7, uid });
  const r = recoverPending(s, [], { uid, today: TODAY });
  assert.equal(r.recovered + r.dropped, late);
  assert.ok(r.recovered <= 7);
  const perDay = {}; for (const x of s.plan.sessions.filter(x => x.origin === 'recuperada')) perDay[x.date] = (perDay[x.date] || 0) + 1;
  assert.ok(Object.values(perDay).every(n => n <= 1));
  assert.equal(s.plan.sessions.filter(x => x.date < TODAY && x.status === 'pendente').length, 0);
});

test('revisões espaçadas 1/7/30 e ciclo de estudos', () => {
  const s = freshState();
  const sub = s.subjects[0];
  scheduleReviews(s, { date: TODAY, subjectId: sub.id, topicId: sub.topics[0].id, modalidade: 'teoria' }, uid);
  assert.deepEqual(s.reviews.map(r => r.due), [addDays(TODAY, 1), addDays(TODAY, 7), addDays(TODAY, 30)]);
  scheduleReviews(s, { date: addDays(TODAY, 1), subjectId: sub.id, topicId: sub.topics[0].id, modalidade: 'revisao' }, uid);
  assert.equal(s.reviews.filter(r => r.done).length, 1);
  s.cycle = buildCycle(s, []);
  assert.equal(s.cycle.items.length, s.subjects.length);
  assert.equal(cycleProgress(s).pct, 0);
});

test('cronômetro: pausa, retoma e desconta inatividade', () => {
  const t0 = 1_000_000;
  const t = createTimer({ subjectId: 'a' }, t0);
  assert.equal(elapsedMs(t, t0 + 60_000), 60_000);
  pause(t, t0 + 60_000);
  assert.equal(elapsedMs(t, t0 + 600_000), 60_000); // pausado não conta
  resume(t, t0 + 600_000);
  assert.equal(elapsedMs(t, t0 + 660_000), 120_000);
  // inatividade: pergunta aos 25 min e, sem resposta em 3 min, pausa no momento da pergunta
  const askAt = t0 + 600_000 + 25 * 60_000;
  assert.equal(tick(t, 25, askAt), 'ask');
  assert.equal(tick(t, 25, askAt + CONFIRM_GRACE_MS), 'auto-paused');
  assert.equal(elapsedMs(t, askAt + 10 * 60_000), 60_000 + 25 * 60_000);
  // ausência do app descontada quando o usuário diz que não estudou
  const t2 = createTimer({}, 0);
  t2.hiddenAt = 10 * 60_000;
  awayDecision(t2, false, 40 * 60_000);
  assert.equal(elapsedMs(t2, 50 * 60_000), 10 * 60_000);
});

test('alertas de inscrição/pagamento/prova e exportação .ics', () => {
  const s = freshState();
  const c = { id: 'c1', orgao: 'SEFAZ SC', cargo: 'Auditor', local: 'SC', inscFim: addDays(TODAY, 3), prova: addDays(TODAY, 5) };
  s.my.c1 = { status: 'vou_inscrever', pagamentoAte: addDays(TODAY, 1), pago: false, taxa: 200 };
  const al = computeAlerts(s, [c], TODAY);
  assert.deepEqual(al.map(a => a.kind).sort(), ['inscricao', 'pagamento', 'prova']);
  s.my.c1.pago = true; s.my.c1.status = 'inscrito';
  assert.deepEqual(computeAlerts(s, [c], TODAY).map(a => a.kind), ['prova']);
  const ics = buildICS(contestCalendarItems(s, [c]));
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:PROVA: SEFAZ SC – Auditor/);
  assert.match(ics, /TRIGGER:-PT/);
});

test('constância e minutos da semana', () => {
  const s = freshState();
  for (const d of [addDays(TODAY, -2), addDays(TODAY, -1), TODAY]) s.logs.push({ date: d, durSec: 1800 });
  assert.equal(streak(s, TODAY).current, 3);
  assert.equal(weekMinutes(s, TODAY), 30); // só segunda (hoje) está nesta semana
});
