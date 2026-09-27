// Modo demonstração (?demo=1): dados fictícios só na memória, para visualizar o app preenchido.
// Nada é salvo no aparelho nesse modo.
import { todayISO, addDays } from './time.js';
import { exampleRoutine } from './seed.js';

export function applyDemo(state, uid) {
  const today = todayISO();
  state.demo = true;
  Object.assign(state, exampleRoutine(uid));
  state.setupDone = true;
  state.profile.name = 'Visitante';
  const subs = state.subjects.filter(s => s.topics.length);
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 13; i >= 1; i--) {
    const date = addDays(today, -i);
    if (rnd() < 0.2) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const s = subs[Math.floor(rnd() * subs.length)];
      const t = s.topics[Math.floor(rnd() * Math.min(4, s.topics.length))];
      const mod = rnd() < 0.5 ? 'teoria' : 'questoes';
      const q = mod === 'questoes' ? 10 + Math.floor(rnd() * 25) : 0;
      const ok = Math.round(q * (0.5 + rnd() * 0.4 - (s.dificuldade - 2) * 0.06));
      state.logs.push({ id: uid('log'), date, start: '06:10', durSec: (25 + Math.floor(rnd() * 45)) * 60, subjectId: s.id, topicId: t.id, modalidade: mod, questoes: q, acertos: ok, erros: q - ok, obs: '', source: 'demo', createdAt: date + 'T09:00:00Z' });
      if (mod === 'teoria') { t.done = true; t.doneAt = date; }
    }
  }
  const t0 = subs[0].topics[0];
  state.reviews.push({ id: uid('rev'), subjectId: subs[0].id, topicId: t0.id, due: today, step: 7, done: false });
  state.reviews.push({ id: uid('rev'), subjectId: subs[1].id, topicId: subs[1].topics[1].id, due: addDays(today, -1), step: 1, done: false });
  state.my['radar-sefaz-sc-2026-auditor'] = { status: 'vou_inscrever', pagamentoAte: addDays(today, 2), taxa: 200, pago: false, alerts: { inscricao: 10, pagamento: 3, prova: 7 } };
  state.my['radar-sefaz-rs-2026-auditor'] = { status: 'interesse' };
  state.appTime[today] = 1260;
  return state;
}
