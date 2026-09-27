// Alertas de inscrição, pagamento e prova + exportação para o calendário do celular (.ics).
import { todayISO, diffDays, addDays, fmtDate, brToUTC, nowHM, hmToMin, dow } from './time.js';

export const DEFAULT_ALERTS = { inscricao: 5, pagamento: 2, prova: 7 };

export function computeAlerts(state, contests, today = todayISO()) {
  const out = [];
  const byId = Object.fromEntries(contests.map(c => [c.id, c]));
  for (const [id, my] of Object.entries(state.my)) {
    const c = byId[id]; if (!c) continue;
    if (['desisti', 'prova_realizada'].includes(my.status)) continue;
    const cfg = { ...DEFAULT_ALERTS, ...(my.alerts || {}) };
    const name = `${c.orgao}${c.cargo ? ' – ' + c.cargo : ''}`;
    if (cfg.inscricao > 0 && ['interesse', 'vou_inscrever'].includes(my.status) && c.inscFim) {
      const n = diffDays(c.inscFim, today);
      if (n >= 0 && n <= cfg.inscricao) out.push({ key: `insc:${id}`, level: n <= 1 ? 'alta' : 'media', kind: 'inscricao', contestId: id, date: c.inscFim, text: `Inscrições de ${name} encerram ${n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`} (${fmtDate(c.inscFim, { short: true })}).` });
    }
    if (cfg.pagamento > 0 && my.pagamentoAte && !my.pago) {
      const n = diffDays(my.pagamentoAte, today);
      if (n <= cfg.pagamento) out.push({ key: `pag:${id}`, level: n <= 0 ? 'alta' : 'media', kind: 'pagamento', contestId: id, date: my.pagamentoAte, text: n < 0 ? `Pagamento da inscrição de ${name} venceu em ${fmtDate(my.pagamentoAte, { short: true })}. Confira!` : `Pagar a taxa de ${name} até ${fmtDate(my.pagamentoAte, { short: true })}${my.taxa ? ` (R$ ${my.taxa})` : ''}.` });
    }
    if (cfg.prova > 0 && c.prova) {
      const n = diffDays(c.prova, today);
      if (n >= 0 && n <= cfg.prova) out.push({ key: `prova:${id}`, level: n <= 2 ? 'alta' : 'media', kind: 'prova', contestId: id, date: c.prova, text: `Prova de ${name} ${n === 0 ? 'é hoje' : n === 1 ? 'é amanhã' : `em ${n} dias`}${my.localProva ? ` · ${my.localProva}` : ''}.` });
    }
    for (const d of my.datas || []) {
      if (!d.date) continue;
      const n = diffDays(d.date, today);
      if (n >= 0 && n <= 3) out.push({ key: `data:${id}:${d.date}:${d.label}`, level: 'baixa', kind: 'data', contestId: id, date: d.date, text: `${d.label || 'Data importante'} – ${name}: ${fmtDate(d.date, { short: true })}.` });
    }
  }
  for (const t of state.tasks) {
    const onToday = t.date ? t.date <= today : t.dows?.includes(dow(today));
    const done = t.date ? t.done : (t.doneDates || []).includes(today);
    if (!done && onToday && t.remind !== false) out.push({ key: `tarefa:${t.id}:${today}`, level: t.date && t.date < today ? 'media' : 'baixa', kind: 'tarefa', date: t.date || today, text: `Tarefa: ${t.title}${t.date && t.date < today ? ' (atrasada)' : ''}` });
  }
  const rank = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.date || '').localeCompare(b.date || ''));
}

function inQuietHours(profile, hm = nowHM()) {
  const n = hmToMin(hm), s = hmToMin(profile.quietStart || '22:30'), e = hmToMin(profile.quietEnd || '07:00');
  return s > e ? (n >= s || n < e) : (n >= s && n < e);
}

// Notifica pelo sistema no máximo 2 vezes por dia, só alertas importantes, fora do horário de silêncio.
export function notifyNew(state, alerts, markSeen) {
  if (!state.profile.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0;
  if (inQuietHours(state.profile)) return 0;
  const today = todayISO();
  const sentToday = Object.values(state.alertsSeen).filter(d => d === today).length;
  let budget = Math.max(0, 2 - sentToday), sent = 0;
  for (const a of alerts) {
    if (budget <= 0) break;
    if (a.level === 'baixa' || state.alertsSeen[a.key] === today) continue;
    try {
      const reg = navigator.serviceWorker?.controller ? navigator.serviceWorker.ready : null;
      const opts = { body: a.text, tag: a.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
      if (reg) reg.then(r => r.showNotification('Rumo', opts)); else new Notification('Rumo', opts);
      markSeen(a.key, today); budget--; sent++;
    } catch { /* ignore */ }
  }
  return sent;
}

// ---------- iCalendar ----------
function icsEsc(s = '') { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsDT(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function fold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); }

export function buildICS(items, calName = 'Rumo – Concursos') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumo//Concursos//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEsc(calName)}`, 'X-WR-TIMEZONE:America/Sao_Paulo'];
  const stamp = icsDT(new Date());
  for (const it of items) {
    const start = brToUTC(it.date, it.time || '09:00');
    const end = new Date(start.getTime() + (it.durMin || 30) * 60000);
    lines.push('BEGIN:VEVENT', `UID:${it.uid}@rumo-concursos`, `DTSTAMP:${stamp}`, `DTSTART:${icsDT(start)}`, `DTEND:${icsDT(end)}`, fold(`SUMMARY:${icsEsc(it.title)}`));
    if (it.desc) lines.push(fold(`DESCRIPTION:${icsEsc(it.desc)}`));
    if (it.url) lines.push(fold(`URL:${it.url}`));
    for (const m of it.alarms || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc(it.title)}`), `TRIGGER:-PT${m}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Converte o acompanhamento dos concursos em eventos com alarmes (funcionam com o app fechado).
export function contestCalendarItems(state, contests) {
  const byId = Object.fromEntries(contests.map(c => [c.id, c]));
  const items = [];
  for (const [id, my] of Object.entries(state.my)) {
    const c = byId[id]; if (!c || my.status === 'desisti') continue;
    const cfg = { ...DEFAULT_ALERTS, ...(my.alerts || {}) };
    const name = `${c.orgao}${c.cargo ? ' – ' + c.cargo : ''}`;
    const desc = [c.banca && `Banca: ${c.banca}`, c.link && `Edital/página: ${c.link}`, my.numInscricao && `Inscrição nº ${my.numInscricao}`, my.localProva && `Local: ${my.localProva}`].filter(Boolean).join('\n');
    if (c.inscFim && ['interesse', 'vou_inscrever'].includes(my.status)) items.push({ uid: `insc-${id}`, date: c.inscFim, time: '09:00', title: `Último dia de inscrição: ${name}`, desc, url: c.link, alarms: [cfg.inscricao * 1440, 0].filter(x => x >= 0) });
    if (my.pagamentoAte && !my.pago) items.push({ uid: `pag-${id}`, date: my.pagamentoAte, time: '09:00', title: `Pagar inscrição: ${name}`, desc, alarms: [cfg.pagamento * 1440, 0] });
    if (c.prova) items.push({ uid: `prova-${id}`, date: c.prova, time: my.horaProva || '08:00', durMin: 300, title: `PROVA: ${name}`, desc, url: c.link, alarms: [cfg.prova * 1440, 1440, 180] });
    for (const d of my.datas || []) if (d.date) items.push({ uid: `data-${id}-${d.date}`, date: d.date, time: '09:00', title: `${d.label || 'Data importante'}: ${name}`, desc, alarms: [1440] });
  }
  return items;
}

export function planCalendarItems(state, days = 7) {
  const today = todayISO(), last = addDays(today, days - 1);
  const subj = Object.fromEntries(state.subjects.map(s => [s.id, s]));
  return state.plan.sessions.filter(s => s.status === 'pendente' && s.date >= today && s.date <= last && s.start).map(s => {
    const sb = subj[s.subjectId];
    const topic = sb?.topics.find(t => t.id === s.topicId);
    return { uid: `ses-${s.id}`, date: s.date, time: s.start, durMin: s.dur, title: `Estudo: ${sb?.nome || 'Simulado'}`, desc: topic?.nome || '', alarms: [5] };
  });
}
