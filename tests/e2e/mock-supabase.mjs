// Servidor que imita as partes do Supabase usadas pelo app (Auth por código + PostgREST com RLS),
// incluindo as restrições do plano gratuito com o e-mail padrão:
//  - só envia código para e-mails da equipe do projeto (ALLOWED_EMAILS)
//  - limite de 2 e-mails por hora
// Serve para testar o app sem acesso à internet. NÃO substitui o teste no Supabase real.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export function startMock({ port = 54321, allowed = ['eu@exemplo.com'], emailsPerHour = 2 } = {}) {
  const codes = new Map();       // email -> código
  const sent = [];               // horários de envio
  const users = new Map();       // email -> id
  const tokens = new Map();      // access/refresh -> {id, email}
  const rows = new Map();        // user_id -> {user_id, data, rev, updated_at}
  const log = [];

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const issue = (u) => {
    const access = randomUUID(), refresh = randomUUID();
    tokens.set(access, u); tokens.set('r:' + refresh, u);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: refresh, user: { id: u.id, email: u.email } };
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, 'http://x');
    let body = ''; for await (const c of req) body += c;
    const json = body ? JSON.parse(body) : {};
    log.push(`${req.method} ${url.pathname}${url.search}`);
    if (!req.headers.apikey && !url.pathname.startsWith('/__')) return send(res, 401, { message: 'No API key found in request' });

    if (url.pathname === '/__codes') return send(res, 200, { code: codes.get(url.searchParams.get('email')) || null });
    if (url.pathname === '/__rows') return send(res, 200, [...rows.values()]);

    if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
      const email = json.email;
      if (!allowed.includes(email)) return send(res, 400, { code: 400, error_code: 'email_address_not_authorized', msg: 'Email address not authorized' });
      const now = Date.now();
      if (sent.filter(t => now - t < 3600e3).length >= emailsPerHour) return send(res, 429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' });
      sent.push(now);
      codes.set(email, String(Math.floor(100000 + Math.random() * 900000)));
      return send(res, 200, {});
    }
    if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
      if (json.type !== 'email' || codes.get(json.email) !== json.token) return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      codes.delete(json.email);
      if (!users.has(json.email)) users.set(json.email, randomUUID());
      return send(res, 200, issue({ id: users.get(json.email), email: json.email }));
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const u = tokens.get('r:' + json.refresh_token);
      if (!u) return send(res, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      tokens.delete('r:' + json.refresh_token);
      return send(res, 200, issue(u));
    }
    if (url.pathname === '/rest/v1/rpc/rumo_ping') return send(res, 200, 1);
    if (url.pathname === '/rest/v1/rumo_dados') {
      const u = tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!u) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid' });
      const f = k => url.searchParams.get(k)?.replace(/^eq\./, '');
      const visible = [...rows.values()].filter(r => r.user_id === u.id); // RLS
      if (req.method === 'GET') return send(res, 200, visible.filter(r => !f('user_id') || r.user_id === f('user_id')).map(r => ({ data: r.data, rev: r.rev, updated_at: r.updated_at })));
      if (req.method === 'POST') {
        if (json.user_id !== u.id) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
        if (rows.has(u.id)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        const r = { user_id: u.id, data: json.data, rev: json.rev || 1, updated_at: new Date().toISOString() };
        rows.set(u.id, r); return send(res, 201, [r]);
      }
      if (req.method === 'PATCH') {
        const r = rows.get(u.id);
        if (!r || (f('user_id') && f('user_id') !== u.id) || (f('rev') && String(r.rev) !== f('rev'))) return send(res, 200, []);
        Object.assign(r, json); return send(res, 200, [r]);
      }
    }
    return send(res, 404, { message: 'not found' });
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, codes, rows, log, url: `http://localhost:${port}`, close: () => new Promise(r => server.close(r)) })));
}
