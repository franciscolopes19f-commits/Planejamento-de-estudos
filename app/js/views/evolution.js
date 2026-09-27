// Evolução: horas, frequência, questões, acertos, progresso no edital e simulados.
import { esc, icon, pct, columnChart, progressBar, openModal, closeModal, modalHead, formData, toast, confirmDialog } from '../ui.js';
import { todayISO, addDays, fmtMin, fmtDate, fmtDayMonth, DOW_SHORT, dow, rangeDays } from '../time.js';
import { minutesByDay, weeklySeries, questionTotals, bySubject, editalProgress, streak } from '../stats.js';

function simuladoForm(app) {
  const mine = app.contests().filter(c => app.state.my[c.id]);
  return `<form class="stack" id="sim-form">
    <label class="field"><span>Nome do simulado</span><input class="input" name="nome" id="sim-nome" required placeholder="Ex.: Simulado SEFAZ nº 3"></label>
    <div class="form-grid">
      <label class="field"><span>Data</span><input class="input" type="date" name="date" id="sim-date" value="${todayISO()}" max="${todayISO()}" required></label>
      <label class="field"><span>Concurso</span><select class="input" name="contestId" id="sim-contestId"><option value="">—</option>${mine.map(c => `<option value="${esc(c.id)}">${esc(c.orgao)}</option>`).join('')}</select></label>
    </div>
    <div class="form-grid">
      <label class="field"><span>Total de questões</span><input class="input" type="number" min="1" name="total" id="sim-total" required></label>
      <label class="field"><span>Acertos</span><input class="input" type="number" min="0" name="acertos" id="sim-acertos" required></label>
      <label class="field"><span>Nota final (opcional)</span><input class="input" type="number" step="0.01" name="nota" id="sim-nota"></label>
    </div>
    <label class="field"><span>Duração (min, entra no tempo estudado)</span><input class="input" type="number" min="0" name="durMin" id="sim-durMin" placeholder="Ex.: 240"></label>
    <label class="field"><span>Observações</span><textarea class="input" name="obs" id="sim-obs" placeholder="Matérias em que fui pior, gestão do tempo…"></textarea></label>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar simulado</button></div>
  </form>`;
}

export default {
  title: 'Evolução',
  render(app) {
    const s = app.state, today = todayISO();
    const from = addDays(today, -13);
    const md = minutesByDay(s, from, today);
    const days = Object.keys(md);
    const weeks = weeklySeries(s, 8, today);
    const q30 = questionTotals(s, addDays(today, -29), today);
    const qAll = questionTotals(s);
    const min30 = Object.values(minutesByDay(s, addDays(today, -29), today)).reduce((a, b) => a + b, 0);
    const studied28 = rangeDays(addDays(today, -27), 28);
    const md28 = minutesByDay(s, studied28[0], today);
    const daysStudied = studied28.filter(d => md28[d] >= 15).length;
    const subs = bySubject(s);
    const errRank = subs.filter(x => x.q >= 1).sort((a, b) => b.errRate - a.errRate);
    const mine = app.contests().filter(c => s.my[c.id] && s.my[c.id].status !== 'desisti');
    const st = streak(s, today);
    const sims = s.simulados.slice().sort((a, b) => a.date.localeCompare(b.date));

    return `<h1>Evolução</h1>
    <p class="muted small" style="margin:6px 0 14px">Só entra aqui o tempo registrado em sessões de estudo (cronômetro ou registro manual). Tempo com o app aberto é mostrado à parte.</p>
    <div class="grid">
      <div class="card"><div class="small muted">Horas nos últimos 30 dias</div><div class="big">${fmtMin(Math.round(min30))}</div></div>
      <div class="card"><div class="small muted">Dias com estudo (últimas 4 semanas)</div><div class="big">${daysStudied}<small>/28</small></div><div class="tiny muted">sequência atual: ${st.current} · recorde: ${st.best}</div></div>
      <div class="card"><div class="small muted">Questões (30 dias)</div><div class="big">${q30.q}</div><div class="tiny muted">total geral: ${qAll.q}</div></div>
      <div class="card"><div class="small muted">Acertos (30 dias)</div><div class="big">${pct(q30.acc)}</div>${progressBar(q30.acc || 0)}</div>
    </div>

    <div class="grid-2" style="margin-top:12px">
      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('clock')}</span>Minutos estudados por dia</h3><span class="tiny muted">linha: meta diária</span></div>
        ${columnChart(days.map(d => ({ label: fmtDate(d), short: `${DOW_SHORT[dow(d)][0]}${d.slice(8)}`, v: Math.round(md[d]) })), { goal: s.profile.dailyGoalMin, fmt: v => fmtMin(Math.round(v)) })}
        <details class="small"><summary class="muted">Ver em tabela</summary><div class="table-wrap"><table class="tbl"><tr><th>Dia</th><th class="r">Minutos</th></tr>${days.map(d => `<tr><td>${fmtDate(d)}</td><td class="r">${Math.round(md[d])}</td></tr>`).join('')}</table></div></details>
      </div>
      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('chart')}</span>Horas por semana</h3><span class="tiny muted">linha: meta semanal</span></div>
        ${columnChart(weeks.map(w => ({ label: `Semana de ${fmtDate(w.start)}`, short: fmtDayMonth(w.start), v: w.min / 60 })), { goal: s.profile.weeklyGoalMin / 60, fmt: v => `${v.toFixed(1).replace('.', ',')}h` })}
        <details class="small"><summary class="muted">Ver em tabela</summary><div class="table-wrap"><table class="tbl"><tr><th>Semana</th><th class="r">Horas</th></tr>${weeks.map(w => `<tr><td>${fmtDate(w.start)}</td><td class="r">${(w.min / 60).toFixed(1)}</td></tr>`).join('')}</table></div></details>
      </div>
    </div>

    <div class="grid-2" style="margin-top:12px">
      <div class="card">
        <div class="card-h"><h3><span class="ico red">${icon('alert')}</span>Onde você mais erra</h3></div>
        ${errRank.length ? `<div class="table-wrap"><table class="tbl"><tr><th>Matéria</th><th class="r">Questões</th><th class="r">Erros</th><th class="r">% acerto</th></tr>${errRank.map((x, i) => `<tr><td>${i < 2 && x.errRate > 0.3 ? '<span class="chip red">foco</span> ' : ''}${esc(x.nome)}</td><td class="r">${x.q}</td><td class="r">${x.err}</td><td class="r">${pct(x.acc)}</td></tr>`).join('')}</table></div>
          <p class="tiny muted" style="margin-top:8px">Matérias com mais erros ganham mais espaço automaticamente no próximo plano.</p>` : '<div class="small muted">Registre questões ao encerrar as sessões para ver este ranking.</div>'}
      </div>
      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('list')}</span>Progresso por disciplina</h3><a class="small" href="#/materias">edital</a></div>
        ${subs.map(x => `<div class="hbar"><span class="ellipsis">${esc(x.nome)}</span>${progressBar(x.pct)}<span class="num tiny muted">${x.done}/${x.total} · ${fmtMin(Math.round(x.min))}</span></div>`).join('')}
      </div>
    </div>

    <div class="grid-2" style="margin-top:12px">
      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('trophy')}</span>Progresso por concurso</h3></div>
        ${mine.length ? mine.map(c => { const e = editalProgress(s, c.id); return `<div class="hbar"><span class="ellipsis">${esc(c.orgao)}</span>${progressBar(e.pct)}<span class="num tiny muted">${pct(e.pct)}</span></div>`; }).join('') : '<div class="small muted">Acompanhe um concurso para ver o avanço no edital dele. Vincule matérias a concursos em “Edital e matérias”.</div>'}
      </div>
      <div class="card">
        <div class="card-h"><h3><span class="ico amber">${icon('target')}</span>Simulados</h3><button class="btn sm primary" data-act="sim-new">${icon('plus')} Registrar</button></div>
        ${sims.length ? `${sims.length >= 2 ? columnChart(sims.slice(-10).map(x => ({ label: `${x.nome} (${fmtDate(x.date)})`, short: fmtDate(x.date, { short: true }), v: 100 * x.acertos / x.total })), { fmt: v => `${Math.round(v)}%`, height: 120 }) : ''}
          <div class="list">${sims.slice().reverse().map(x => `<div class="li"><div class="grow"><div class="small"><b>${esc(x.nome)}</b></div><div class="tiny muted">${fmtDate(x.date)}${x.contestId && app.contest(x.contestId) ? ' · ' + esc(app.contest(x.contestId).orgao) : ''}${x.nota != null && x.nota !== '' ? ` · nota ${esc(x.nota)}` : ''}</div></div><span class="chip ${x.acertos / x.total >= 0.7 ? 'green' : 'amber'}">${x.acertos}/${x.total} · ${pct(x.acertos / x.total)}</span><button class="icon-btn" data-act="sim-del" data-id="${esc(x.id)}" aria-label="Excluir simulado">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="small muted">Nenhum simulado registrado.</div>'}
      </div>
    </div>`;
  },
  mount(root, app) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'sim-new') {
        openModal(`${modalHead('Registrar simulado')}${simuladoForm(app)}`, {
          onMount: m => m.querySelector('form').addEventListener('submit', ev => {
            ev.preventDefault();
            const d = formData(ev.target);
            if (+d.acertos > +d.total) { toast('Acertos não podem passar do total.'); return; }
            app.update(s => {
              const id = app.uid('sim');
              s.simulados.push({ id, nome: d.nome.trim(), date: d.date, contestId: d.contestId || null, total: +d.total, acertos: +d.acertos, nota: d.nota === '' ? null : +d.nota, obs: d.obs });
              if (+d.durMin > 0) s.logs.push({ id: app.uid('log'), createdAt: new Date().toISOString(), date: d.date, durSec: +d.durMin * 60, subjectId: null, topicId: null, contestId: d.contestId || null, modalidade: 'simulado', questoes: +d.total, acertos: +d.acertos, erros: +d.total - +d.acertos, obs: d.nome, source: 'simulado', simuladoId: id });
            });
            closeModal(); toast('Simulado registrado.');
          }),
        });
      }
      if (a.dataset.act === 'sim-del' && await confirmDialog('Excluir este simulado?', { ok: 'Excluir', danger: true })) {
        app.update(s => { s.simulados = s.simulados.filter(x => x.id !== a.dataset.id); s.logs = s.logs.filter(l => l.simuladoId !== a.dataset.id); });
      }
    });
  },
};
