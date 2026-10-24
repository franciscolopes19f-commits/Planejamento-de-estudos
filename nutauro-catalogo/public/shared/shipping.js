// Regras de entrega configuráveis. Fuso fixo America/Sao_Paulo.
// "Horas corridas" contam relógio contínuo; "dias úteis" pulam dias sem operação e feriados.
// Nenhuma tarifa é inventada: zona sem valor configurado retorna "a confirmar".

export const TZ = 'America/Sao_Paulo';

export function normalizeCep(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length === 8 ? d : null;
}

export function formatCep(cep) {
  const d = normalizeCep(cep);
  return d ? `${d.slice(0, 5)}-${d.slice(5)}` : String(cep ?? '');
}

/** Partes de data/hora no fuso da loja. */
export function localParts(date, tz = TZ) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  return { ymd: `${p.year}-${p.month}-${p.day}`, weekday: wd, minutes: hour * 60 + Number(p.minute) };
}

function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function addDaysYmd(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(ymd) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export function isOperatingDay(ymd, cfg) {
  const days = cfg.operating_days ?? [1, 2, 3, 4, 5, 6];
  return days.includes(weekdayOf(ymd)) && !(cfg.holidays || []).includes(ymd);
}

export function nextOperatingDay(ymd, cfg, includeToday = false) {
  let d = includeToday ? ymd : addDaysYmd(ymd, 1);
  for (let i = 0; i < 60; i++, d = addDaysYmd(d, 1)) if (isOperatingDay(d, cfg)) return d;
  return null;
}

export function addBusinessDays(ymd, n, cfg) {
  let d = ymd;
  let left = n;
  for (let i = 0; i < 400 && left > 0; i++) {
    d = addDaysYmd(d, 1);
    if (isOperatingDay(d, cfg)) left--;
  }
  return d;
}

export function fmtYmd(ymd) {
  const [y, m, d] = ymd.split('-');
  const wd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][weekdayOf(ymd)];
  return `${wd}, ${d}/${m}`;
}

export function findZone(cep, zones) {
  const c = normalizeCep(cep);
  if (!c) return null;
  const n = Number(c);
  for (const z of zones || []) {
    if (z.active === false) continue;
    for (const [a, b] of z.cep_ranges || []) {
      if (n >= Number(normalizeCep(a) ?? a) && n <= Number(normalizeCep(b) ?? b)) return z;
    }
  }
  return null;
}

function feeFor(zone, itemsCents) {
  if (zone.free_over_cents != null && zone.free_over_cents > 0 && itemsCents >= zone.free_over_cents) {
    return { status: 'free', fee_cents: 0 };
  }
  if (zone.fee_cents != null && zone.fee_cents >= 0) {
    return zone.fee_cents === 0 ? { status: 'free', fee_cents: 0 } : { status: 'fixed', fee_cents: zone.fee_cents };
  }
  return { status: 'to_confirm', fee_cents: null };
}

function estimateFor(zone, cfg, now, allInStock) {
  const lp = localParts(now, cfg.timezone || TZ);
  const prep = Number(cfg.prep_minutes) || 0;
  const sla = zone.sla || { type: 'carrier' };
  if (sla.type === 'same_day') {
    const cutoff = hmToMin(sla.cutoff);
    const todayOk = isOperatingDay(lp.ymd, cfg) && cutoff != null && lp.minutes + prep <= cutoff;
    if (todayOk && allInStock) {
      return {
        same_day: true,
        text: `Possível entrega hoje (${fmtYmd(lp.ymd)}) se o pedido for confirmado até ${sla.cutoff}`,
        date: lp.ymd,
      };
    }
    const fb = Math.max(1, Number(sla.fallback_business_days) || 1);
    const d = addBusinessDays(lp.ymd, fb, cfg);
    const why = !allInStock ? 'item sem estoque imediato' : !isOperatingDay(lp.ymd, cfg) ? 'hoje sem expediente' : `após ${sla.cutoff}`;
    return { same_day: false, text: `Previsão: ${fmtYmd(d)} (${why})`, date: d };
  }
  if (sla.type === 'hours') {
    return { same_day: false, text: `Em até ${sla.hours} horas corridas após a confirmação do pedido` };
  }
  if (sla.type === 'business_days') {
    const start = isOperatingDay(lp.ymd, cfg) ? lp.ymd : nextOperatingDay(lp.ymd, cfg);
    const d = addBusinessDays(start, Number(sla.days) || 1, cfg);
    return { same_day: false, text: `Em até ${sla.days} dia(s) útil(eis) — previsão ${fmtYmd(d)}`, date: d };
  }
  return { same_day: false, text: 'Prazo conforme transportadora — confirmamos pelo WhatsApp' };
}

/**
 * Calcula opções de entrega para um CEP.
 * @param {object} p
 * @param {string} [p.cep]
 * @param {object} p.delivery  configuração de entrega
 * @param {object} p.pickup    configuração de retirada
 * @param {Date}   [p.now]
 * @param {number} [p.itemsCents]
 * @param {boolean} [p.allInStock]
 */
export function quoteShipping({ cep, delivery, pickup, now = new Date(), itemsCents = 0, allInStock = true }) {
  const options = [];
  if (pickup?.enabled) {
    options.push({
      id: 'pickup',
      kind: 'pickup',
      label: 'Retirar na loja',
      status: 'pickup',
      fee_cents: 0,
      estimate: { text: pickup.estimate_text || 'Disponível após a confirmação do pedido, no horário de funcionamento' },
      address: pickup.address || '',
    });
  }
  const c = normalizeCep(cep);
  if (cep != null && cep !== '' && !c) return { cep: null, error: 'CEP inválido. Use 8 dígitos.', options };
  if (!c) return { cep: null, options };
  const zone = findZone(c, delivery?.zones);
  if (!zone) {
    return { cep: c, zone: null, options, message: 'Não encontramos entrega configurada para este CEP. Fale com a loja pelo WhatsApp.' };
  }
  if (zone.blocked) {
    return { cep: c, zone: { id: zone.id, name: zone.name }, options, message: zone.note || 'Ainda não entregamos neste CEP.' };
  }
  const fee = feeFor(zone, itemsCents);
  options.push({
    id: `zone:${zone.id}`,
    kind: 'delivery',
    label: zone.label || `Entrega — ${zone.name}`,
    zone_id: zone.id,
    status: fee.status,
    fee_cents: fee.fee_cents,
    free_over_cents: zone.free_over_cents ?? null,
    estimate: estimateFor(zone, delivery, now, allInStock),
    note: zone.note || '',
  });
  return { cep: c, zone: { id: zone.id, name: zone.name }, options };
}
