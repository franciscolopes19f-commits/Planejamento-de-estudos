// Datas sempre no horário de Brasília (America/Sao_Paulo).
// Datas "de calendário" são strings ISO 'YYYY-MM-DD'; horários são 'HH:MM'.
export const TZ = 'America/Sao_Paulo';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

let clockOffsetMs = 0; // usado nos testes para simular outro "agora"
export function setClockOffset(ms) { clockOffsetMs = ms; }
export function now() { return new Date(Date.now() + clockOffsetMs); }

export function brParts(d = now()) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second };
}

export function todayISO(d = now()) {
  const p = brParts(d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function nowHM(d = now()) {
  const p = brParts(d);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function pad(n) { return String(n).padStart(2, '0'); }

// Aritmética de datas de calendário feita em UTC puro (sem fuso) para evitar erros de horário de verão.
export function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function toISO(dt) { return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`; }
export function addDays(iso, n) { const dt = parseISO(iso); dt.setUTCDate(dt.getUTCDate() + n); return toISO(dt); }
export function diffDays(a, b) { return Math.round((parseISO(a) - parseISO(b)) / 86400000); } // a - b
export function dow(iso) { return parseISO(iso).getUTCDay(); } // 0=domingo
export function weekStart(iso) { const w = dow(iso); return addDays(iso, w === 0 ? -6 : 1 - w); } // semana começa na segunda
export function rangeDays(start, n) { return Array.from({ length: n }, (_, i) => addDays(start, i)); }

export function hmToMin(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
export function minToHM(min) { min = Math.max(0, Math.round(min)); return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; }

export const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DOW_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (opts.long) return `${DOW_LONG[dow(iso)]}, ${d} de ${MONTHS_LONG[m - 1]}`;
  if (opts.short) return `${pad(d)}/${pad(m)}`;
  return `${pad(d)}/${pad(m)}/${y}`;
}
export function fmtDayMonth(iso) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; }

export function fmtDur(sec, { showSec = false } = {}) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (showSec) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h === 0) return `${m} min`;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}
export function fmtMin(min) { return fmtDur(min * 60); }

export function relDays(iso, today = todayISO()) {
  const n = diffDays(iso, today);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n > 0) return `em ${n} dias`;
  return `há ${-n} dias`;
}

// Converte data+hora de Brasília para instante UTC (Brasília é UTC-3 sem horário de verão desde 2019).
export function brToUTC(iso, hm = '09:00') {
  const [y, m, d] = iso.split('-').map(Number); const [h, mi] = hm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h + 3, mi));
}
