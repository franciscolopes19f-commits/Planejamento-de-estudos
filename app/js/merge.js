// Mesclagem em 3 vias (base = última versão sincronizada, a = este aparelho, b = nuvem).
// Mudanças feitas em aparelhos diferentes são combinadas; só quando os dois alteram o MESMO
// campo vence a versão mais recente. Listas com "id" são mescladas item a item, e exclusões
// feitas num aparelho são respeitadas no outro.
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasId = x => isObj(x) && typeof x.id === 'string';
const isIdArray = (...arrs) => arrs.every(a => a === undefined || (Array.isArray(a) && a.every(hasId))) && arrs.some(a => Array.isArray(a) && a.length);

export function eq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
}

function mergeMissing(base, present, inBase) {
  // item existe só de um lado: se estava na base e não mudou, o outro lado o excluiu
  if (inBase && eq(base, present)) return { drop: true };
  return { drop: false, value: present };
}

export function merge3(base, a, b, aNewer = true) {
  if (eq(a, b)) return a;
  if (base !== undefined && eq(base, a)) return b;
  if (base !== undefined && eq(base, b)) return a;
  if (Array.isArray(a) && Array.isArray(b) && isIdArray(base, a, b)) {
    const m = arr => new Map((arr || []).map(x => [x.id, x]));
    const bm = m(base), am = m(a), rm = m(b);
    const ids = [...am.keys(), ...[...rm.keys()].filter(k => !am.has(k))];
    const out = [];
    for (const id of ids) {
      const inA = am.has(id), inB = rm.has(id), inBase = bm.has(id);
      if (inA && inB) out.push(merge3(bm.get(id), am.get(id), rm.get(id), aNewer));
      else {
        const r = mergeMissing(bm.get(id), inA ? am.get(id) : rm.get(id), inBase);
        if (!r.drop) out.push(r.value);
      }
    }
    return out;
  }
  if (isObj(a) && isObj(b)) {
    const out = {};
    const bb = isObj(base) ? base : undefined;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const inA = k in a, inB = k in b, inBase = !!bb && k in bb;
      if (inA && inB) out[k] = merge3(bb ? bb[k] : undefined, a[k], b[k], aNewer);
      else {
        const r = mergeMissing(bb?.[k], inA ? a[k] : b[k], inBase);
        if (!r.drop) out[k] = r.value;
      }
    }
    return out;
  }
  return aNewer ? a : b;
}

// Campos que são só deste aparelho e não vão para a nuvem.
export function toCloud(state) {
  const { timer, sync, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

export function mergeStates(base, local, remote) {
  const a = toCloud(local);
  const aNewer = (a.updatedAt || '') >= (remote.updatedAt || '');
  const merged = merge3(base ?? undefined, a, remote, aNewer);
  if (merged.plan?.sessions) merged.plan.sessions.sort((x, y) => (x.date + (x.start || '')).localeCompare(y.date + (y.start || '')));
  merged.updatedAt = [a.updatedAt, remote.updatedAt].sort().pop();
  return merged;
}
