// Monta compromissos e janelas de estudo a partir das respostas da configuração inicial.
// Nada é presumido: só vira janela de estudo o período que o usuário marcou como possível.
import { hmToMin, minToHM } from './time.js';

export const PERIODOS = {
  antesTrabalho: 'Antes do trabalho',
  almoco: 'No intervalo do almoço',
  aposTrabalho: 'À noite, nos dias sem faculdade',
  aposFaculdade: 'Depois da faculdade',
  sabManha: 'Sábado de manhã', sabTarde: 'Sábado à tarde', sabNoite: 'Sábado à noite',
  domManha: 'Domingo de manhã', domTarde: 'Domingo à tarde', domNoite: 'Domingo à noite',
};

const MIN_WINDOW = 20;
const m = hm => (hm ? hmToMin(hm) : null);

export function emptySetup() {
  return {
    acordo: '', durmo: '',
    trabalho: { dias: [], entrada: '', saida: '', almocoInicio: '', almocoFim: '' },
    faculdade: { dias: [], inicio: '18:20', fim: '22:00' },
    desloc: { casaTrabalho: 30, trabalhoFaculdade: 30, faculdadeCasa: 40, trabalhoCasa: 30 },
    periodos: [],
    metaSemanalMin: null,
  };
}

export function validateSetup(c) {
  const erros = [];
  if (!c.acordo || !c.durmo) erros.push('Informe a que horas você acorda e dorme.');
  if (c.trabalho.dias.length && (!c.trabalho.entrada || !c.trabalho.saida)) erros.push('Informe entrada e saída do trabalho.');
  if (c.trabalho.entrada && c.trabalho.saida && m(c.trabalho.saida) <= m(c.trabalho.entrada)) erros.push('A saída do trabalho deve ser depois da entrada.');
  if ((c.trabalho.almocoInicio && !c.trabalho.almocoFim) || (!c.trabalho.almocoInicio && c.trabalho.almocoFim)) erros.push('Preencha início e fim do almoço (ou deixe os dois vazios).');
  if (c.faculdade.dias.length && (!c.faculdade.inicio || !c.faculdade.fim)) erros.push('Informe o horário da faculdade.');
  if (c.periodos.includes('almoco') && !c.trabalho.almocoInicio) erros.push('Para estudar no almoço, informe o horário do almoço.');
  return erros;
}

export function buildRoutine(c, uid) {
  const events = [], availability = [];
  const wake = m(c.acordo), sleepRaw = m(c.durmo);
  const sleep = sleepRaw != null && sleepRaw < 12 * 60 ? 1439 : sleepRaw; // dorme depois da meia-noite: limita ao fim do dia
  const d = c.desloc;
  const ev = (dows, title, type, s, e) => { if (s != null && e != null && e > s) events.push({ id: uid('evt'), title, type, dows, start: minToHM(s), end: minToHM(Math.min(e, 1439)), remind: false, origem: 'config' }); };
  const win = (dow, s, e) => { if (s == null || e == null) return; s = Math.max(s, wake + 20); e = Math.min(e, sleep - 20, 1439); if (e - s >= MIN_WINDOW) availability.push({ id: uid('disp'), dow, start: minToHM(s), end: minToHM(e), origem: 'config' }); };
  const has = p => c.periodos.includes(p);
  const t = c.trabalho, f = c.faculdade;
  const ent = m(t.entrada), sai = m(t.saida), aIni = m(t.almocoInicio), aFim = m(t.almocoFim), fIni = m(f.inicio), fFim = m(f.fim);

  for (let dow = 0; dow < 7; dow++) {
    const work = t.dias.includes(dow), fac = f.dias.includes(dow);
    if (work) {
      if (aIni != null) { ev([dow], 'Trabalho', 'escritorio', ent, aIni); ev([dow], 'Trabalho', 'escritorio', aFim, sai); }
      else ev([dow], 'Trabalho', 'escritorio', ent, sai);
      ev([dow], 'Deslocamento', 'deslocamento', ent - d.casaTrabalho, ent);
      if (fac) ev([dow], 'Deslocamento', 'deslocamento', sai, Math.min(sai + d.trabalhoFaculdade, fIni));
      else ev([dow], 'Deslocamento', 'deslocamento', sai, sai + d.trabalhoCasa);
      if (has('antesTrabalho')) win(dow, wake + 30, ent - d.casaTrabalho - 10);
      if (has('almoco') && aIni != null) win(dow, aIni + 15, aFim - 5);
      if (!fac && has('aposTrabalho')) win(dow, sai + d.trabalhoCasa + 30, sleep - 45);
    }
    if (fac) {
      if (!work) ev([dow], 'Deslocamento', 'deslocamento', fIni - d.faculdadeCasa, fIni);
      ev([dow], 'Faculdade', 'faculdade', fIni, fFim);
      ev([dow], 'Deslocamento', 'deslocamento', fFim, fFim + d.faculdadeCasa);
      if (has('aposFaculdade')) win(dow, fFim + d.faculdadeCasa + 15, sleep - 30);
    }
    if (!work) {
      const pre = dow === 0 ? 'dom' : 'sab'; // dias de folga durante a semana seguem as escolhas de sábado
      const manha = [Math.max(wake + 45, 8 * 60), 12 * 60], tarde = [14 * 60, 18 * 60], noite = [19 * 60, sleep - 60];
      if (has(pre + 'Manha')) win(dow, ...manha);
      if (has(pre + 'Tarde')) win(dow, ...tarde);
      if (has(pre + 'Noite') && !fac) win(dow, ...noite);
    }
  }
  return { events, availability };
}

// Minutos livres por semana (janelas menos compromissos que as cruzam).
export function freeMinutes(routine) {
  let total = 0;
  for (const a of routine.availability) {
    let s = hmToMin(a.start), e = hmToMin(a.end), len = e - s;
    for (const ev of routine.events) if (ev.dows.includes(a.dow)) {
      const os = Math.max(s, hmToMin(ev.start)), oe = Math.min(e, hmToMin(ev.end));
      if (oe > os) len -= oe - os;
    }
    total += Math.max(0, len);
  }
  return total;
}

export function suggestedWeeklyGoal(freeMin) { return Math.max(60, Math.round((freeMin * 0.75) / 30) * 30); }
