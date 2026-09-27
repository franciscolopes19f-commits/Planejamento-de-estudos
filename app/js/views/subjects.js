// Edital e matérias: disciplinas com peso, dificuldade e lista de assuntos para marcar.
import { esc, icon, openModal, closeModal, modalHead, formData, toast, confirmDialog, progressBar, pct } from '../ui.js';
import { todayISO } from '../time.js';

// Converte o texto colado do edital em assuntos: aceita linhas, ";" e numeração "1.", "1.1", "2)".
export function parseTopics(text) {
  return text
    .replace(/\r/g, '')
    .split(/\n|;|(?=\s\d{1,2}(?:\.\d{1,2})*[.)]\s)/)
    .map(t => t.replace(/^\s*[-•*]?\s*\d{0,2}(?:\.\d{1,2})*[.)-]?\s*/, '').replace(/\s+/g, ' ').trim().replace(/[.,]$/, ''))
    .filter(t => t.length > 2);
}

function subjectForm(app, sb = null) {
  const mine = app.contests().filter(c => app.state.my[c.id]);
  const sel = sb?.contestIds || [];
  const scale = (name, v) => `<select class="input" name="${name}" id="sj-${name}">${[1, 2, 3, 4, 5].map(n => `<option ${n === (v || 3) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  return `<form class="stack" id="subject-form">
    <label class="field"><span>Nome da matéria</span><input class="input" name="nome" id="sj-nome" value="${esc(sb?.nome)}" required></label>
    <div class="form-grid">
      <label class="field"><span>Peso no edital (1–5)</span>${scale('peso', sb?.peso)}</label>
      <label class="field"><span>Minha dificuldade (1–5)</span>${scale('dificuldade', sb?.dificuldade)}</label>
    </div>
    <div class="field"><span>Concursos em que cai (vazio = todos)</span>
      ${mine.length ? `<div class="checks">${mine.map(c => `<label><input type="checkbox" name="contestIds" value="${esc(c.id)}" ${sel.includes(c.id) ? 'checked' : ''}>${esc(c.orgao)}</label>`).join('')}</div>` : '<span class="tiny muted">Acompanhe concursos para vinculá-los.</span>'}
    </div>
    <label class="field"><span>${sb ? 'Adicionar assuntos' : 'Assuntos'} — cole o conteúdo do edital (um por linha, “;” ou numerado)</span><textarea class="input" name="topics" id="sj-topics" rows="6" placeholder="1. Princípios fundamentais. 2. Direitos e garantias; 3. Organização do Estado"></textarea></label>
    ${sb ? `<div class="checks"><label><input type="checkbox" name="paused" ${sb.paused ? 'checked' : ''}> Pausar matéria (fica fora do plano)</label></div>` : ''}
    <div class="modal-actions">${sb ? '<button type="button" class="btn danger" data-del>Excluir matéria</button>' : ''}<button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
  </form>`;
}

function openSubject(app, sb = null) {
  openModal(`${modalHead(sb ? 'Editar matéria' : 'Nova matéria')}${subjectForm(app, sb)}`, {
    onMount: m => {
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        closeModal();
        if (await confirmDialog(`Excluir "${sb.nome}" e seus assuntos? Os registros de estudo continuam salvos.`, { ok: 'Excluir', danger: true })) {
          app.update(s => { s.subjects = s.subjects.filter(x => x.id !== sb.id); s.plan.sessions = s.plan.sessions.filter(x => x.subjectId !== sb.id || x.status === 'feito'); s.reviews = s.reviews.filter(r => r.subjectId !== sb.id); });
        }
      });
      m.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const d = formData(e.target);
        const ids = [].concat(d.contestIds || []);
        const newTopics = parseTopics(d.topics || '').map(nome => ({ id: app.uid('ass'), nome, done: false, doneAt: null }));
        app.update(s => {
          if (sb) {
            const x = s.subjects.find(y => y.id === sb.id);
            Object.assign(x, { nome: d.nome.trim(), peso: +d.peso, dificuldade: +d.dificuldade, contestIds: ids, paused: !!d.paused });
            x.topics.push(...newTopics);
          } else s.subjects.push({ id: app.uid('mat'), nome: d.nome.trim(), peso: +d.peso, dificuldade: +d.dificuldade, contestIds: ids, topics: newTopics });
        });
        closeModal(); toast(`Matéria salva${newTopics.length ? ` com ${newTopics.length} assunto(s) novo(s)` : ''}.`);
      });
    },
  });
}

const openState = new Set();

export default {
  title: 'Edital e matérias',
  render(app) {
    const s = app.state;
    const total = s.subjects.reduce((a, x) => a + x.topics.length, 0), done = s.subjects.reduce((a, x) => a + x.topics.filter(t => t.done).length, 0);
    return `<div class="row between"><h1>Edital e matérias</h1><button class="btn primary sm" data-act="new">${icon('plus')} Nova matéria</button></div>
    <p class="muted small" style="margin:6px 0 12px">Marque o que já estudou. Peso e dificuldade definem quanto tempo cada matéria recebe no plano. As matérias de exemplo refletem a área fiscal — ajuste conforme o edital do seu concurso-alvo.</p>
    <div class="card" style="margin-bottom:12px"><div class="row between"><b>${done} de ${total} assuntos estudados</b><span class="big" style="font-size:20px">${pct(total ? done / total : 0)}</span></div>${progressBar(total ? done / total : 0)}</div>
    <div class="stack">${s.subjects.map(sb => {
      const d = sb.topics.filter(t => t.done).length;
      const cs = (sb.contestIds || []).map(id => app.contest(id)?.orgao).filter(Boolean);
      return `<details class="card subject" data-id="${esc(sb.id)}" ${openState.has(sb.id) ? 'open' : ''}>
        <summary><div class="row between"><div style="min-width:0;flex:1"><h3>${esc(sb.nome)} ${sb.paused ? '<span class="chip">pausada</span>' : ''}</h3>
          <div class="tiny muted">peso ${sb.peso} · dificuldade ${sb.dificuldade}${cs.length ? ' · ' + esc(cs.join(', ')) : ''}</div></div>
          <span class="small num muted">${d}/${sb.topics.length}</span></div>
          <div style="margin-top:8px">${progressBar(sb.topics.length ? d / sb.topics.length : 0)}</div></summary>
        <div style="margin-top:10px">
          ${sb.topics.map(t => `<div class="topic ${t.done ? 'done' : ''}"><input type="checkbox" data-act="toggle" data-s="${esc(sb.id)}" data-t="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="Estudado: ${esc(t.nome)}"><span class="tn">${esc(t.nome)}</span><button class="icon-btn" data-act="del-topic" data-s="${esc(sb.id)}" data-t="${esc(t.id)}" aria-label="Remover assunto">${icon('x')}</button></div>`).join('') || '<div class="small muted">Nenhum assunto. Edite para colar o conteúdo do edital.</div>'}
          <form class="row" data-add="${esc(sb.id)}" style="margin-top:8px;flex-wrap:nowrap"><input class="input" name="nome" id="add-${esc(sb.id)}" placeholder="Novo assunto" aria-label="Novo assunto"><button class="btn sm" type="submit">${icon('plus')}</button></form>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-act="edit" data-s="${esc(sb.id)}">${icon('edit')} Editar / colar edital</button></div>
        </div>
      </details>`;
    }).join('')}</div>`;
  },
  mount(root, app) {
    root.querySelectorAll('details.subject').forEach(d => d.addEventListener('toggle', () => { if (d.open) openState.add(d.dataset.id); else openState.delete(d.dataset.id); }));
    root.addEventListener('change', e => {
      const a = e.target.closest('[data-act="toggle"]'); if (!a) return;
      app.update(s => { const t = s.subjects.find(x => x.id === a.dataset.s).topics.find(x => x.id === a.dataset.t); t.done = a.checked; t.doneAt = a.checked ? todayISO() : null; });
    });
    root.addEventListener('submit', e => {
      const f = e.target.closest('[data-add]'); if (!f) return;
      e.preventDefault();
      const nome = f.nome.value.trim(); if (!nome) return;
      app.update(s => s.subjects.find(x => x.id === f.dataset.add).topics.push({ id: app.uid('ass'), nome, done: false, doneAt: null }));
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'new') openSubject(app);
      if (a.dataset.act === 'edit') openSubject(app, app.subject(a.dataset.s));
      if (a.dataset.act === 'del-topic') {
        e.preventDefault();
        if (await confirmDialog('Remover este assunto?', { ok: 'Remover', danger: true })) app.update(s => { const sb = s.subjects.find(x => x.id === a.dataset.s); sb.topics = sb.topics.filter(t => t.id !== a.dataset.t); });
      }
    });
  },
};
