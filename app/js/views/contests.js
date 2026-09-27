// Radar de concursos + Meus concursos (acompanhamento de inscrições).
import { esc, icon, money, safeUrl, openModal, closeModal, modalHead, formData, toast, confirmDialog, download } from '../ui.js';
import { todayISO, fmtDate, diffDays, relDays } from '../time.js';
import { AREAS, LOCAIS, SITUACOES, SITUACAO_LABEL, CONFIABILIDADE, MY_STATUS, MY_STATUS_LABEL, situacao, searchContests, findDuplicate, matchesPrefs } from '../radar.js';
import { DEFAULT_ALERTS, buildICS, contestCalendarItems } from '../alerts.js';

const filters = { q: '', situacao: '', area: '', local: '', onlyPrefs: true };
const ORDER = ['abertas', 'prova_proxima', 'edital', 'previsto', 'encerradas'];

function confiBadge(c) {
  const k = c.confiabilidade || 'noticia';
  const ic = k === 'oficial' ? 'checkCircle' : k === 'previsao' ? 'info' : 'link';
  return `<span class="confi ${k}" title="${esc(CONFIABILIDADE[k]?.desc)}">${icon(ic)}${esc(CONFIABILIDADE[k]?.label || k)}</span>`;
}

function datesText(c) {
  const insc = c.inscInicio || c.inscFim ? `${c.inscInicio ? fmtDate(c.inscInicio, { short: true }) : '?'} a ${c.inscFim ? fmtDate(c.inscFim) : '?'}` : 'não divulgadas';
  return { insc, prova: c.prova ? fmtDate(c.prova) : 'não divulgada' };
}

function contestCard(app, c, today) {
  const my = app.state.my[c.id];
  const sit = situacao(c, today);
  const d = datesText(c);
  const link = safeUrl(c.link), src = safeUrl(c.fonteUrl);
  return `<article class="card contest" data-id="${esc(c.id)}">
    <div class="row between" style="align-items:flex-start">
      <div style="min-width:0"><div class="org">${esc(c.orgao)}</div><div class="ink2 small">${esc(c.cargo || 'Cargo não informado')}</div></div>
      ${confiBadge(c)}
    </div>
    <div class="row"><span class="chip">${icon('mapPin')}${esc(c.local || '—')}</span>${c.area ? `<span class="chip">${esc(AREAS[c.area] || c.area)}</span>` : ''}<span class="chip ${sit === 'abertas' ? 'green' : sit === 'prova_proxima' ? 'red' : sit === 'previsto' ? 'amber' : sit === 'encerradas' ? '' : 'blue'}">${esc(SITUACAO_LABEL[sit])}</span>${my ? `<span class="chip violet">${icon('star')}${esc(MY_STATUS_LABEL[my.status])}</span>` : ''}${c.origem === 'manual' ? '<span class="chip">cadastrado por mim</span>' : ''}</div>
    <dl>
      <div><dt>Banca</dt><dd>${esc(c.banca || '—')}</dd></div>
      <div><dt>Vagas</dt><dd>${esc(c.vagas || '—')}</dd></div>
      <div><dt>Remuneração</dt><dd>${c.remuneracao ? money(c.remuneracao) : '—'}</dd></div>
      <div><dt>Inscrições</dt><dd>${esc(d.insc)}${sit === 'abertas' && c.inscFim ? ` <span class="chip amber">${relDays(c.inscFim, today)}</span>` : ''}</dd></div>
      <div><dt>Prova</dt><dd>${esc(d.prova)}${c.prova && c.prova >= today ? ` <span class="chip">${diffDays(c.prova, today)} dias</span>` : ''}</dd></div>
      ${c.taxa ? `<div><dt>Taxa</dt><dd>${money(c.taxa)}</dd></div>` : ''}
    </dl>
    ${c.obs ? `<p class="small ink2">${esc(c.obs)}</p>` : ''}
    <div class="src">
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${icon('link')} Edital / página oficial</a> · ` : '<span>Link oficial ainda não cadastrado · </span>'}
      Fonte: ${src ? `<a href="${esc(src)}" target="_blank" rel="noopener">${esc(c.fonte || 'link')}</a>` : esc(c.fonte || 'não informada')} · conferido em ${c.conferidoEm ? fmtDate(c.conferidoEm) : '—'}
    </div>
    <div class="row">
      <select class="input" style="width:auto;min-height:36px;padding:6px 10px;font-size:14px" data-act="track" data-id="${esc(c.id)}" aria-label="Acompanhar concurso">
        <option value="">${my ? 'Parar de acompanhar' : '☆ Acompanhar…'}</option>
        ${MY_STATUS.map(s => `<option value="${s.id}" ${my?.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      ${my ? `<button class="btn sm" data-act="my-edit" data-id="${esc(c.id)}">${icon('edit')} Inscrição e alertas</button>` : ''}
      <button class="btn sm ghost" data-act="edit" data-id="${esc(c.id)}">${icon('edit')} Editar dados</button>
      ${c.origem === 'radar' ? `<button class="btn sm ghost" data-act="hide" data-id="${esc(c.id)}">Ocultar</button>` : `<button class="btn sm ghost danger" data-act="delete" data-id="${esc(c.id)}">${icon('trash')}</button>`}
    </div>
  </article>`;
}

function contestForm(c = {}) {
  const opt = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<form id="contest-form" class="stack">
    <div class="form-grid">
      <label class="field"><span>Órgão *</span><input class="input" name="orgao" id="c-orgao" value="${esc(c.orgao)}" required placeholder="Ex.: SEFAZ RJ"></label>
      <label class="field"><span>Cargo</span><input class="input" name="cargo" id="c-cargo" value="${esc(c.cargo)}" placeholder="Ex.: Auditor Fiscal"></label>
    </div>
    <div class="form-grid">
      <label class="field"><span>Localidade *</span><select class="input" name="local" id="c-local" required>${opt(LOCAIS.map(l => [l, l]), c.local || 'RJ')}</select></label>
      <label class="field"><span>Área</span><select class="input" name="area" id="c-area">${opt(Object.entries(AREAS), c.area || 'fiscal')}</select></label>
      <label class="field"><span>Banca</span><input class="input" name="banca" id="c-banca" value="${esc(c.banca)}"></label>
    </div>
    <div class="form-grid">
      <label class="field"><span>Vagas</span><input class="input" name="vagas" id="c-vagas" value="${esc(c.vagas)}" placeholder="Ex.: 40 + CR"></label>
      <label class="field"><span>Remuneração (R$)</span><input class="input" type="number" step="0.01" min="0" name="remuneracao" id="c-remuneracao" value="${esc(c.remuneracao ?? '')}"></label>
      <label class="field"><span>Taxa (R$)</span><input class="input" type="number" step="0.01" min="0" name="taxa" id="c-taxa" value="${esc(c.taxa ?? '')}"></label>
    </div>
    <div class="form-grid">
      <label class="field"><span>Inscrições de</span><input class="input" type="date" name="inscInicio" id="c-inscInicio" value="${esc(c.inscInicio)}"></label>
      <label class="field"><span>Inscrições até</span><input class="input" type="date" name="inscFim" id="c-inscFim" value="${esc(c.inscFim)}"></label>
      <label class="field"><span>Data da prova</span><input class="input" type="date" name="prova" id="c-prova" value="${esc(c.prova)}"></label>
    </div>
    <div class="form-grid">
      <label class="field"><span>Situação (se não houver datas)</span><select class="input" name="situacao" id="c-situacao">${opt(SITUACOES.map(s => [s.id, s.label]), c.situacao || 'previsto')}</select></label>
      <label class="field"><span>Tipo de informação</span><select class="input" name="confiabilidade" id="c-confiabilidade">${opt(Object.entries(CONFIABILIDADE).map(([k, v]) => [k, `${v.label} — ${v.desc}`]), c.confiabilidade || 'oficial')}</select></label>
    </div>
    <label class="field"><span>Link do edital ou página oficial</span><input class="input" type="url" name="link" id="c-link" value="${esc(c.link)}" placeholder="https://"></label>
    <div class="form-grid">
      <label class="field"><span>Fonte</span><input class="input" name="fonte" id="c-fonte" value="${esc(c.fonte)}" placeholder="Ex.: Diário Oficial, site da banca"></label>
      <label class="field"><span>Link da fonte</span><input class="input" type="url" name="fonteUrl" id="c-fonteUrl" value="${esc(c.fonteUrl)}" placeholder="https://"></label>
      <label class="field"><span>Conferido em</span><input class="input" type="date" name="conferidoEm" id="c-conferidoEm" value="${esc(c.conferidoEm || todayISO())}"></label>
    </div>
    <label class="field"><span>Observações</span><textarea class="input" name="obs" id="c-obs">${esc(c.obs)}</textarea></label>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" data-testid="salvar-concurso">Salvar concurso</button></div>
  </form>`;
}

export function openContestEditor(app, c = null, prefill = {}) {
  openModal(`${modalHead(c ? 'Editar concurso' : 'Cadastrar concurso')}${c?.origem === 'radar' ? '<div class="banner blue">' + icon('info') + '<div>Ao editar um item do radar você cria sua versão: ela prevalece sobre as atualizações automáticas.</div></div>' : ''}${contestForm(c || prefill)}`, {
    onMount: m => m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const d = formData(e.target);
      const num = v => (v === '' || v == null ? null : Number(v));
      const item = { ...(c || {}), ...d, remuneracao: num(d.remuneracao), taxa: num(d.taxa), id: c?.id || app.uid('conc'), origem: c?.origem === 'radar' ? 'editado' : (c?.origem || 'manual') };
      for (const k of ['orgao', 'cargo', 'banca', 'vagas', 'fonte', 'obs']) item[k] = (item[k] || '').trim();
      if (!c) {
        const dup = findDuplicate(item, app.contests());
        if (dup) {
          closeModal();
          const go = await confirmDialog(`Já existe "${dup.orgao} – ${dup.cargo}" (${dup.local}). Cadastrar mesmo assim?`, { ok: 'Cadastrar mesmo assim' });
          if (!go) return;
        }
      }
      app.update(s => {
        const i = s.contests.findIndex(x => x.id === item.id);
        if (i >= 0) s.contests[i] = item; else s.contests.push(item);
      });
      closeModal(); toast('Concurso salvo.');
    }),
  });
}

function trackingForm(app, c) {
  const my = app.state.my[c.id] || {};
  const al = { ...DEFAULT_ALERTS, ...(my.alerts || {}) };
  const datas = [...(my.datas || []), {}, {}].slice(0, Math.max(3, (my.datas || []).length + 1));
  return `<form id="my-form" class="stack">
    <label class="field"><span>Situação</span><select class="input" name="status" id="m-status">${MY_STATUS.map(s => `<option value="${s.id}" ${s.id === my.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
    <div class="form-grid">
      <label class="field"><span>Nº de inscrição</span><input class="input" name="numInscricao" id="m-numInscricao" value="${esc(my.numInscricao)}"></label>
      <label class="field"><span>Taxa paga/a pagar (R$)</span><input class="input" type="number" step="0.01" name="taxa" id="m-taxa" value="${esc(my.taxa ?? c.taxa ?? '')}"></label>
      <label class="field"><span>Vencimento do boleto</span><input class="input" type="date" name="pagamentoAte" id="m-pagamentoAte" value="${esc(my.pagamentoAte)}"></label>
    </div>
    <div class="checks"><label><input type="checkbox" name="pago" id="m-pago" ${my.pago ? 'checked' : ''}> Pagamento confirmado</label></div>
    <label class="field"><span>Comprovante (link, local onde está salvo ou arquivo até 500 KB)</span><input class="input" name="comprovante" id="m-comprovante" value="${esc(my.comprovante)}" placeholder="Ex.: pasta Concursos/2026 ou https://…"></label>
    <input class="input" type="file" name="arquivo" id="m-arquivo" accept="application/pdf,image/*">
    ${my.comprovanteArquivo ? `<p class="small">Arquivo salvo: <a href="${esc(my.comprovanteArquivo.data)}" download="${esc(my.comprovanteArquivo.name)}">${esc(my.comprovanteArquivo.name)}</a></p>` : ''}
    <div class="form-grid">
      <label class="field"><span>Local de prova</span><input class="input" name="localProva" id="m-localProva" value="${esc(my.localProva)}"></label>
      <label class="field"><span>Horário da prova</span><input class="input" type="time" name="horaProva" id="m-horaProva" value="${esc(my.horaProva)}"></label>
    </div>
    <div class="field"><span>Outras datas importantes</span>
      ${datas.map((x, i) => `<div class="form-grid"><input class="input" name="dlabel${i}" id="m-dlabel${i}" value="${esc(x.label)}" placeholder="Ex.: resultado preliminar"><input class="input" type="date" name="ddate${i}" id="m-ddate${i}" value="${esc(x.date)}"></div>`).join('')}
    </div>
    <div class="field"><span>Alertas (dias de antecedência; 0 desliga)</span>
      <div class="form-grid">
        <label class="field"><span class="tiny">Fim das inscrições</span><input class="input" type="number" min="0" max="60" name="aInsc" id="m-aInsc" value="${al.inscricao}"></label>
        <label class="field"><span class="tiny">Pagamento</span><input class="input" type="number" min="0" max="30" name="aPag" id="m-aPag" value="${al.pagamento}"></label>
        <label class="field"><span class="tiny">Prova</span><input class="input" type="number" min="0" max="90" name="aProva" id="m-aProva" value="${al.prova}"></label>
      </div>
    </div>
    <label class="field"><span>Anotações</span><textarea class="input" name="notas" id="m-notas">${esc(my.notas)}</textarea></label>
    <div class="modal-actions"><button type="button" class="btn" data-ics>${icon('download')} Adicionar ao calendário</button><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" data-testid="salvar-acompanhamento">Salvar</button></div>
  </form>`;
}

export function openTracking(app, c) {
  openModal(`${modalHead(`${c.orgao} · acompanhamento`)}${trackingForm(app, c)}`, {
    onMount: m => {
      m.querySelector('[data-ics]').addEventListener('click', () => {
        const items = contestCalendarItems(app.state, [c]);
        if (!items.length) { toast('Sem datas para exportar ainda.'); return; }
        download(`rumo-${c.orgao.replace(/\W+/g, '-').toLowerCase()}.ics`, buildICS(items), 'text/calendar');
      });
      m.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        const d = formData(e.target);
        let arquivo = app.state.my[c.id]?.comprovanteArquivo || null;
        const file = e.target.arquivo.files[0];
        if (file) {
          if (file.size > 500 * 1024) { toast('Arquivo maior que 500 KB. Salve-o fora e informe o local.'); return; }
          arquivo = { name: file.name, data: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }) };
        }
        const datas = [];
        for (let i = 0; i < 10; i++) if (d[`ddate${i}`]) datas.push({ label: (d[`dlabel${i}`] || '').trim(), date: d[`ddate${i}`] });
        app.update(s => {
          s.my[c.id] = {
            ...(s.my[c.id] || {}), status: d.status, numInscricao: d.numInscricao.trim(), taxa: d.taxa === '' ? null : Number(d.taxa),
            pagamentoAte: d.pagamentoAte || '', pago: !!d.pago, comprovante: d.comprovante.trim(), comprovanteArquivo: arquivo,
            localProva: d.localProva.trim(), horaProva: d.horaProva || '', datas, notas: d.notas,
            alerts: { inscricao: +d.aInsc || 0, pagamento: +d.aPag || 0, prova: +d.aProva || 0 }, updatedAt: todayISO(),
          };
        });
        closeModal(); toast('Acompanhamento salvo.');
      });
    },
  });
}

function renderRadar(app, today) {
  const s = app.state, r = app.radar;
  const all = app.contests();
  const list = searchContests(all, { ...filters, prefs: s.prefs }, today);
  const hiddenByPrefs = filters.onlyPrefs ? searchContests(all, { ...filters, onlyPrefs: false }, today).length - list.length : 0;
  const groups = ORDER.map(k => [k, list.filter(c => situacao(c, today) === k)]).filter(([, l]) => l.length);
  const noticias = (r.noticias || []).filter(n => !filters.onlyPrefs || !s.prefs.excluirLocais?.includes(n.uf));
  return `
    <div class="banner blue">${icon('radar')}<div>
      <b>Radar atualizado em ${r.atualizadoEm ? esc(new Date(r.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })) : '—'}</b>.
      Diferencie: ${confiBadge({ confiabilidade: 'oficial' })} conferido em fonte oficial, ${confiBadge({ confiabilidade: 'noticia' })} notícia a confirmar, ${confiBadge({ confiabilidade: 'previsao' })} previsão não confirmada.
      ${r.error ? `<br><span class="small">${esc(r.error)}</span>` : ''}
    </div></div>
    <div class="filters">
      <label class="search"><span class="sr-only">Buscar</span>${icon('search')}<input class="input" type="search" id="f-q" placeholder="Buscar órgão, cargo, banca…" value="${esc(filters.q)}"></label>
      <select class="input" id="f-situacao" aria-label="Situação"><option value="">Todas as situações</option>${SITUACOES.map(x => `<option value="${x.id}" ${filters.situacao === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
      <select class="input" id="f-area" aria-label="Área"><option value="">Todas as áreas</option>${Object.entries(AREAS).map(([k, v]) => `<option value="${k}" ${filters.area === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="input" id="f-local" aria-label="Localidade"><option value="">Todas as localidades</option>${LOCAIS.map(l => `<option ${filters.local === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="row between" style="margin-bottom:12px">
      <div class="checks"><label><input type="checkbox" id="f-onlyPrefs" ${filters.onlyPrefs ? 'checked' : ''}> Só compatíveis com minhas preferências</label></div>
      <div class="row"><a class="btn sm ghost" href="#/config">Editar preferências</a><button class="btn sm primary" data-act="new" data-testid="novo-concurso">${icon('plus')} Cadastrar concurso</button></div>
    </div>
    ${hiddenByPrefs > 0 ? `<p class="tiny muted" style="margin-bottom:10px">${hiddenByPrefs} concurso(s) oculto(s) pelas preferências.</p>` : ''}
    ${groups.length ? groups.map(([k, l]) => `<div class="section-title"><h2>${esc(SITUACAO_LABEL[k])} <span class="chip">${l.length}</span></h2></div><div class="grid-2">${l.map(c => contestCard(app, c, today)).join('')}</div>`).join('')
      : '<div class="card empty">Nenhum concurso encontrado com esses filtros. Cadastre manualmente ou ajuste as preferências.</div>'}
    ${noticias.length ? `<div class="section-title"><h2>Notícias recentes (a confirmar)</h2><span class="small muted">coletadas automaticamente</span></div>
      <div class="card"><div class="list">${noticias.slice(0, 25).map((n, i) => `<div class="li"><div class="grow"><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener" class="small"><b>${esc(n.titulo)}</b></a><div class="tiny muted">${esc(n.fonte)} · ${n.data ? fmtDate(n.data) : ''}${n.uf ? ' · ' + esc(n.uf) : ''}${n.area ? ' · ' + esc(AREAS[n.area] || n.area) : ''}</div></div><button class="btn sm" data-act="from-news" data-i="${i}">Cadastrar</button></div>`).join('')}</div></div>` : ''}
    ${(r.fontes || []).length ? `<details class="small muted" style="margin-top:14px"><summary>Fontes consultadas automaticamente (${r.fontes.filter(f => f.ok).length}/${r.fontes.length} ok)</summary><div class="list">${r.fontes.map(f => `<div class="li"><span class="chip ${f.ok ? 'green' : 'red'}">${f.ok ? 'ok' : 'erro'}</span><div class="grow">${esc(f.nome)}${f.erro ? ` — ${esc(f.erro)}` : ` — ${f.itens} nova(s)`}</div></div>`).join('')}</div></details>` : ''}`;
}

function renderMine(app, today) {
  const s = app.state;
  const all = app.contests();
  const mine = all.filter(c => s.my[c.id]);
  if (!mine.length) return `<div class="card empty">Você ainda não acompanha nenhum concurso. No <a href="#/concursos/radar">Radar</a>, use “Acompanhar” para marcar interesse, inscrição etc.</div>`;
  return `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn sm" data-act="ics-all">${icon('download')} Exportar datas e alertas (.ics)</button></div>
  <div class="stack">${MY_STATUS.map(st => {
    const l = mine.filter(c => s.my[c.id].status === st.id);
    if (!l.length) return '';
    return `<section class="kanban-col"><h3>${esc(st.label)} <span class="chip">${l.length}</span></h3><div class="grid-2">${l.map(c => {
      const my = s.my[c.id];
      return `<article class="card contest">
        <div class="row between" style="align-items:flex-start"><div style="min-width:0"><div class="org">${esc(c.orgao)}</div><div class="small ink2">${esc(c.cargo || '')} · ${esc(c.local)}</div></div>${confiBadge(c)}</div>
        <dl>
          <div><dt>Inscrições até</dt><dd>${c.inscFim ? fmtDate(c.inscFim) : '—'}</dd></div>
          <div><dt>Prova</dt><dd>${c.prova ? `${fmtDate(c.prova)}${c.prova >= today ? ` · <b>${diffDays(c.prova, today)} dias</b>` : ''}` : '—'}</dd></div>
          <div><dt>Nº inscrição</dt><dd>${esc(my.numInscricao || '—')}</dd></div>
          <div><dt>Taxa</dt><dd>${my.taxa != null && my.taxa !== '' ? money(my.taxa) : '—'} ${my.taxa ? (my.pago ? '<span class="chip green">paga</span>' : '<span class="chip amber">a pagar</span>') : ''}</dd></div>
          ${my.pagamentoAte ? `<div><dt>Vencimento</dt><dd>${fmtDate(my.pagamentoAte)}</dd></div>` : ''}
          ${my.localProva ? `<div><dt>Local de prova</dt><dd>${esc(my.localProva)}</dd></div>` : ''}
        </dl>
        ${(my.datas || []).length ? `<div class="small">${my.datas.map(x => `<span class="chip">${esc(x.label || 'data')}: ${fmtDate(x.date, { short: true })}</span>`).join(' ')}</div>` : ''}
        ${my.comprovante || my.comprovanteArquivo ? `<div class="small muted">Comprovante: ${esc(my.comprovante || '')} ${my.comprovanteArquivo ? `<a href="${esc(my.comprovanteArquivo.data)}" download="${esc(my.comprovanteArquivo.name)}">${esc(my.comprovanteArquivo.name)}</a>` : ''}</div>` : ''}
        <div class="row">
          ${s.profile.targetContestId === c.id ? `<span class="chip green">${icon('star')} Prioridade do plano</span>` : `<button class="btn sm ghost" data-act="priority" data-id="${esc(c.id)}">${icon('star')} Definir como prioridade</button>`}
          <select class="input" style="width:auto;min-height:36px;padding:6px 10px;font-size:14px" data-act="track" data-id="${esc(c.id)}" aria-label="Situação">${MY_STATUS.map(x => `<option value="${x.id}" ${my.status === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}<option value="">Parar de acompanhar</option></select>
          <button class="btn sm primary" data-act="my-edit" data-id="${esc(c.id)}">${icon('edit')} Inscrição e alertas</button>
        </div>
      </article>`;
    }).join('')}</div></section>`;
  }).join('')}</div>`;
}

export default {
  title: 'Concursos',
  render(app) {
    const tab = app.params[0] === 'meus' ? 'meus' : 'radar';
    const today = todayISO();
    const nMine = Object.keys(app.state.my).length;
    return `<h1>Concursos</h1>
      <p class="muted small" style="margin:6px 0 12px">Radar filtrado pelas suas preferências (${esc(app.state.prefs.areas.map(a => AREAS[a]).join(', ') || 'todas as áreas')}; ${esc(app.state.prefs.locais.join(', ') || 'todas as localidades')}${app.state.prefs.excluirLocais.length ? `; sem ${esc(app.state.prefs.excluirLocais.join(', '))}` : ''}).</p>
      <div class="tabs" style="margin-bottom:14px"><a href="#/concursos/radar" class="${tab === 'radar' ? 'active' : ''}">Radar</a><a href="#/concursos/meus" class="${tab === 'meus' ? 'active' : ''}">Meus concursos ${nMine ? `(${nMine})` : ''}</a></div>
      ${tab === 'radar' ? renderRadar(app, today) : renderMine(app, today)}`;
  },
  mount(root, app) {
    const rerender = () => { const y = window.scrollY; app.render(); window.scrollTo(0, y); };
    const q = root.querySelector('#f-q');
    if (q) {
      let tmr; q.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { filters.q = q.value; rerender(); const n = document.querySelector('#f-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
      for (const k of ['situacao', 'area', 'local']) root.querySelector(`#f-${k}`).addEventListener('change', e => { filters[k] = e.target.value; rerender(); });
      root.querySelector('#f-onlyPrefs').addEventListener('change', e => { filters.onlyPrefs = e.target.checked; rerender(); });
    }
    root.addEventListener('change', e => {
      const t = e.target.closest('[data-act="track"]'); if (!t) return;
      const id = t.dataset.id, v = t.value;
      app.update(s => { if (!v) delete s.my[id]; else s.my[id] = { ...(s.my[id] || {}), status: v }; });
      toast(v ? `Marcado como “${MY_STATUS_LABEL[v]}”.` : 'Deixou de acompanhar.');
      if (v === 'inscrito' && !app.state.my[id].numInscricao) openTracking(app, app.contest(id));
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.tagName === 'SELECT') return;
      const act = a.dataset.act, c = a.dataset.id && app.contest(a.dataset.id);
      if (act === 'new') openContestEditor(app);
      if (act === 'edit') openContestEditor(app, c);
      if (act === 'my-edit') openTracking(app, c);
      if (act === 'priority') { app.update(s => { s.profile.targetContestId = c.id; }, { silent: true }); app.regenerate(); toast(`${c.orgao} agora é a prioridade do plano.`); }
      if (act === 'hide' && await confirmDialog('Ocultar este concurso do radar?', { ok: 'Ocultar' })) app.update(s => { s.radarHidden.push(c.id); delete s.my[c.id]; });
      if (act === 'delete' && await confirmDialog('Excluir este concurso cadastrado?', { ok: 'Excluir', danger: true })) app.update(s => { s.contests = s.contests.filter(x => x.id !== c.id); delete s.my[c.id]; });
      if (act === 'from-news') {
        const n = app.radar.noticias[+a.dataset.i];
        openContestEditor(app, null, { orgao: n.orgao || '', local: n.uf || 'Federal', area: n.area || 'fiscal', confiabilidade: 'noticia', fonte: n.fonte, fonteUrl: n.link, obs: n.titulo, situacao: 'previsto' });
      }
      if (act === 'ics-all') {
        const items = contestCalendarItems(app.state, app.contests());
        if (!items.length) { toast('Nenhuma data cadastrada para exportar.'); return; }
        download('rumo-concursos.ics', buildICS(items), 'text/calendar');
        toast('Abra o arquivo .ics para adicionar provas, inscrições e pagamentos ao calendário (com alarmes).');
      }
    });
  },
};

export { matchesPrefs };
