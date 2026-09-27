import { esc, icon, progressBar, pct } from '../ui.js';
import { todayISO, fmtDate, fmtMin, fmtDur, weekStart, rangeDays, DOW_SHORT, dow, diffDays, brParts, relDays } from '../time.js';
import { MODALIDADES, cycleToday, pendingPast, eventsOn } from '../planner.js';
import { minutesOn, weekMinutes, streak, questionTotals, editalProgress, fraseDoDia, comebackMessage, bySubject, activeDaysInWeek } from '../stats.js';
import { computeAlerts } from '../alerts.js';
import { matchesPrefs, situacao } from '../radar.js';

function greeting() {
  const h = brParts().hh;
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function todaySessions(app) {
  const s = app.state, today = todayISO();
  if (s.profile.planMode === 'ciclo') return cycleToday(s, today);
  return s.plan.sessions.filter(x => x.date === today && !['descartado', 'recuperado'].includes(x.status));
}

function sessionLabel(app, x) {
  const subj = app.subject(x.subjectId);
  const topic = subj?.topics.find(t => t.id === x.topicId);
  return { nome: x.modalidade === 'simulado' ? 'Simulado' : (subj?.nome || 'Matéria removida'), assunto: x.modalidade === 'simulado' ? (app.contest(x.contestId)?.orgao || 'Prova completa cronometrada') : (topic?.nome || '') };
}

export default {
  title: 'Hoje',
  render(app) {
    const s = app.state, today = todayISO();
    const contests = app.contests();
    const sessions = todaySessions(app);
    const pendingToday = sessions.filter(x => x.status === 'pendente');
    const studiedMin = minutesOn(s, today);
    const goal = s.profile.dailyGoalMin;
    const plannedMin = sessions.reduce((a, x) => a + x.dur, 0);
    const weekMin = weekMinutes(s, today);
    const st = streak(s, today);
    const q7 = questionTotals(s, weekStart(today), today);
    const q30 = questionTotals(s);
    const comeback = comebackMessage(s, today);
    const late = pendingPast(s, today).length;
    const alerts = computeAlerts(s, contests, today);
    const dueReviews = s.reviews.filter(r => !r.done && r.due <= today);
    const events = eventsOn(s, today);
    const appSec = s.appTime[today] || 0;
    const subjStats = bySubject(s).filter(x => x.q >= 5).sort((a, b) => b.errRate - a.errRate);

    // concurso-alvo e contagens regressivas
    const mine = contests.filter(c => s.my[c.id] && !['desisti'].includes(s.my[c.id].status));
    const exams = mine.filter(c => c.prova && c.prova >= today).sort((a, b) => a.prova.localeCompare(b.prova));
    const target = exams[0] || null;
    const ed = editalProgress(s, target?.id || null);
    const closing = contests
      .filter(c => c.inscFim && c.inscFim >= today && diffDays(c.inscFim, today) <= 10 && situacao(c, today) === 'abertas' && (s.my[c.id] ? !['inscrito', 'desisti', 'prova_realizada'].includes(s.my[c.id].status) : matchesPrefs(c, s.prefs)))
      .sort((a, b) => a.inscFim.localeCompare(b.inscFim));

    const ws = weekStart(today);
    const weekDots = rangeDays(ws, 7).map(d => {
      const m = minutesOn(s, d);
      return `<i class="${m >= 15 ? 'on' : ''} ${d === today ? 'today' : ''}" title="${fmtDate(d)}: ${fmtMin(Math.round(m))}">${DOW_SHORT[dow(d)][0]}</i>`;
    }).join('');

    const first = pendingToday[0];
    const heroList = sessions.length ? sessions.slice(0, 4).map(x => {
      const l = sessionLabel(app, x);
      return `<div class="sess ${x.status === 'feito' ? 'done' : ''}">
        <span class="t">${x.status === 'feito' ? icon('check') : esc(x.start || '')}</span>
        <div class="grow"><b class="ellipsis">${esc(l.nome)}</b><span class="sub ellipsis" style="display:block">${esc(l.assunto)}</span></div>
        <span class="tag">${esc(MODALIDADES[x.modalidade])} · ${fmtMin(x.dur)}</span>
      </div>`;
    }).join('') + (sessions.length > 4 ? `<a class="more" href="#/plano">+ ${sessions.length - 4} sessões no plano</a>` : '')
      : (() => {
        const nx = s.plan.sessions.find(x => x.date > today && x.status === 'pendente');
        const nl = nx && sessionLabel(app, nx);
        return `<div class="empty-hero">Nenhuma sessão planejada para hoje. Se sobrar um tempo, inicie um estudo livre ou ajuste suas janelas em <b>Minha rotina</b>.${nx ? `<br><br>Próxima sessão: <b>${esc(fmtDate(nx.date, { long: true }))}, ${esc(nx.start)}</b> · ${esc(nl.nome)}${nl.assunto ? ' — ' + esc(nl.assunto) : ''}` : ''}</div>`;
      })();

    return `
    <div class="hello">
      <h1>${greeting()}${s.profile.name ? ', ' + esc(s.profile.name.split(' ')[0]) : ''}!</h1>
      <p class="muted small">${esc(fmtDate(today, { long: true }))} · horário de Brasília</p>
      <p class="quote">“${esc(fraseDoDia(today))}”</p>
    </div>
    ${s.demo ? `<div class="banner blue">${icon('info')}<div><b>Modo demonstração:</b> estudos e acompanhamentos fictícios, apenas para visualizar o painel. Nada é salvo.${globalThis.RUMO_DEMO ? "" : ` <a href="./">Abrir com meus dados</a>`}</div></div>` : ''}
    ${comeback ? `<div class="banner green">${icon('sparkle')}<div>${esc(comeback)}</div></div>` : ''}
    ${late ? `<div class="banner">${icon('repeat')}<div><b>${late} sessão(ões) ficaram para trás.</b> Recupere sem sobrecarga: no máximo uma por dia. <a href="#/plano">Recuperar no plano</a></div></div>` : ''}

    <div class="home-top">
      <section class="hero" aria-label="O que estudar hoje">
        <div class="eyebrow">${s.profile.planMode === 'ciclo' ? 'Ciclo de estudos' : 'Plano do dia'}${target ? ` · foco: ${esc(target.orgao)}` : ''}</div>
        <h2>O que estudar hoje</h2>
        ${heroList}
        <div class="progress"><span class="num">${fmtMin(Math.round(studiedMin))}</span>${progressBar(studiedMin / (goal || 1))}<span class="num">meta ${fmtMin(goal)}</span></div>
        <div class="row between">
          <a class="btn lg cta" href="#/estudar${first ? '/sessao/' + encodeURIComponent(first.id) : ''}" data-testid="iniciar-estudo">${icon('play')} ${s.timer ? 'Voltar ao estudo' : 'Iniciar estudo'}</a>
          <span class="small" style="opacity:.9">${plannedMin ? `${fmtMin(plannedMin)} planejados` : ''}</span>
        </div>
      </section>

      <div class="stack">
        <div class="card">
          <div class="card-h"><h3><span class="ico">${icon('clock')}</span>Tempo estudado</h3><a class="small" href="#/estudar/manual">+ registrar</a></div>
          <div class="row between"><div><div class="big">${fmtMin(Math.round(studiedMin))} <small>hoje</small></div></div><div style="text-align:right"><div class="big" style="font-size:20px">${fmtMin(Math.round(weekMin))}</div><div class="tiny muted">na semana</div></div></div>
          <div class="small muted" style="margin-top:8px">Tempo com o app aberto hoje: <b class="num">${fmtDur(appSec)}</b> — não conta como estudo.</div>
        </div>
        <div class="card">
          <div class="card-h"><h3><span class="ico amber">${icon('flame')}</span>Constância</h3><span class="chip ${st.current ? 'green' : ''}">${st.current} dia${st.current === 1 ? '' : 's'} seguido${st.current === 1 ? '' : 's'}</span></div>
          <div class="dots" aria-label="Dias estudados nesta semana">${weekDots}</div>
          <div class="small muted" style="margin-top:8px">${activeDaysInWeek(s, today)} dia(s) com estudo nesta semana · recorde: ${st.best} dia(s)</div>
        </div>
      </div>
    </div>

    <div class="section-title"><h2>Seu painel</h2></div>
    <div class="grid">
      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('target')}</span>Meta semanal</h3><span class="small muted">${fmtMin(s.profile.weeklyGoalMin)}</span></div>
        <div class="big">${pct(weekMin / (s.profile.weeklyGoalMin || 1))}</div>
        ${progressBar(weekMin / (s.profile.weeklyGoalMin || 1))}
        <div class="small muted" style="margin-top:8px">${weekMin >= s.profile.weeklyGoalMin ? 'Meta da semana batida. Excelente!' : `Faltam ${fmtMin(Math.round(s.profile.weeklyGoalMin - weekMin))} até domingo.`}</div>
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico blue">${icon('checkCircle')}</span>Questões</h3><a class="small" href="#/evolucao">evolução</a></div>
        <div class="row between"><div class="big">${q30.q}<small> resolvidas</small></div><div class="big" style="font-size:20px">${pct(q30.acc)}</div></div>
        ${progressBar(q30.acc || 0)}
        <div class="small muted" style="margin-top:8px">${q7.q ? `Nesta semana: ${q7.q} questões, ${pct(q7.acc)} de acertos.` : 'Registre questões ao encerrar cada sessão.'}${subjStats[0] ? `<br>Mais erros: <b>${esc(subjStats[0].nome)}</b> (${pct(subjStats[0].errRate)} de erro)` : ''}</div>
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('list')}</span>Avanço no edital</h3><a class="small" href="#/materias">abrir</a></div>
        <div class="big">${pct(ed.pct)}</div>
        ${progressBar(ed.pct)}
        <div class="small muted" style="margin-top:8px">${ed.done} de ${ed.total} assuntos estudados${target ? ` para ${esc(target.orgao)}` : ''}.</div>
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico violet">${icon('repeat')}</span>Revisões</h3><a class="small" href="#/revisoes">ver todas</a></div>
        ${dueReviews.length ? `<div class="list">${dueReviews.slice(0, 3).map(r => {
          const sb = app.subject(r.subjectId); const tp = sb?.topics.find(t => t.id === r.topicId);
          return `<div class="li"><div class="grow"><div class="ellipsis small"><b>${esc(sb?.nome || '')}</b></div><div class="ellipsis tiny muted">${esc(tp?.nome || '')} · revisão de ${r.step} dia(s)</div></div><span class="chip ${r.due < today ? 'amber' : 'violet'}">${r.due < today ? 'atrasada' : 'hoje'}</span></div>`;
        }).join('')}</div>${dueReviews.length > 3 ? `<div class="tiny muted">+${dueReviews.length - 3} revisões</div>` : ''}` : '<div class="small muted">Nenhuma revisão para hoje. As revisões são criadas automaticamente (1, 7 e 30 dias) ao registrar estudos.</div>'}
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico red">${icon('bell')}</span>Lembretes</h3><span class="chip">${alerts.length}</span></div>
        ${alerts.length ? `<div class="list">${alerts.slice(0, 4).map(a => `<div class="li small"><span class="chip ${a.level === 'alta' ? 'red' : a.level === 'media' ? 'amber' : ''}">${a.kind === 'prova' ? 'prova' : a.kind === 'pagamento' ? 'pagamento' : a.kind === 'inscricao' ? 'inscrição' : a.kind}</span><div class="grow">${esc(a.text)}</div></div>`).join('')}</div>` : '<div class="small muted">Tudo em dia. Alertas de inscrição, pagamento e prova aparecem aqui.</div>'}
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico">${icon('trophy')}</span>Dias até as provas</h3><a class="small" href="#/concursos/meus">meus concursos</a></div>
        ${exams.length ? `<div class="list">${exams.slice(0, 3).map(c => `<div class="li countdown"><div class="days">${diffDays(c.prova, today)}<small>dias</small></div><div class="grow"><div class="ellipsis"><b>${esc(c.orgao)}</b></div><div class="tiny muted ellipsis">${esc(c.cargo || '')} · ${fmtDate(c.prova)}</div></div></div>`).join('')}</div>` : '<div class="small muted">Marque um concurso como “vou me inscrever” ou “inscrito” para ver a contagem regressiva.</div>'}
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico amber">${icon('alert')}</span>Inscrições encerrando</h3><a class="small" href="#/concursos/radar">radar</a></div>
        ${closing.length ? `<div class="list">${closing.slice(0, 3).map(c => `<div class="li"><div class="grow"><div class="ellipsis small"><b>${esc(c.orgao)}</b> · ${esc(c.local)}</div><div class="tiny muted ellipsis">${esc(c.cargo || '')}</div></div><span class="chip amber">${relDays(c.inscFim, today)}</span></div>`).join('')}</div>` : '<div class="small muted">Nenhuma inscrição do seu radar encerrando nos próximos 10 dias.</div>'}
      </div>

      <div class="card">
        <div class="card-h"><h3><span class="ico blue">${icon('briefcase')}</span>Compromissos de hoje</h3><a class="small" href="#/rotina">rotina</a></div>
        ${events.length ? `<div class="list">${events.map(e => `<div class="li small"><span class="num muted">${esc(e.start)}–${esc(e.end)}</span><div class="grow ellipsis">${esc(e.title)}</div></div>`).join('')}</div>` : '<div class="small muted">Sem compromissos cadastrados para hoje.</div>'}
      </div>
    </div>`;
  },
};
