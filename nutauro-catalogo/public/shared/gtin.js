// Validação de códigos EAN/GTIN (GTIN-8, UPC-A/GTIN-12, EAN-13, GTIN-14).
// Módulo compartilhado entre navegador e servidor.

export function normalizeGtin(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

export function gtinCheckDigit(body) {
  // body = todos os dígitos exceto o verificador
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(body[i]) * w;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * @returns {{ valid: boolean, code: string, type?: string, error?: string }}
 */
export function validateGtin(raw) {
  const code = normalizeGtin(raw);
  if (!code) return { valid: false, code, error: 'Informe o código de barras.' };
  const types = { 8: 'GTIN-8', 12: 'UPC-A (GTIN-12)', 13: 'EAN-13', 14: 'GTIN-14' };
  if (!types[code.length]) {
    return { valid: false, code, error: `Código com ${code.length} dígitos. Use 8, 12, 13 ou 14 dígitos.` };
  }
  if (/^0+$/.test(code)) return { valid: false, code, error: 'Código inválido (somente zeros).' };
  const expected = gtinCheckDigit(code.slice(0, -1));
  if (expected !== Number(code.at(-1))) {
    return { valid: false, code, error: 'Dígito verificador não confere. Confira a leitura.' };
  }
  return { valid: true, code, type: types[code.length] };
}

/** Forma canônica para busca: GTIN-14 com zeros à esquerda. */
export function gtinKey(raw) {
  const code = normalizeGtin(raw);
  return code.padStart(14, '0');
}
