// Tela "Estudar": cronômetro com matéria/assunto/concurso/modalidade, encerramento com questões
// e registro manual de estudo feito fora do app.
import { esc, icon, formData, toast, openModal, closeModal, modalHead, confirmDialog } from '../ui.js';
import { todayISO, fmtDur, nowHM, fmtMin, fmtDate } from '../time.js';
import { MODALIDADES, cycleToday } from '../planner.js';
import { createTimer, elapsedMs, pause, resume } from '../timer.js';

function subjectOptions(app, sel) {
  return app.state.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');
}
function topicOptions(app, subjectId, sel) {
  const s = app.subject(subjectId);
  return `<option value="">— Sem assunto específico —</option>` + (s?.topics || []).map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${t.done ? '✓ ' : ''}${esc(t.nome)}</option>`).join('');
}
function contestOptions(app, sel) {
  const mine = app.contests().filter(c => app.state.my[c.id] && app.state.my[c.id].status !== 'desisti');
  return `<option value="">— Geral —</option>` + mine.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.orgao)} · ${esc(c.cargo || '')}</option>`).join('');
}
function modPicker(name, sel) {
  return `<div class="mod-pick" role="radiogroup">${Object.entries(MODALIDADES).map(([k, v]) => `<label><input type="radio" name="${name}" value="${k}" ${k === sel ? 'checked' : ''}>${v}</label>`).join('')}</div>`;
}
function counter(name, label, value = 0) {
  return `<label class="field"><span>${label}</span><div class="counter"><button type="button" data-step="-1" data-for="${name}" aria-label="menos">−</button><input class="num" type="number" inputmode="numeric" min="0" name="${name}" id="f-${name}" value="${value}"><button type="button" data-step="1" data-for="${name}" aria-label="mais">+</button></div></label>`;
}

export function bindCounters(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    const inp = root.querySelector(`[name="${b.dataset.for}"]`);
    inp.value = Math.max(0, (+inp.value || 0) + (+b.dataset.step));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // acertos + erros = questões (preenche o que faltar)
  root.addEventListener('input', e => {
    const f = e.target.form; if (!f || !f.questoes) return;
    const q = +f.questoes.value || 0, a = +f.acertos.value || 0;
    if (e.target.name === 'acertos' || e.target.name === 'questoes') f.erros.value = Math.max(0, q - a);
    if (e.target.name === 'erros') f.acertos.value = Math.max(0, q - (+f.erros.value || 0));
  });
}

function findPlanned(app, id) {
  if (!id) return null;
  return app.state.plan.sessions.find(s => s.id === id) || cycleToday(app.state).find(s => s.id === id) || null;
}

// Formulário de encerramento / registro manual (compartilhado).
export function openLogForm(app, { durSec = null, prefill = {}, manual = false, onSaved } = {}) {
  const p = prefill;
  const html = `${modalHead(manual ? 'Registrar estudo feito fora do app' : 'Encerrar sessão')}
  <form id="log-form" class="stack">
    ${manual ? `<div class="form-grid">
      <label class="field"><span>Data</span><input class="input" type="date" name="date" id="f-date" value="${esc(p.date || todayISO())}" max="${todayISO()}" required></label>
      <label class="field"><span>Início</span><input class="input" type="time" name="start" id="f-start" value="${esc(p.start || '')}"></label>
      <label class="field"><span>Duração (min)</span><input class="input" type="number" inputmode="numeric" min="1" max="720" name="durMin" id="f-durMin" value="${esc(p.durMin || 50)}" required></label>
    </div>` : `<div class="banner green">${icon('clock')}<div>Tempo efetivo: <b class="num">${fmtDur(durSec, { showSec: true })}</b> (pausas e períodos inativos descontados).</div></div>`}
    <div class="form-grid">
      <label class="field"><span>Matéria</span><select class="input" name="subjectId" id="f-subjectId" required>${subjectOptions(app, p.subjectId)}</select></label>
      <label class="field"><span>Assunto</span><select class="input" name="topicId" id="f-topicId">${topicOptions(app, p.subjectId || app.state.subjects[0]?.id, p.topicId)}</select></label>
    </div>
    <label class="field"><span>Concurso</span><select class="input" name="contestId" id="f-contestId">${contestOptions(app, p.contestId)}</select></label>
    <div class="field"><span>Modalidade</span>${modPicker('modalidade', p.modalidade || 'teoria')}</div>
    <div class="form-grid">${counter('questoes', 'Questões feitas', p.questoes || 0)}${counter('acertos', 'Acertos', p.acertos || 0)}${counter('erros', 'Erros', p.erros || 0)}</div>
    <label class="checks"><label><input type="checkbox" name="markDone" id="f-markDone" ${p.modalidade !== 'revisao' ? 'checked' : ''}> Marcar assunto como estudado no edital</label></label>
    <label class="field"><span>Observações</span><textarea class="input" name="obs" id="f-obs" placeholder="Ex.: rever súmulas; errei por falta de atenção…">${esc(p.obs || '')}</textarea></label>
    <div class="modal-actions">${manual ? '<button type="button" class="btn" data-close>Cancelar</button>' : '<button type="button" class="btn danger" data-discard>Descartar</button><button type="button" class="btn" data-continue>Voltar ao cronômetro</button>'}<button class="btn primary" type="submit">${icon('check')} Salvar registro</button></div>
  </form>`;
  openModal(html, {
    dismissable: manual,
    onMount: m => {
      bindCounters(m);
      m.querySelector('[name=subjectId]').addEventListener('change', e => { m.querySelector('[name=topicId]').innerHTML = topicOptions(app, e.target.value); });
      m.querySelector('[data-continue]')?.addEventListener('click', () => { closeModal(); app.update(s => resume(s.timer)); });
      m.querySelector('[data-discard]')?.addEventListener('click', async () => {
        closeModal();
        if (await confirmDialog('Descartar esta sessão sem registrar o tempo?', { ok: 'Descartar', danger: true })) { app.update(s => { s.timer = null; }); toast('Sessão descartada.'); }
        else openLogForm(app, { durSec, prefill, manual, onSaved });
      });
      m.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const d = formData(e.target);
        const q = +d.questoes || 0, ok = Math.min(+d.acertos || 0, q), er = q ? Math.max(0, q - ok) : +d.erros || 0;
        if (q && ok + er !== q) { toast('Acertos + erros devem somar o total de questões.'); return; }
        const log = {
          date: manual ? d.date : todayISO(), start: manual ? (d.start || null) : p.start,
          durSec: manual ? Math.round(+d.durMin * 60) : Math.round(durSec),
          subjectId: d.subjectId, topicId: d.topicId || null, contestId: d.contestId || null, modalidade: d.modalidade,
          questoes: q, acertos: ok, erros: er, obs: d.obs?.trim() || '', source: manual ? 'manual' : 'cronometro', planSessionId: p.planSessionId || null,
        };
        if (!log.durSec || log.durSec < 60) { toast('Registre pelo menos 1 minuto de estudo.'); return; }
        closeModal();
        app.addLog(log, { markTopicDone: !!d.markDone && d.modalidade !== 'revisao' });
        if (!manual) app.update(s => { s.timer = null; });
        toast(`Registrado: ${fmtMin(Math.round(log.durSec / 60))}${q ? ` · ${q} questões` : ''}. Bom trabalho!`);
        onSaved?.(log);
      });
    },
  });
}

export default {
  title: 'Estudar',
  render(app) {
    const s = app.state;
    if (app.params[0] === 'manual') return `<h1>Registrar estudo</h1><p class="muted" style="margin:6px 0 14px">Estudou fora do app (livro, aula, papel)? Registre aqui para entrar nas estatísticas.</p><button class="btn primary" data-act="manual">${icon('plus')} Abrir formulário</button>`;
    const t = s.timer;
    if (t) {
      const subj = app.subject(t.subjectId); const topic = subj?.topics.find(x => x.id === t.topicId); const c = t.contestId && app.contest(t.contestId);
      const reason = t.pausedReason === 'inatividade' ? 'Pausado por inatividade — o intervalo sem resposta não foi contado.' : t.pausedReason === 'ausencia' ? 'Pausado: o tempo fora do app foi descontado.' : '';
      return `
      <h1>Sessão de estudo</h1>
      <p class="muted small" style="margin:4px 0 14px">Iniciada às ${esc(new Date(t.startedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }))} · só conta o tempo com o cronômetro ativo</p>
      <div class="card timer-card">
        <div class="row" style="justify-content:center"><span class="chip green">${esc(MODALIDADES[t.modalidade])}</span>${c ? `<span class="chip">${esc(c.orgao)}</span>` : ''}${t.running ? '<span class="chip blue">em andamento</span>' : '<span class="chip amber">pausado</span>'}</div>
        <div class="timer-display ${t.running ? '' : 'paused'}" data-live-timer data-testid="timer">${fmtDur(elapsedMs(t) / 1000, { showSec: true })}</div>
        <h2>${esc(subj?.nome || (t.modalidade === 'simulado' ? 'Simulado' : 'Estudo livre'))}</h2>
        <p class="muted">${esc(topic?.nome || '')}</p>
        ${reason ? `<div class="banner" style="margin-top:12px;text-align:left">${icon('info')}<div>${reason}</div></div>` : ''}
        <div class="timer-actions">
          ${t.running ? `<button class="btn lg" data-act="pause" data-testid="pausar">${icon('pause')} Pausar</button>` : `<button class="btn lg primary" data-act="resume" data-testid="retomar">${icon('play')} Retomar</button>`}
          <button class="btn lg" data-act="finish" data-testid="encerrar">${icon('stop')} Encerrar</button>
        </div>
      </div>
      <p class="small muted" style="margin-top:12px">A cada ${s.profile.inactivityMin} minutos o app pergunta se você continua estudando. Sem resposta em 3 minutos, o cronômetro pausa e o intervalo não conta. Se sair do app, ao voltar você decide se aquele tempo conta.</p>`;
    }
    const planned = findPlanned(app, app.params[0] === 'sessao' ? app.params[1] : null);
    const p = planned || {};
    return `
    <h1>Iniciar estudo</h1>
    <p class="muted small" style="margin:4px 0 14px">${planned ? `Sessão do plano: ${esc(planned.start || '')} · ${fmtMin(planned.dur)} sugeridos` : 'Escolha o que vai estudar. Você pode ajustar ao encerrar.'}</p>
    <form class="card stack" id="start-form">
      <div class="form-grid">
        <label class="field"><span>Matéria</span><select class="input" name="subjectId" id="s-subjectId">${subjectOptions(app, p.subjectId)}</select></label>
        <label class="field"><span>Assunto</span><select class="input" name="topicId" id="s-topicId">${topicOptions(app, p.subjectId || s.subjects[0]?.id, p.topicId)}</select></label>
      </div>
      <label class="field"><span>Concurso</span><select class="input" name="contestId" id="s-contestId">${contestOptions(app, p.contestId)}</select></label>
      <div class="field"><span>Modalidade</span>${modPicker('modalidade', p.modalidade || 'teoria')}</div>
      <input type="hidden" name="planSessionId" value="${esc(planned && planned.origin !== 'ciclo' ? planned.id : '')}">
      <button class="btn primary lg block" type="submit" data-testid="comecar">${icon('play')} Começar cronômetro</button>
    </form>
    <div class="row" style="margin-top:14px"><button class="btn" data-act="manual">${icon('plus')} Registrar estudo feito fora do app</button></div>
    ${s.logs.length ? `<div class="section-title"><h2>Últimos registros</h2></div><div class="card"><div class="list">${s.logs.slice(-6).reverse().map(l => `<div class="li"><div class="grow"><div class="ellipsis"><b>${esc(app.subject(l.subjectId)?.nome || '—')}</b> · ${esc(MODALIDADES[l.modalidade])}</div><div class="tiny muted">${fmtDate(l.date)} · ${fmtMin(Math.round(l.durSec / 60))}${l.questoes ? ` · ${l.acertos}/${l.questoes} acertos` : ''}${l.source === 'manual' ? ' · manual' : ''}</div></div><button class="icon-btn" data-act="del-log" data-id="${esc(l.id)}" aria-label="Excluir registro">${icon('trash')}</button></div>`).join('')}</div></div>` : ''}`;
  },
  mount(root, app) {
    if (app.params[0] === 'manual') {
      history.replaceState(null, '', '#/estudar'); // evita reabrir o formulário a cada atualização da tela
      app.render();
      openLogForm(app, { manual: true, prefill: { subjectId: app.state.subjects[0]?.id }, onSaved: () => app.go('hoje') });
      return;
    }
    const f = root.querySelector('#start-form');
    if (f) {
      f.subjectId.addEventListener('change', () => { f.topicId.innerHTML = topicOptions(app, f.subjectId.value); });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const d = formData(f);
        app.update(s => { s.timer = createTimer({ subjectId: d.subjectId, topicId: d.topicId || null, contestId: d.contestId || null, modalidade: d.modalidade, planSessionId: d.planSessionId || null, start: nowHM() }); });
        app.go('estudar');
      });
    }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'pause') app.update(s => pause(s.timer));
      if (act === 'resume') app.update(s => resume(s.timer));
      if (act === 'manual') openLogForm(app, { manual: true, prefill: { subjectId: app.state.subjects[0]?.id } });
      if (act === 'finish') {
        app.update(s => pause(s.timer), { silent: true });
        const t = app.state.timer;
        openLogForm(app, { durSec: elapsedMs(t) / 1000, prefill: { ...t, start: t.start } });
      }
      if (act === 'del-log' && await confirmDialog('Excluir este registro de estudo?', { ok: 'Excluir', danger: true })) {
        app.update(s => {
          const l = s.logs.find(x => x.id === a.dataset.id);
          s.logs = s.logs.filter(x => x.id !== a.dataset.id);
          const ps = l?.planSessionId && s.plan.sessions.find(x => x.id === l.planSessionId);
          if (ps) ps.status = 'pendente';
        });
      }
    });
  },
};
