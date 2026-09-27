// Cronômetro de estudo com tempo efetivo. Nada conta sozinho: o tempo só corre com o
// cronômetro ativo, e períodos de inatividade/ausência exigem confirmação.
export const CONFIRM_GRACE_MS = 3 * 60 * 1000;

export function createTimer(fields, nowMs = Date.now()) {
  return { ...fields, running: true, startedAt: new Date(nowMs).toISOString(), segStart: nowMs, accMs: 0, lastConfirm: nowMs, awaitingSince: null, hiddenAt: null, pauses: 0 };
}

export function elapsedMs(t, nowMs = Date.now()) {
  if (!t) return 0;
  return t.accMs + (t.running && t.segStart ? nowMs - t.segStart : 0);
}

export function pause(t, nowMs = Date.now(), at = nowMs) {
  if (!t.running) return t;
  t.accMs += Math.max(0, at - t.segStart);
  t.running = false; t.segStart = null; t.awaitingSince = null; t.pauses++;
  return t;
}

export function resume(t, nowMs = Date.now()) {
  if (t.running) return t;
  t.running = true; t.segStart = nowMs; t.lastConfirm = nowMs; t.awaitingSince = null; t.pausedReason = null;
  return t;
}

export function confirmActive(t, nowMs = Date.now()) { t.lastConfirm = nowMs; t.awaitingSince = null; return t; }

/**
 * Verificação periódica. Retorna:
 *  - 'ask' quando é hora de perguntar "ainda estudando?"
 *  - 'auto-paused' quando ninguém respondeu: pausa retroativamente no momento da pergunta
 *  - null caso contrário
 */
export function tick(t, inactivityMin, nowMs = Date.now()) {
  if (!t || !t.running) return null;
  if (t.awaitingSince) {
    if (nowMs - t.awaitingSince >= CONFIRM_GRACE_MS) {
      pause(t, nowMs, t.awaitingSince);
      t.pausedReason = 'inatividade';
      return 'auto-paused';
    }
    return null;
  }
  if (nowMs - t.lastConfirm >= inactivityMin * 60000) { t.awaitingSince = nowMs; return 'ask'; }
  return null;
}

// Ao voltar para o app depois de um tempo fora, o usuário decide se aquele tempo conta.
export function awayDecision(t, countAway, nowMs = Date.now()) {
  if (!t?.hiddenAt) return t;
  if (!countAway && t.running) { pause(t, nowMs, t.hiddenAt); t.pausedReason = 'ausencia'; }
  else confirmActive(t, nowMs);
  t.hiddenAt = null;
  return t;
}
