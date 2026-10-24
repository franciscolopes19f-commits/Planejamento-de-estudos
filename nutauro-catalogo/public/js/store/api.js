// Camada de acesso à API. Em modo demonstração estática (sem servidor), window.NT_DEMO responde no navegador.

const net = { listeners: new Set(), offline: false };

export function onNetChange(fn) {
  net.listeners.add(fn);
}

function setOffline(v) {
  if (net.offline === v) return;
  net.offline = v;
  net.listeners.forEach((fn) => fn(v));
}

export async function api(path, { method = 'GET', body } = {}) {
  if (window.NT_DEMO) return window.NT_DEMO.request(path, { method, body });
  let r;
  try {
    r = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    setOffline(true);
    const err = new Error('Sem conexão. Verifique sua internet e tente novamente.');
    err.network = true;
    throw err;
  }
  setOffline(false);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || 'Não foi possível carregar. Tente novamente.');
    err.status = r.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

window.addEventListener('offline', () => setOffline(true));
window.addEventListener('online', () => setOffline(false));
