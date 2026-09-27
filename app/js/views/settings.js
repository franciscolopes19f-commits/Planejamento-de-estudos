// Configurações: metas, preferências do radar, notificações, backup e sincronização criptografada.
import { esc, icon, formData, toast, confirmDialog, download } from '../ui.js';
import { AREAS, LOCAIS } from '../radar.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { todayISO } from '../time.js';

export default {
  title: 'Configurações',
  render(app) {
    const s = app.state, p = s.profile, pr = s.prefs, sec = sync.getSecrets();
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
      <p class="small ink2">Tudo fica salvo <b>somente neste aparelho</b> (armazenamento local do navegador). Nenhum dado pessoal vai para o repositório do código. Faça backups periódicos.</p>
      <div class="row"><button class="btn" data-act="export">${icon('download')} Baixar backup (.json)</button><label class="btn">${icon('upload')} Restaurar backup<input type="file" accept="application/json" id="import-file" hidden></label></div>
      ${store.isMemoryOnly() ? '<div class="banner">Este navegador não permite salvar dados (modo privado ou demonstração). O que você fizer aqui será perdido ao fechar.</div>' : ''}
    </div>

    <form class="card stack" id="sync-form" style="margin-top:12px">
      <h2>${icon('cloud')} Sincronizar celular e computador (opcional)</h2>
      <p class="small ink2">Os dados são criptografados neste aparelho com a sua frase-senha (AES-256) e guardados num Gist secreto da sua conta GitHub. Sem a frase-senha ninguém consegue ler — nem o GitHub. Use o mesmo token, frase-senha e ID do Gist nos dois aparelhos.</p>
      <div class="form-grid">
        <label class="field"><span>Token do GitHub (permissão só de Gists)</span><input class="input" type="password" autocomplete="off" name="token" id="sy-token" value="${esc(sec.token || '')}" placeholder="github_pat_…"></label>
        <label class="field"><span>Frase-senha de criptografia</span><input class="input" type="password" autocomplete="new-password" name="pass" id="sy-pass" value="${esc(sec.pass || '')}" minlength="10"></label>
        <label class="field"><span>ID do Gist (vazio no 1º aparelho)</span><input class="input" name="gistId" id="sy-gist" value="${esc(s.sync.gistId || '')}"></label>
      </div>
      <p class="tiny muted">Token e frase-senha ficam apenas neste aparelho e não entram no backup. ${s.sync.lastSyncAt ? `Última sincronização: ${esc(new Date(s.sync.lastSyncAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}.` : ''}</p>
      <div class="row"><button class="btn primary" type="submit">${s.sync.enabled ? 'Salvar e enviar agora' : 'Ativar e enviar'}</button><button type="button" class="btn" data-act="pull">Baixar do outro aparelho</button>${s.sync.enabled ? '<button type="button" class="btn ghost danger" data-act="sync-off">Desativar</button>' : ''}</div>
    </form>

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
        Object.assign(s.profile, { name: d.name.trim(), dailyGoalMin: +d.dailyGoalMin, weeklyGoalMin: +d.weeklyGoalMin, sessionMin: +d.sessionMin, inactivityMin: +d.inactivityMin, notify: !!d.notify, quietStart: d.quietStart, quietEnd: d.quietEnd });
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
    root.querySelector('#sync-form').addEventListener('submit', async e => {
      e.preventDefault();
      const d = formData(e.target);
      if (!d.token || !d.pass || d.pass.length < 10) { toast('Informe o token e uma frase-senha com pelo menos 10 caracteres.'); return; }
      sync.setSecrets({ token: d.token.trim(), pass: d.pass });
      try {
        if (d.gistId && !app.state.sync.gistId) {
          const remote = await sync.pullRemote({ token: d.token.trim(), gistId: d.gistId.trim() });
          if (remote && await confirmDialog('Já existem dados nesse Gist. Substituir os dados deste aparelho pelos do outro?', { ok: 'Usar dados do outro aparelho' })) {
            const data = await sync.decrypt(remote, d.pass);
            data.sync = { enabled: true, gistId: d.gistId.trim(), lastSyncAt: new Date().toISOString() };
            store.replaceState(data); toast('Sincronização ativada com os dados do outro aparelho.'); return;
          }
        }
        const id = await sync.pushRemote(app.state, { token: d.token.trim(), pass: d.pass, gistId: d.gistId.trim() || app.state.sync.gistId });
        app.update(s => { s.sync = { enabled: true, gistId: id, lastSyncAt: new Date().toISOString() }; });
        toast(`Dados enviados (criptografados). ID do Gist: ${id}`);
      } catch (err) { toast(err.message); }
    });
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
      if (act === 'pull') {
        const sec = sync.getSecrets(); const gistId = root.querySelector('#sy-gist').value.trim() || app.state.sync.gistId;
        if (!sec.token || !sec.pass || !gistId) { toast('Preencha e salve token, frase-senha e ID do Gist primeiro.'); return; }
        try {
          const remote = await sync.pullRemote({ token: sec.token, gistId });
          if (!remote) { toast('Nada encontrado nesse Gist.'); return; }
          const data = await sync.decrypt(remote, sec.pass);
          if (!(await confirmDialog(`Substituir os dados deste aparelho pelos salvos em ${new Date(remote.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}?`, { ok: 'Substituir' }))) return;
          data.sync = { enabled: true, gistId, lastSyncAt: new Date().toISOString() };
          store.replaceState(data); toast('Dados baixados.');
        } catch (err) { toast(err.message); }
      }
      if (act === 'sync-off') { sync.clearSecrets(); app.update(s => { s.sync.enabled = false; }); toast('Sincronização desativada neste aparelho.'); }
      if (act === 'reset' && await confirmDialog('Apagar TODOS os dados deste aparelho? Faça um backup antes.', { ok: 'Apagar tudo', danger: true })) { store.resetAll(); app.regenerate({ days: 14 }); toast('Dados apagados.'); }
    });
  },
};
