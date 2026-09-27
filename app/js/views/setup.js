// Configuração inicial: sono, trabalho, faculdade, deslocamentos e períodos em que é possível estudar.
import { esc, icon, formData, toast } from '../ui.js';
import { DOW_SHORT, fmtMin } from '../time.js';
import { PERIODOS, emptySetup, validateSetup, buildRoutine, freeMinutes, suggestedWeeklyGoal } from '../routine.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
let draft = null;

function readForm(f) {
  const d = formData(f);
  const arr = v => [].concat(v || []);
  return {
    acordo: d.acordo, durmo: d.durmo,
    trabalho: { dias: arr(d.tDias).map(Number), entrada: d.tEntrada, saida: d.tSaida, almocoInicio: d.aIni, almocoFim: d.aFim },
    faculdade: { dias: arr(d.fDias).map(Number), inicio: d.fIni, fim: d.fFim },
    desloc: { casaTrabalho: +d.dCT || 0, trabalhoFaculdade: +d.dTF || 0, faculdadeCasa: +d.dFC || 0, trabalhoCasa: +d.dTC || 0 },
    periodos: arr(d.periodos),
    metaSemanalMin: d.meta ? Math.round(+d.meta * 60) : null,
  };
}

function preview(c) {
  if (!c.acordo || !c.durmo) return '<p class="small muted">Preencha os horários para ver as janelas de estudo calculadas.</p>';
  const r = buildRoutine(c, p => p + Math.random().toString(36).slice(2, 7));
  const free = freeMinutes(r);
  const rows = ORDER.map(dw => {
    const ws = r.availability.filter(a => a.dow === dw).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="li small"><b style="width:36px">${DOW_SHORT[dw]}</b><div class="grow">${ws.length ? ws.map(w => `<span class="chip green">${w.start}–${w.end}</span>`).join(' ') : '<span class="muted">sem estudo</span>'}</div></div>`;
  }).join('');
  return `<div class="list">${rows}</div>
    <p class="small" style="margin-top:8px">Tempo livre para estudar: <b>${fmtMin(free)}</b> por semana. Meta sugerida (75%, com folga para imprevistos): <b>${fmtMin(suggestedWeeklyGoal(free))}</b>.</p>`;
}

const dias = (name, sel) => `<div class="checks">${ORDER.map(d => `<label><input type="checkbox" name="${name}" value="${d}" ${sel.includes(d) ? 'checked' : ''}>${DOW_SHORT[d]}</label>`).join('')}</div>`;
const time = (name, v, label) => `<label class="field"><span>${label}</span><input class="input" type="time" name="${name}" id="cfg-${name}" value="${esc(v)}"></label>`;
const num = (name, v, label) => `<label class="field"><span>${label}</span><input class="input" type="number" min="0" max="240" inputmode="numeric" name="${name}" id="cfg-${name}" value="${esc(v)}"></label>`;

export default {
  title: 'Configuração inicial',
  render(app) {
    const c = draft || app.state.setupAnswers || emptySetup();
    draft = c;
    return `<h1>Configuração inicial</h1>
    <p class="muted small" style="margin:6px 0 14px">Conte como é sua semana. O app calcula as janelas de estudo só nos períodos que você marcar. Nada de 6h da manhã ou almoço se você não escolher. Dá para refazer quando o semestre mudar.</p>
    <form id="setup-form" class="stack">
      <section class="card stack"><h2>${icon('clock')} Sono</h2>
        <div class="form-grid">${time('acordo', c.acordo, 'Acordo às')}${time('durmo', c.durmo, 'Vou dormir às')}</div>
      </section>
      <section class="card stack"><h2>${icon('briefcase')} Trabalho (escritório)</h2>
        <div class="field"><span>Dias de trabalho</span>${dias('tDias', c.trabalho.dias)}</div>
        <div class="form-grid">${time('tEntrada', c.trabalho.entrada, 'Entrada')}${time('tSaida', c.trabalho.saida, 'Saída')}</div>
        <div class="form-grid">${time('aIni', c.trabalho.almocoInicio, 'Almoço: início (opcional)')}${time('aFim', c.trabalho.almocoFim, 'Almoço: fim')}</div>
      </section>
      <section class="card stack"><h2>${icon('book')} Faculdade</h2>
        <div class="field"><span>Dias de aula</span>${dias('fDias', c.faculdade.dias)}</div>
        <div class="form-grid">${time('fIni', c.faculdade.inicio, 'Início')}${time('fFim', c.faculdade.fim, 'Fim')}</div>
      </section>
      <section class="card stack"><h2>${icon('mapPin')} Deslocamentos (minutos)</h2>
        <div class="form-grid">${num('dCT', c.desloc.casaTrabalho, 'Casa → trabalho')}${num('dTF', c.desloc.trabalhoFaculdade, 'Trabalho → faculdade')}${num('dFC', c.desloc.faculdadeCasa, 'Faculdade ↔ casa')}${num('dTC', c.desloc.trabalhoCasa, 'Trabalho → casa')}</div>
      </section>
      <section class="card stack"><h2>${icon('target')} Quando você consegue estudar?</h2>
        <p class="small muted">Marque só o que é realista na maioria das semanas.</p>
        <div class="checks">${Object.entries(PERIODOS).map(([k, l]) => `<label><input type="checkbox" name="periodos" value="${k}" ${c.periodos.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div>
      </section>
      <section class="card stack"><h2>${icon('calendar')} Resultado</h2>
        <div id="setup-preview">${preview(c)}</div>
        <label class="field" style="max-width:260px"><span>Meta semanal (horas)</span><input class="input" type="number" min="1" max="80" step="0.5" name="meta" id="cfg-meta" value="${c.metaSemanalMin ? c.metaSemanalMin / 60 : ''}" placeholder="usar a sugerida"></label>
      </section>
      <div id="setup-errors"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary lg" type="submit" data-testid="salvar-config">${icon('check')} Salvar e gerar meu plano</button></div>
    </form>`;
  },
  mount(root, app) {
    const f = root.querySelector('#setup-form');
    const refresh = () => { draft = readForm(f); root.querySelector('#setup-preview').innerHTML = preview(draft); };
    f.addEventListener('input', refresh);
    f.addEventListener('change', refresh);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const c = readForm(f);
      const erros = validateSetup(c);
      if (erros.length) { root.querySelector('#setup-errors').innerHTML = `<div class="banner">${icon('alert')}<div>${erros.map(esc).join('<br>')}</div></div>`; return; }
      const r = buildRoutine(c, app.uid);
      const free = freeMinutes(r);
      if (!r.availability.length) { root.querySelector('#setup-errors').innerHTML = `<div class="banner">${icon('alert')}<div>Nenhuma janela de estudo foi gerada. Marque ao menos um período em “Quando você consegue estudar?”.</div></div>`; return; }
      const weekly = c.metaSemanalMin || suggestedWeeklyGoal(free);
      const studyDays = new Set(r.availability.map(a => a.dow)).size || 1;
      app.update(s => {
        s.events = [...s.events.filter(x => x.origem !== 'config' && !(s.seeded && !s.setupDone)), ...r.events];
        s.availability = [...s.availability.filter(x => x.origem !== 'config' && !(s.seeded && !s.setupDone)), ...r.availability];
        s.setupAnswers = c;
        s.setupDone = true;
        s.profile.weeklyGoalMin = weekly;
        s.profile.dailyGoalMin = Math.max(20, Math.round(weekly / studyDays / 5) * 5);
      }, { silent: true });
      draft = null;
      app.regenerate({ days: 14 });
      toast(`Rotina salva: ${fmtMin(free)} livres, meta de ${fmtMin(weekly)} por semana.`);
      app.go('hoje');
    });
  },
};

