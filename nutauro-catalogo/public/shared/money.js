// Valores monetários são sempre inteiros em centavos.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents) {
  if (cents == null || Number.isNaN(cents)) return '—';
  return brl.format(cents / 100);
}

/** Converte "129,90", "129.90", "R$ 1.299,90" ou 129.9 em centavos. Retorna null se inválido. */
export function parseBRL(input) {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = String(input).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function centsToInput(cents) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}
