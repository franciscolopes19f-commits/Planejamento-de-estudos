// Planejamento: calendário semanal (editável) ou ciclo de estudos.
import { esc, icon, openModal, closeModal, modalHead, formData, toast, confirmDialog, download, progressBar } from '../ui.js';
import { todayISO, addDays, weekStart, rangeDays, DOW_SHORT, dow, fmtMin, fmtDayMonth, fmtDate } from '../time.js';
import { MODALIDADES, eventsOn, pendingPast, recoverPending, moveSession, buildCycle, cycleProgress, dayBudgets } from '../planner.js';
import { buildICS, planCalendarItems } from '../alerts.js';
import { openLogForm } from './study.js';

function sessLabels(app, x) {
  const subj = app.subject(x.subjectId);
  return {
    nome: x.modalidade === 'simulado' ? 'Simulado' : subj?.nome || '—',
    assunto: x.modalidade === 'simulado' ? 'Prova completa, cronometrada' : subj?.topics.find(t => t.id === x.topicId)?.nome || '',
  };
}

function sessionForm(app, x, date) {
  const s = app.state;
  const subjId = x?.subjectId || s.subjects[0]?.id;
  const topics = app.subject(subjId)?.topics || [];
  return `<form id="sess-form" class="stack">
    <div class="form-grid">
      <label class="field"><span>Dia</span><input class="input" type="date" name="date" id="p-date" value="${esc(x?.date || date)}" required></label>
      <label class="field"><span>Início</span><input class="input" type="time" name="start" id="p-start" value="${esc(x?.start || '06:00')}" required></label>
      <label class="field"><span>Duração (min)</span><input class="input" type="number" min="10" max="300" name="dur" id="p-dur" value="${esc(x?.dur || s.profile.sessionMin)}" required></label>
    </div>
    <label class="field"><span>Matéria</span><select class="input" name="subjectId" id="p-subjectId">${s.subjects.map(m => `<option value="${esc(m.id)}" ${m.id === subjId ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>
    <label class="field"><span>Assunto</span><select class="input" name="topicId" id="p-topicId"><option value="">—</option>${topics.map(t => `<option value="${esc(t.id)}" ${t.id === x?.topicId ? 'selected' : ''}>${t.done ? '✓ ' : ''}${esc(t.nome)}</option>`).join('')}</select></label>
    <label class="field"><span>Modalidade</span><select class="input" name="modalidade" id="p-modalidade">${Object.entries(MODALIDADES).map(([k, v]) => `<option value="${k}" ${k === (x?.modalidade || 'teoria') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
  </form>`;
}

function openSessionEditor(app, x, date) {
  openModal(`${modalHead(x ? 'Editar / mover sessão' : 'Nova sessão')}${sessionForm(app, x, date)}`, {
    onMount: m => {
      const f = m.querySelector('form');
      f.subjectId.addEventListener('change', () => {
        f.topicId.innerHTML = '<option value="">—</option>' + (app.subject(f.subjectId.value)?.topics || []).map(t => `<option value="${esc(t.id)}">${t.done ? '✓ ' : ''}${esc(t.nome)}</option>`).join('');
      });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const d = formData(f);
        app.update(s => {
          if (x) {
            const ss = s.plan.sessions.find(y => y.id === x.id);
            Object.assign(ss, { subjectId: d.subjectId, topicId: d.topicId || null, modalidade: d.modalidade, dur: +d.dur });
            moveSession(s, x.id, d.date, d.start);
          } else {
            s.plan.sessions.push({ id: app.uid('ses'), date: d.date, start: d.start, dur: +d.dur, subjectId: d.subjectId, topicId: d.topicId || null, modalidade: d.modalidade, status: 'pendente', locked: true, origin: 'manual' });
            s.plan.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
          }
        });
        closeModal(); toast(x ? 'Sessão atualizada.' : 'Sessão adicionada.');
      });
    },
  });
}

function openSessionDetail(app, id) {
  const x = app.state.plan.sessions.find(s => s.id === id); if (!x) return;
  const l = sessLabels(app, x);
  const c = x.contestId && app.contest(x.contestId);
  openModal(`${modalHead(l.nome)}
    <p class="ink2">${esc(l.assunto)}</p>
    <div class="row" style="margin:10px 0"><span class="chip green">${esc(MODALIDADES[x.modalidade])}</span><span class="chip">${fmtDate(x.date)} · ${esc(x.start || '')}</span><span class="chip">${fmtMin(x.dur)}</span>${c ? `<span class="chip">${esc(c.orgao)}</span>` : ''}${x.origin === 'recuperada' ? `<span class="chip amber">recuperada de ${fmtDate(x.recoveredFrom, { short: true })}</span>` : ''}${x.status === 'feito' ? '<span class="chip green">concluída</span>' : ''}</div>
    <div class="modal-actions" style="justify-content:flex-start">
      ${x.status === 'pendente' ? `<a class="btn primary" href="#/estudar/sessao/${encodeURIComponent(x.id)}" data-close>${icon('play')} Iniciar</a>
      <button class="btn" data-a="done">${icon('check')} Já estudei (registrar)</button>
      <button class="btn" data-a="edit">${icon('edit')} Editar / mudar de dia</button>
      <button class="btn" data-a="skip">Pular</button>` : ''}
      <button class="btn danger" data-a="del">${icon('trash')} Excluir</button>
    </div>`, {
    onMount: m => m.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      closeModal();
      if (a === 'done') openLogForm(app, { manual: true, prefill: { ...x, durMin: x.dur, date: x.date <= todayISO() ? x.date : todayISO(), planSessionId: x.id } });
      if (a === 'edit') openSessionEditor(app, x);
      if (a === 'skip') app.update(s => { s.plan.sessions.find(y => y.id === id).status = 'descartado'; });
      if (a === 'del' && await confirmDialog('Excluir esta sessão do plano?', { ok: 'Excluir', danger: true })) app.update(s => { s.plan.sessions = s.plan.sessions.filter(y => y.id !== id); });
    }),
  });
}

function renderCycle(app) {
  const prog = cycleProgress(app.state);
  if (!prog) return `<div class="card empty">Nenhum ciclo montado. <button class="btn primary sm" data-act="new-cycle">Montar ciclo</button></div>`;
  return `<div class="card">
    <div class="card-h"><h3><span class="ico">${icon('repeat')}</span>Ciclo atual</h3><span class="small muted">desde ${fmtDate(app.state.cycle.startDate)}</span></div>
    <div class="row between small"><span>${Math.round(prog.pct * 100)}% do ciclo concluído</span>${prog.next ? `<span>Próxima: <b>${esc(app.subject(prog.next.subjectId)?.nome || '')}</b></span>` : '<span class="chip green">ciclo completo!</span>'}</div>
    ${progressBar(prog.pct)}
    <div class="list" style="margin-top:10px">${prog.items.map((i, n) => `<div class="li"><span class="chip">${n + 1}</span><div class="grow"><div class="ellipsis small"><b>${esc(app.subject(i.subjectId)?.nome || '—')}</b></div>${progressBar(i.doneMin / i.targetMin)}</div><span class="small num muted">${fmtMin(Math.min(i.doneMin, i.targetMin))}/${fmtMin(i.targetMin)}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-act="new-cycle">${icon('repeat')} ${prog.next ? 'Recalcular ciclo' : 'Iniciar novo ciclo'}</button></div>
    <p class="tiny muted" style="margin-top:8px">No ciclo não há dia fixo: você segue a ordem e estuda a próxima matéria sempre que tiver tempo. O painel “Hoje” sugere o que cabe nas janelas livres do dia.</p>
  </div>`;
}

export default {
  title: 'Plano',
  render(app) {
    const s = app.state, today = todayISO();
    const offset = +(app.params[0] || 0);
    const ws = addDays(weekStart(today), 7 * offset);
    const days = rangeDays(ws, 7);
    const late = pendingPast(s, today);
    const mode = s.profile.planMode;
    const weekSess = s.plan.sessions.filter(x => days.includes(x.date) && !['descartado', 'recuperado'].includes(x.status));
    const plannedMin = weekSess.reduce((a, x) => a + x.dur, 0);
    const doneMin = weekSess.filter(x => x.status === 'feito').reduce((a, x) => a + x.dur, 0);
    const freeMin = dayBudgets({ ...s, profile: { ...s.profile, weeklyGoalMin: 1e9 } }, days).reduce((a, b) => a + b, 0);

    const dayCols = days.map(d => {
      const evs = eventsOn(s, d);
      const ses = s.plan.sessions.filter(x => x.date === d && !['descartado', 'recuperado'].includes(x.status));
      return `<div class="day ${d === today ? 'today' : ''}">
        <div class="day-h"><b>${DOW_SHORT[dow(d)]} ${fmtDayMonth(d)}</b><button class="icon-btn" data-act="add" data-date="${d}" aria-label="Adicionar sessão">${icon('plus')}</button></div>
        ${evs.length ? `<div class="ev-item" title="Compromissos">${(() => {
          const g = {}; for (const e of evs) (g[e.title] ||= []).push(`${e.start.replace(':00', 'h')}–${e.end.replace(':00', 'h')}`);
          return Object.entries(g).map(([t, hs]) => `${esc(t)} ${esc(hs.join(', '))}`).join(' · ');
        })()}</div>` : ''}
        ${ses.map(x => { const l = sessLabels(app, x); return `<div class="sess-item m-${x.modalidade} ${x.status}" data-act="open" data-id="${esc(x.id)}" role="button" tabindex="0">
          <span class="tm">${esc(x.start || '')}</span>
          <div style="min-width:0"><div class="nm">${esc(l.nome)}</div><div class="tp">${esc(l.assunto)}</div></div>
          <span class="tiny muted num">${x.status === 'feito' ? icon('check') : fmtMin(x.dur)}</span></div>`; }).join('') || (evs.length ? '' : '<div class="tiny muted">Livre</div>')}
      </div>`;
    }).join('');

    return `
    <div class="row between"><h1>Plano de estudos</h1>
      <div class="tabs" style="flex:0 0 auto"><button class="${mode === 'calendario' ? 'active' : ''}" data-act="mode" data-mode="calendario">Calendário</button><button class="${mode === 'ciclo' ? 'active' : ''}" data-act="mode" data-mode="ciclo">Ciclo</button></div>
    </div>
    <p class="muted small" style="margin:6px 0 14px">O plano usa suas janelas livres (Minha rotina), a meta semanal, o peso e a dificuldade das matérias, seus erros nas questões e a data da prova-alvo.</p>
    ${late.length ? `<div class="banner">${icon('repeat')}<div style="flex:1"><b>${late.length} sessão(ões) atrasada(s).</b> Recuperar coloca no máximo uma por dia nos próximos 7 dias; o que não couber sai do plano, e o assunto continua na lista para voltar depois.<div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="recover" data-testid="recuperar">Recuperar pendentes</button><button class="btn sm" data-act="drop-late">Descartar atrasadas</button></div></div></div>` : ''}
    ${mode === 'ciclo' ? renderCycle(app) + '<div class="section-title"><h2>Agenda da semana</h2></div>' : ''}
    <div class="row between" style="margin-bottom:10px">
      <div class="row"><a class="btn sm" href="#/plano/${offset - 1}" aria-label="Semana anterior">‹</a><b>${fmtDate(ws, { short: true })} – ${fmtDate(addDays(ws, 6), { short: true })}</b><a class="btn sm" href="#/plano/${offset + 1}" aria-label="Próxima semana">›</a>${offset ? '<a class="btn sm ghost" href="#/plano">hoje</a>' : ''}</div>
      <div class="row">
        <button class="btn sm primary" data-act="generate" data-start="${offset > 0 ? ws : today}" data-testid="gerar-plano">${icon('sparkle')} ${weekSess.length ? 'Regenerar' : 'Gerar plano'}</button>
        <button class="btn sm" data-act="ics">${icon('download')} Calendário</button>
      </div>
    </div>
    <div class="row small muted" style="margin-bottom:10px;gap:14px"><span>Planejado: <b class="num">${fmtMin(plannedMin)}</b> de meta ${fmtMin(s.profile.weeklyGoalMin)}</span><span>Concluído: <b class="num">${fmtMin(doneMin)}</b></span><span>Tempo livre na rotina: ${fmtMin(freeMin)}</span></div>
    <div class="legend" style="margin-bottom:10px"><span><i style="background:var(--brand)"></i>Teoria</span><span><i style="background:var(--blue)"></i>Questões</span><span><i style="background:var(--violet)"></i>Revisão</span><span><i style="background:var(--amber)"></i>Simulado</span><span><i style="border:1px dashed var(--border-strong)"></i>Compromisso</span></div>
    <div class="week">${dayCols}</div>
    <p class="tiny muted" style="margin-top:10px">Toque numa sessão para iniciar, registrar, editar ou mudar de dia. Sessões editadas por você ficam travadas e não são alteradas ao regenerar.</p>`;
  },
  mount(root, app) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'open') openSessionDetail(app, a.dataset.id);
      if (act === 'add') openSessionEditor(app, null, a.dataset.date);
      if (act === 'generate') {
        if (!app.state.subjects.some(s => s.topics.length)) { toast('Cadastre matérias e assuntos primeiro (Edital e matérias).'); return; }
        app.regenerate({ start: a.dataset.start, days: a.dataset.start === todayISO() ? 7 - ((dow(todayISO()) + 6) % 7) + 7 : 7 });
        toast('Plano atualizado.');
      }
      if (act === 'recover') {
        let r; app.update(s => { r = recoverPending(s, app.contests(), { uid: app.uid }); });
        toast(`${r.recovered} sessão(ões) remarcada(s)${r.dropped ? `, ${r.dropped} deixada(s) de lado para não sobrecarregar` : ''}.`);
      }
      if (act === 'drop-late' && await confirmDialog('Descartar as sessões atrasadas? Os assuntos continuam como pendentes no edital.', { ok: 'Descartar' })) {
        app.update(s => { for (const x of pendingPast(s)) x.status = 'descartado'; });
      }
      if (act === 'mode') app.update(s => { s.profile.planMode = a.dataset.mode; if (a.dataset.mode === 'ciclo' && !s.cycle.items.length) s.cycle = buildCycle(s, app.contests()); });
      if (act === 'new-cycle') { app.update(s => { s.cycle = buildCycle(s, app.contests()); }); toast('Ciclo montado com base nas prioridades atuais.'); }
      if (act === 'ics') {
        download('rumo-plano.ics', buildICS(planCalendarItems(app.state, 14), 'Rumo – Plano de estudos'), 'text/calendar');
        toast('Arquivo .ics gerado: abra-o para adicionar as sessões ao calendário.');
      }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.act === 'open') openSessionDetail(app, e.target.dataset.id); });
  },
};
