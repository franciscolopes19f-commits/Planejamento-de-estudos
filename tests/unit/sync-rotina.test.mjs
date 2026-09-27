import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge3, mergeStates, toCloud } from '../../app/js/merge.js';
import { buildRoutine, validateSetup, emptySetup, freeMinutes } from '../../app/js/routine.js';

let n = 0; const uid = p => `${p}_${++n}`;

test('mesclagem: junta itens novos dos dois lados e respeita exclusões', () => {
  const base = { logs: [{ id: 'a', m: 1 }, { id: 'b', m: 1 }], profile: { meta: 600, nome: '' } };
  const local = { logs: [{ id: 'a', m: 1 }, { id: 'c', m: 1 }], profile: { meta: 700, nome: '' } };          // apagou b, criou c, mudou meta
  const remote = { logs: [{ id: 'a', m: 2 }, { id: 'b', m: 1 }, { id: 'd', m: 1 }], profile: { meta: 600, nome: 'F' } }; // editou a, criou d, mudou nome
  const m = merge3(base, local, remote, true);
  assert.deepEqual(m.logs.map(x => x.id).sort(), ['a', 'c', 'd']);
  assert.equal(m.logs.find(x => x.id === 'a').m, 2);
  assert.deepEqual(m.profile, { meta: 700, nome: 'F' });
});

test('mesclagem: conflito no mesmo campo fica com a versão mais recente', () => {
  const base = { p: { meta: 1 } }, a = { p: { meta: 2 } }, b = { p: { meta: 3 } };
  assert.equal(merge3(base, a, b, true).p.meta, 2);
  assert.equal(merge3(base, a, b, false).p.meta, 3);
});

test('mesclagem de estados ignora o cronômetro local e mantém a data mais recente', () => {
  const local = { updatedAt: '2026-09-28T10:00:00Z', timer: { running: true }, sync: {}, logs: [{ id: 'x' }] };
  const remote = { updatedAt: '2026-09-28T11:00:00Z', logs: [{ id: 'y' }] };
  const m = mergeStates(null, local, remote);
  assert.equal(m.timer, undefined);
  assert.equal(m.updatedAt, '2026-09-28T11:00:00Z');
  assert.deepEqual(m.logs.map(l => l.id).sort(), ['x', 'y']);
  assert.equal(toCloud(local).timer, undefined);
});

test('configuração inicial: só cria janelas nos períodos marcados', () => {
  const c = emptySetup();
  Object.assign(c, { acordo: '06:30', durmo: '23:30' });
  c.trabalho = { dias: [1, 2, 3, 4, 5], entrada: '08:00', saida: '17:00', almocoInicio: '12:00', almocoFim: '13:00' };
  c.faculdade = { dias: [1, 2, 3, 4], inicio: '18:20', fim: '22:00' };
  c.desloc = { casaTrabalho: 30, trabalhoFaculdade: 40, faculdadeCasa: 40, trabalhoCasa: 30 };
  assert.deepEqual(validateSetup(c), []);
  let r = buildRoutine({ ...c, periodos: [] }, uid);
  assert.equal(r.availability.length, 0, 'nenhum período marcado → nenhuma janela');
  assert.ok(r.events.some(e => e.type === 'faculdade' && e.start === '18:20' && e.end === '22:00' && e.dows[0] === 1));
  assert.ok(!r.events.some(e => e.type === 'faculdade' && e.dows.includes(5)), 'sem aula na sexta');

  r = buildRoutine({ ...c, periodos: ['aposFaculdade', 'aposTrabalho', 'sabManha'] }, uid);
  const seg = r.availability.filter(a => a.dow === 1), sex = r.availability.filter(a => a.dow === 5), sab = r.availability.filter(a => a.dow === 6);
  assert.equal(seg.length, 0, 'depois da faculdade sobram só 5 min antes de dormir: não vira janela');
  assert.deepEqual(sex.map(a => [a.start, a.end]), [['18:00', '22:45']]); // sexta sem faculdade: 17h + 30 min + 30 min
  assert.deepEqual(sab.map(a => [a.start, a.end]), [['08:00', '12:00']]);
  assert.ok(!r.availability.some(a => a.start < '07:00'), 'nada de madrugada presumida');
  assert.equal(freeMinutes(r), 285 + 240);
});

test('configuração inicial: exige horários essenciais', () => {
  const c = emptySetup();
  c.trabalho.dias = [1];
  c.periodos = ['almoco'];
  const e = validateSetup(c);
  assert.ok(e.some(x => /acorda/.test(x)));
  assert.ok(e.some(x => /entrada e saída/.test(x)));
  assert.ok(e.some(x => /almoço/.test(x)));
});
