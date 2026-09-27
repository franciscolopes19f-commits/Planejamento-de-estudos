// Configurações: metas, preferências do radar, notificações, backup e sincronização criptografada.
import { esc, icon, formData, toast, confirmDialog, download } from '../ui.js';
import { AREAS, LOCAIS } from '../radar.js';
import * as store from '../store.js';
import * as cloud from '../cloud.js';
import { openModal, closeModal, modalHead } from '../ui.js';
import { MY_STATUS_LABEL } from '../radar.js';
import { todayISO } from '../time.js';

export default {
  title: 'Configurações',
  render(app) {
    const s = app.state, p = s.profile, pr = s.prefs;
    const mine = app.contests().filter(c => s.my[c.id] && s.my[c.id].status !== 'desisti');
    const perm = typeof Notification === 'undefined' ? 'indisponível' : Notification.permission;
    const theme = (() => { try { return localStorage.getItem('rumo:tema') || 'auto'; } catch { return 'auto'; } })();
    return `<h1>Configurações</h1>
    <form class="card stack" id="profile-form" style="margin-top:14px">
      <h2>Metas e estudo</h2>
      <div class="form-grid">
        <label class="field"><span>Seu nome</span><input class="input" name="name" id="st-name" value="${esc(p.name)}"></label>
        <label class="field"><span>Meta diária (min)</span><input class="input" type="number" min="10" max="720" name="dailyGoalMin" id="st-daily" value="${p.dailyGoalMin}"></label>
        <label class="field"><span>Meta semanal (min)</span><input class="input" type="number" min="30" max="5000" name="weeklyGoalMin" id="st-weekly" value="${p.weeklyGoalMin}"></label>
        <label class="field"><span>Duração padrão da sessão (min)</span><input class="input" type="number" min="20" max="180" name="sessionMin" id="st-session" value="${p.sessionMin}"></label>
        <label class="field"><span>Perguntar se ainda estudo a cada (min)</span><input class="input" type="number" min="5" max="120" name="inactivityMin" id="st-inact" value="${p.inactivityMin}"></label>
      </div>
      <label class="field"><span>Concurso prioritário (ganha mais peso no plano)</span><select class="input" name="targetContestId" id="st-target"><option value="">— Nenhum (usa a prova mais próxima) —</option>${mine.map(c => `<option value="${esc(c.id)}" ${c.id === p.targetContestId ? 'selected' : ''}>${esc(c.orgao)} – ${esc(c.cargo || '')} (${esc(MY_STATUS_LABEL[s.my[c.id].status])})</option>`).join('')}</select></label>
      <p class="tiny muted">Dica: comece com uma meta que você cumpre até na semana corrida. Aumente depois de 3 semanas batendo a meta.</p>
      <h2 style="margin-top:8px">Preferências do radar</h2>
      <div class="field"><span>Áreas</span><div class="checks">${Object.entries(AREAS).map(([k, v]) => `<label><input type="checkbox" name="areas" value="${k}" ${pr.areas.includes(k) ? 'checked' : ''}>${v}</label>`).join('')}</div></div>
      <div class="field"><span>Localidades acompanhadas</span><div class="checks">${LOCAIS.map(l => `<label><input type="checkbox" name="locais" value="${l}" ${pr.locais.includes(l) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
      <div class="field"><span>Nunca mostrar</span><div class="checks">${LOCAIS.filter(l => l !== 'Federal').map(l => `<label><input type="checkbox" name="excluirLocais" value="${l}" ${pr.excluirLocais.includes(l) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
      <label class="field"><span>Cargos de interesse (palavras-chave separadas por vírgula; vazio = todos)</span><input class="input" name="cargos" id="st-cargos" value="${esc(pr.cargos.join(', '))}"></label>
      <h2 style="margin-top:8px">Notificações</h2>
      <div class="checks"><label><input type="checkbox" name="notify" ${p.notify ? 'checked' : ''}> Avisos de inscrição, pagamento e prova (no máximo 2 por dia)</label></div>
      <div class="form-grid">
        <label class="field"><span>Silêncio a partir de</span><input class="input" type="time" name="quietStart" id="st-qs" value="${esc(p.quietStart)}"></label>
        <label class="field"><span>até</span><input class="input" type="time" name="quietEnd" id="st-qe" value="${esc(p.quietEnd)}"></label>
      </div>
      <div class="row"><span class="small muted">Permissão do navegador: <b>${esc(perm)}</b></span>${perm === 'default' ? `<button type="button" class="btn sm" data-act="perm">${icon('bell')} Permitir notificações</button>` : ''}</div>
      <p class="tiny muted">No iPhone, notificações só funcionam com o app adicionado à Tela de Início (Safari → Compartilhar → Adicionar à Tela de Início). Para lembretes garantidos mesmo com o app fechado, use “Exportar datas e alertas (.ics)” em Meus concursos.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">Salvar configurações</button></div>
    </form>

    <div class="card stack" style="margin-top:12px">
      <h2>Aparência</h2>
      <div class="tabs" style="max-width:360px">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button type="button" data-act="theme" data-theme="${k}" class="${theme === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    </div>

    <div class="card stack" style="margin-top:12px">
      <h2>${icon('lock')} Seus dados</h2>
      <p class="small ink2">Os dados ficam salvos neste aparelho${cloud.session() ? ' e, com a conta conectada, também no seu projeto Supabase (só a sua conta tem acesso)' : ''}. Nenhum dado pessoal vai para o repositório do código. O backup (.json) é sempre seu: baixe de vez em quando.</p>
      <div class="row"><button class="btn" data-act="export">${icon('download')} Baixar backup (.json)</button><label class="btn">${icon('upload')} Restaurar backup<input type="file" accept="application/json" id="import-file" hidden></label></div>
      ${store.isMemoryOnly() ? '<div class="banner">Este navegador não permite salvar dados (modo privado ou demonstração). O que você fizer aqui será perdido ao fechar.</div>' : ''}
    </div>

    ${cloudCard(app)}

    <div class="card stack" style="margin-top:12px">
      <h2>Recomeçar</h2>
      <p class="small muted">Apaga todos os dados deste aparelho e volta aos dados de exemplo.</p>
      <div><button class="btn danger" data-act="reset">${icon('trash')} Apagar tudo</button></div>
    </div>`;
  },
  mount(root, app) {
    root.querySelector('#profile-form').addEventListener('submit', e => {
      e.preventDefault();
      const d = formData(e.target);
      app.update(s => {
        Object.assign(s.profile, { targetContestId: d.targetContestId || null, name: d.name.trim(), dailyGoalMin: +d.dailyGoalMin, weeklyGoalMin: +d.weeklyGoalMin, sessionMin: +d.sessionMin, inactivityMin: +d.inactivityMin, notify: !!d.notify, quietStart: d.quietStart, quietEnd: d.quietEnd });
        s.prefs = { areas: [].concat(d.areas || []), locais: [].concat(d.locais || []), excluirLocais: [].concat(d.excluirLocais || []), cargos: (d.cargos || '').split(',').map(x => x.trim()).filter(Boolean) };
      });
      app.regenerate();
      toast('Configurações salvas.');
    });
    root.querySelector('#import-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!(await confirmDialog('Restaurar este backup? Os dados atuais deste aparelho serão substituídos.', { ok: 'Restaurar', danger: true }))) return;
      try { store.importJSON(await f.text()); toast('Backup restaurado.'); } catch (err) { toast(err.message || 'Arquivo inválido.'); }
    });
    bindCloud(root, app);
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'perm') { await Notification.requestPermission(); app.render(); }
      if (act === 'theme') {
        try { if (a.dataset.theme === 'auto') localStorage.removeItem('rumo:tema'); else localStorage.setItem('rumo:tema', a.dataset.theme); } catch { /* ignore */ }
        if (a.dataset.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = a.dataset.theme;
        app.render();
      }
      if (act === 'export') { download(`rumo-backup-${todayISO()}.json`, store.exportJSON()); toast('Backup baixado. Guarde em local seguro.'); }
      if (act === 'reset' && await confirmDialog('Apagar TODOS os dados deste aparelho? Faça um backup antes. Se estiver conectado, você sai da conta, e os dados da nuvem não são apagados.', { ok: 'Apagar tudo', danger: true })) { cloud.signOut(); store.resetAll(); app.regenerate({ days: 14 }); toast('Dados deste aparelho apagados (a conta na nuvem não foi alterada).'); app.go('configurar'); }
    });
  },
};

// ---------- Conta e sincronização (Supabase) ----------
let pendingEmail = '';

function cloudCard(app) {
  const cfg = cloud.config(), ses = cloud.session(), st = app.cloudStatus || {};
  const last = app.state.sync?.lastSyncAt;
  let body;
  if (!cfg) {
    body = `<p class="small ink2">A sincronização ainda não foi ligada a um projeto Supabase nesta publicação. Depois da configuração (veja o README), aparece aqui a opção de entrar com seu e-mail.</p>`;
  } else if (!ses) {
    body = pendingEmail ? `
      <p class="small ink2">Enviamos um código de 6 dígitos para <b>${esc(pendingEmail)}</b>. Digite aqui (não precisa clicar em link nenhum).</p>
      <form class="row" id="code-form" style="flex-wrap:nowrap"><input class="input" name="code" id="cl-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" placeholder="000000" required style="max-width:180px;letter-spacing:.2em;font-weight:700"><button class="btn primary" type="submit" data-testid="entrar">Entrar</button></form>
      <div class="row"><button type="button" class="btn sm ghost" data-act="cl-restart">Usar outro e-mail</button><button type="button" class="btn sm ghost" data-act="cl-resend">Reenviar código</button></div>
      <p class="tiny muted">O plano gratuito envia poucos e-mails por hora: se pedir vários códigos seguidos, espere alguns minutos.</p>`
      : `<p class="small ink2">Entre com o seu e-mail para usar os mesmos dados no iPhone e no notebook. Você recebe um código de 6 dígitos (sem senha).</p>
      <form class="row" id="email-form" style="flex-wrap:nowrap"><input class="input" type="email" name="email" id="cl-email" autocomplete="email" required placeholder="seu@email.com"><button class="btn primary" type="submit" data-testid="enviar-codigo">Enviar código</button></form>
      <p class="tiny muted">Use o mesmo e-mail da conta que criou o projeto no Supabase.</p>`;
  } else {
    body = `<div class="row between"><div><div class="small">Conectado como <b>${esc(ses.email || '')}</b></div>
      <div class="tiny muted">${st.state === 'erro' ? `<span style="color:var(--red)">${esc(st.msg)}</span>` : last ? `Última sincronização: ${esc(new Date(last).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}` : 'Ainda não sincronizado.'}</div></div>
      <div class="row"><button type="button" class="btn sm primary" data-act="cl-sync" data-testid="sincronizar">${icon('repeat')} Sincronizar agora</button><button type="button" class="btn sm ghost" data-act="cl-logout">Sair</button></div></div>
      <p class="tiny muted">Sincroniza sozinho ao abrir o app, ao voltar para ele e após cada alteração. O cronômetro em andamento fica só no aparelho em que foi iniciado.</p>`;
  }
  return `<div class="card stack" style="margin-top:12px" id="cloud-card"><h2>${icon('cloud')} Conta e sincronização</h2>${body}
    <details class="tiny muted"><summary>Avançado: projeto Supabase deste aparelho</summary>
      <form class="stack" id="cfg-form" style="margin-top:8px"><div class="form-grid">
        <label class="field"><span>Project URL</span><input class="input" name="url" id="cl-url" value="${esc(cfg?.source === 'aparelho' ? cfg.url : '')}" placeholder="https://xxxx.supabase.co"></label>
        <label class="field"><span>Chave anon (pública)</span><input class="input" name="anonKey" id="cl-key" value="${esc(cfg?.source === 'aparelho' ? cfg.anonKey : '')}"></label></div>
        <div><button class="btn sm" type="submit">Salvar neste aparelho</button></div>
        <p>Normalmente não é preciso: a publicação já leva esses dados. Nunca use a chave service_role aqui.</p></form>
    </details></div>`;
}

function chooseFirstSync(app) {
  return new Promise(resolve => {
    openModal(`${modalHead('Já existem dados na sua conta')}
      <p class="small">Esta é a primeira sincronização deste aparelho. O que fazer?</p>
      <div class="stack" style="margin-top:12px">
        <button class="btn primary" data-m="cloud">Usar os dados da conta (recomendado no 2º aparelho)</button>
        <button class="btn" data-m="merge">Juntar os dados deste aparelho com os da conta</button>
        <button class="btn danger" data-m="local">Substituir os da conta pelos deste aparelho</button>
      </div>`, {
      onMount: m => m.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { resolve(b.dataset.m); closeModal(); } }),
      onClose: () => resolve(null),
    });
  });
}

function bindCloud(root, app) {
  root.querySelector('#email-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    try { await cloud.sendCode(email); pendingEmail = email; toast('Código enviado. Confira seu e-mail (e o spam).'); app.render(); }
    catch (err) { toast(err.message); }
  });
  root.querySelector('#code-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await cloud.verifyCode(pendingEmail, e.target.code.value);
      pendingEmail = '';
      const exists = await cloud.remoteExists();
      const mode = exists ? await chooseFirstSync(app) : 'local';
      if (!mode) { toast('Conectado. Escolha como sincronizar em “Sincronizar agora”.'); app.render(); return; }
      await app.runSync({ mode, quiet: false });
      toast(mode === 'cloud' ? 'Pronto! Dados da conta carregados neste aparelho.' : 'Pronto! Dados enviados para sua conta.');
      app.render();
    } catch (err) { toast(err.message); app.render(); }
  });
  root.querySelector('#cfg-form')?.addEventListener('submit', e => {
    e.preventDefault();
    cloud.setLocalConfig(e.target.url.value, e.target.anonKey.value);
    toast('Configuração salva neste aparelho.'); app.render();
  });
  root.addEventListener('click', async e => {
    const a = e.target.closest('[data-act^="cl-"]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'cl-restart') { pendingEmail = ''; app.render(); }
    if (act === 'cl-resend') { try { await cloud.sendCode(pendingEmail); toast('Novo código enviado.'); } catch (err) { toast(err.message); } }
    if (act === 'cl-logout' && await confirmDialog('Sair da conta neste aparelho? Os dados continuam salvos aqui e na nuvem.', { ok: 'Sair' })) { cloud.signOut(); app.render(); }
    if (act === 'cl-sync') {
      try {
        if (!cloud.hasBase()) {
          const exists = await cloud.remoteExists();
          const mode = exists ? await chooseFirstSync(app) : 'local';
          if (!mode) return;
          await app.runSync({ mode, quiet: false });
        } else await app.runSync({ quiet: false });
        toast('Sincronizado.'); app.render();
      } catch (err) { toast(err.message); app.render(); }
    }
  });
}
