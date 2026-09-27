// Minha rotina: compromissos (escritório, faculdade, pessoal), janelas livres para estudo e tarefas.
import { esc, icon, openModal, closeModal, modalHead, formData, toast, confirmDialog } from '../ui.js';
import { DOW_SHORT, todayISO, fmtDate, dow, hmToMin, fmtMin } from '../time.js';

const TYPES = { escritorio: ['Escritório', 'blue'], faculdade: ['Faculdade', 'violet'], pessoal: ['Pessoal', 'amber'] };
const ORDER_DOWS = [1, 2, 3, 4, 5, 6, 0];

const dowChecks = (sel = []) => `<div class="checks">${ORDER_DOWS.map(d => `<label><input type="checkbox" name="dows" value="${d}" ${sel.includes(d) ? 'checked' : ''}>${DOW_SHORT[d]}</label>`).join('')}</div>`;

function eventForm(ev = {}) {
  return `<form class="stack">
    <label class="field"><span>Compromisso</span><input class="input" name="title" id="ev-title" value="${esc(ev.title)}" required placeholder="Ex.: Reunião com cliente"></label>
    <label class="field"><span>Tipo</span><select class="input" name="type" id="ev-type">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}" ${k === (ev.type || 'pessoal') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="field"><span>Repete em</span>${dowChecks(ev.dows || [])}</div>
    <label class="field"><span>…ou numa data específica</span><input class="input" type="date" name="date" id="ev-date" value="${esc(ev.date)}"></label>
    <div class="form-grid"><label class="field"><span>Início</span><input class="input" type="time" name="start" id="ev-start" value="${esc(ev.start || '08:00')}" required></label><label class="field"><span>Fim</span><input class="input" type="time" name="end" id="ev-end" value="${esc(ev.end || '09:00')}" required></label></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`;
}
function slotForm(sl = {}) {
  return `<form class="stack">
    <div class="field"><span>Dias</span>${dowChecks(sl.dow != null ? [sl.dow] : [])}</div>
    <div class="form-grid"><label class="field"><span>De</span><input class="input" type="time" name="start" id="sl-start" value="${esc(sl.start || '06:00')}" required></label><label class="field"><span>Até</span><input class="input" type="time" name="end" id="sl-end" value="${esc(sl.end || '07:00')}" required></label></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`;
}
function taskForm(t = {}) {
  return `<form class="stack">
    <label class="field"><span>Tarefa ou lembrete</span><input class="input" name="title" id="tk-title" value="${esc(t.title)}" required placeholder="Ex.: Enviar DCTFWeb dos clientes"></label>
    <label class="field"><span>Data</span><input class="input" type="date" name="date" id="tk-date" value="${esc(t.date || '')}"></label>
    <div class="field"><span>…ou repetir em</span>${dowChecks(t.dows || [])}</div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`;
}

function afterRoutineChange(app) {
  app.regenerate();
  toast('Rotina salva. O plano foi reajustado aos novos horários.');
}

export default {
  title: 'Minha rotina',
  render(app) {
    const s = app.state, today = todayISO();
    const perDay = ORDER_DOWS.map(d => {
      const evs = s.events.filter(e => e.dows?.includes(d)).sort((a, b) => a.start.localeCompare(b.start));
      const av = s.availability.filter(a => a.dow === d).sort((a, b) => a.start.localeCompare(b.start));
      const freeMin = av.reduce((a, x) => a + hmToMin(x.end) - hmToMin(x.start), 0);
      return `<div class="day ${dow(today) === d ? 'today' : ''}"><div class="day-h"><b>${DOW_SHORT[d]}</b><span class="tiny muted">${fmtMin(freeMin)} livres</span></div>
        ${evs.map(e => `<div class="ev-item" style="border-style:solid">${esc(e.start)}–${esc(e.end)} ${esc(e.title)}</div>`).join('')}
        ${av.map(a => `<div class="sess-item" style="grid-template-columns:1fr auto"><span class="tm">${esc(a.start)}–${esc(a.end)} estudo</span><button class="icon-btn" data-act="del-slot" data-id="${esc(a.id)}" aria-label="Remover janela">${icon('x')}</button></div>`).join('')}
      </div>`;
    }).join('');
    const dated = s.events.filter(e => e.date && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const tasks = s.tasks.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const isDone = t => (t.date ? t.done : (t.doneDates || []).includes(today));
    return `<h1>Minha rotina</h1>
    <p class="muted small" style="margin:6px 0 14px">Compromissos bloqueiam horários; as janelas verdes são onde o plano coloca as sessões de estudo. Mantenha simples: o foco é o estudo.</p>
    <div class="row" style="margin-bottom:12px"><button class="btn sm primary" data-act="new-slot">${icon('plus')} Janela de estudo</button><button class="btn sm" data-act="new-ev">${icon('plus')} Compromisso</button><button class="btn sm" data-act="new-task">${icon('plus')} Tarefa / lembrete</button></div>
    <div class="week">${perDay}</div>

    <div class="grid-2" style="margin-top:14px">
      <div class="card"><div class="card-h"><h3><span class="ico blue">${icon('briefcase')}</span>Compromissos recorrentes</h3></div>
        <div class="list">${s.events.filter(e => !e.date).map(e => `<div class="li"><span class="chip ${TYPES[e.type]?.[1] || ''}">${esc(TYPES[e.type]?.[0] || e.type)}</span><div class="grow"><div class="small"><b>${esc(e.title)}</b></div><div class="tiny muted">${ORDER_DOWS.filter(d => e.dows?.includes(d)).map(d => DOW_SHORT[d]).join(', ')} · ${esc(e.start)}–${esc(e.end)}</div></div><button class="icon-btn" data-act="edit-ev" data-id="${esc(e.id)}" aria-label="Editar">${icon('edit')}</button><button class="icon-btn" data-act="del-ev" data-id="${esc(e.id)}" aria-label="Excluir">${icon('trash')}</button></div>`).join('') || '<div class="small muted">Nenhum.</div>'}</div>
        ${dated.length ? `<h3 style="margin-top:12px">Datas específicas</h3><div class="list">${dated.map(e => `<div class="li"><span class="chip ${TYPES[e.type]?.[1] || ''}">${esc(TYPES[e.type]?.[0] || '')}</span><div class="grow small"><b>${esc(e.title)}</b><div class="tiny muted">${fmtDate(e.date)} · ${esc(e.start)}–${esc(e.end)}</div></div><button class="icon-btn" data-act="edit-ev" data-id="${esc(e.id)}" aria-label="Editar">${icon('edit')}</button><button class="icon-btn" data-act="del-ev" data-id="${esc(e.id)}" aria-label="Excluir">${icon('trash')}</button></div>`).join('')}</div>` : ''}
      </div>
      <div class="card"><div class="card-h"><h3><span class="ico amber">${icon('bell')}</span>Tarefas e lembretes</h3></div>
        <div class="list">${tasks.map(t => `<div class="li"><input type="checkbox" data-act="task-done" data-id="${esc(t.id)}" ${isDone(t) ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--brand)" aria-label="Concluída"><div class="grow small ${isDone(t) ? 'muted' : ''}"><b>${esc(t.title)}</b><div class="tiny muted">${t.date ? fmtDate(t.date) : 'toda ' + ORDER_DOWS.filter(d => t.dows?.includes(d)).map(d => DOW_SHORT[d]).join(', ')}</div></div><button class="icon-btn" data-act="del-task" data-id="${esc(t.id)}" aria-label="Excluir">${icon('trash')}</button></div>`).join('') || '<div class="small muted">Sem tarefas. Use para lembretes rápidos do escritório ou da faculdade.</div>'}</div>
      </div>
    </div>`;
  },
  mount(root, app) {
    const bindForm = (title, html, onSave) => openModal(`${modalHead(title)}${html}`, {
      onMount: m => m.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const d = formData(e.target); d.dows = [].concat(d.dows || []).map(Number);
        if (d.start && d.end && hmToMin(d.end) <= hmToMin(d.start)) { toast('O horário final deve ser depois do inicial.'); return; }
        if (onSave(d) === false) return;
        closeModal();
      }),
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const id = a.dataset.id, act = a.dataset.act;
      if (act === 'new-ev' || act === 'edit-ev') {
        const ev = act === 'edit-ev' ? app.state.events.find(x => x.id === id) : {};
        bindForm(act === 'new-ev' ? 'Novo compromisso' : 'Editar compromisso', eventForm(ev), d => {
          if (!d.date && !d.dows.length) { toast('Escolha dias da semana ou uma data.'); return false; }
          app.update(s => {
            const item = { id: ev.id || app.uid('evt'), title: d.title.trim(), type: d.type, start: d.start, end: d.end, remind: false, ...(d.date ? { date: d.date, dows: [] } : { dows: d.dows, date: '' }) };
            const i = s.events.findIndex(x => x.id === item.id); if (i >= 0) s.events[i] = item; else s.events.push(item);
          }, { silent: true });
          afterRoutineChange(app);
        });
      }
      if (act === 'del-ev' && await confirmDialog('Excluir este compromisso?', { ok: 'Excluir', danger: true })) { app.update(s => { s.events = s.events.filter(x => x.id !== id); }, { silent: true }); afterRoutineChange(app); }
      if (act === 'new-slot') bindForm('Janela para estudar', slotForm(), d => {
        if (!d.dows.length) { toast('Escolha ao menos um dia.'); return false; }
        app.update(s => { for (const w of d.dows) s.availability.push({ id: app.uid('disp'), dow: w, start: d.start, end: d.end }); }, { silent: true });
        afterRoutineChange(app);
      });
      if (act === 'del-slot') { app.update(s => { s.availability = s.availability.filter(x => x.id !== id); }, { silent: true }); afterRoutineChange(app); }
      if (act === 'new-task') bindForm('Nova tarefa', taskForm(), d => {
        if (!d.date && !d.dows.length) d.date = todayISO();
        app.update(s => s.tasks.push({ id: app.uid('tar'), title: d.title.trim(), date: d.date || '', dows: d.date ? [] : d.dows, done: false, doneDates: [] }));
      });
      if (act === 'del-task') app.update(s => { s.tasks = s.tasks.filter(x => x.id !== id); });
    });
    root.addEventListener('change', e => {
      const a = e.target.closest('[data-act="task-done"]'); if (!a) return;
      const today = todayISO();
      app.update(s => {
        const t = s.tasks.find(x => x.id === a.dataset.id);
        if (t.date) t.done = a.checked;
        else { t.doneDates = (t.doneDates || []).filter(d => d !== today); if (a.checked) t.doneDates.push(today); }
      });
    });
  },
};
