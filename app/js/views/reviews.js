// Revisões programadas (1, 7 e 30 dias) e assuntos pendentes.
import { esc, icon, toast } from '../ui.js';
import { todayISO, relDays, addDays, nowHM } from '../time.js';
import { createTimer } from '../timer.js';
import { bySubject } from '../stats.js';

export default {
  title: 'Revisões',
  render(app) {
    const s = app.state, today = todayISO();
    const open = s.reviews.filter(r => !r.done).sort((a, b) => a.due.localeCompare(b.due));
    const late = open.filter(r => r.due < today), now = open.filter(r => r.due === today), next = open.filter(r => r.due > today && r.due <= addDays(today, 14));
    const row = r => {
      const sb = app.subject(r.subjectId), tp = sb?.topics.find(t => t.id === r.topicId);
      return `<div class="li"><div class="grow"><div class="small ellipsis"><b>${esc(sb?.nome || '—')}</b></div><div class="tiny muted ellipsis">${esc(tp?.nome || '')} · revisão de ${r.step} dia(s) · ${relDays(r.due, today)}</div></div>
        <a class="btn sm primary" href="#/estudar" data-act="start" data-id="${esc(r.id)}">${icon('play')}</a>
        <button class="btn sm" data-act="done" data-id="${esc(r.id)}" title="Marcar como feita">${icon('check')}</button>
        <button class="btn sm ghost" data-act="postpone" data-id="${esc(r.id)}" title="Adiar 1 dia">+1d</button></div>`;
    };
    const weak = bySubject(s).filter(x => x.q >= 5).sort((a, b) => b.errRate - a.errRate).slice(0, 3);
    const pendingTopics = s.subjects.map(sb => ({ sb, left: sb.topics.filter(t => !t.done) })).filter(x => x.left.length);
    return `<h1>Revisões</h1>
    <p class="muted small" style="margin:6px 0 14px">Ao registrar teoria ou questões de um assunto, o app agenda revisões em 1, 7 e 30 dias. Elas entram no plano (no máximo 2 por dia, curtas).</p>
    ${weak.length ? `<div class="banner">${icon('alert')}<div>Mais erros em: ${weak.map(w => `<b>${esc(w.nome)}</b> (${Math.round(w.errRate * 100)}%)`).join(', ')}. Priorize questões e revisões nessas matérias.</div></div>` : ''}
    <div class="grid-2">
      <div class="card"><div class="card-h"><h3><span class="ico violet">${icon('repeat')}</span>Para hoje</h3><span class="chip">${late.length + now.length}</span></div>
        ${late.length + now.length ? `<div class="list">${[...late, ...now].map(row).join('')}</div>` : '<div class="small muted">Nada para revisar hoje.</div>'}</div>
      <div class="card"><div class="card-h"><h3><span class="ico blue">${icon('calendar')}</span>Próximos 14 dias</h3><span class="chip">${next.length}</span></div>
        ${next.length ? `<div class="list">${next.map(row).join('')}</div>` : '<div class="small muted">Sem revisões agendadas.</div>'}</div>
    </div>
    <div class="section-title"><h2>Assuntos pendentes do edital</h2><a class="small" href="#/materias">abrir edital</a></div>
    <div class="grid-2">${pendingTopics.map(({ sb, left }) => `<div class="card"><div class="card-h"><h3>${esc(sb.nome)}</h3><span class="chip">${left.length} a estudar</span></div><div class="small ink2">${left.slice(0, 5).map(t => esc(t.nome)).join(' · ')}${left.length > 5 ? ` · +${left.length - 5}` : ''}</div></div>`).join('') || '<div class="card empty">Todos os assuntos marcados como estudados!</div>'}</div>`;
  },
  mount(root, app) {
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const id = a.dataset.id;
      if (a.dataset.act === 'start') {
        e.preventDefault();
        if (app.state.timer) { toast('Encerre a sessão em andamento antes de iniciar outra.'); app.go('estudar'); return; }
        const r = app.state.reviews.find(x => x.id === id);
        app.update(s => { s.timer = createTimer({ subjectId: r.subjectId, topicId: r.topicId, modalidade: 'revisao', contestId: null, start: nowHM() }); });
        app.go('estudar');
      }
      if (a.dataset.act === 'done') { app.update(s => { const r = s.reviews.find(x => x.id === id); r.done = true; r.doneAt = todayISO(); }); toast('Revisão concluída.'); }
      if (a.dataset.act === 'postpone') app.update(s => { const r = s.reviews.find(x => x.id === id); r.due = addDays(r.due < todayISO() ? todayISO() : r.due, 1); });
    });
  },
};
