// Testes de ponta a ponta dos fluxos principais, num navegador real (Chromium) com tela de iPhone.
// Uso: npm start (em outro terminal) e depois npm run test:e2e   — ou defina BASE_URL.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, devices, completeSetup } from './helpers.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = process.env.SHOTS_DIR || 'tests/e2e/screens';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|ERR_NAME|net::/.test(m.text())) errors.push(m.text()); });
page.on('dialog', d => d.dismiss());

// Segunda-feira 28/09/2026, 05:40 em Brasília
await page.clock.install({ time: new Date('2026-09-28T08:40:00Z') });

const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.error(`✘ ${name}\n  ${e.message}`); await page.screenshot({ path: `${OUT}/falha.png`, fullPage: true }); process.exitCode = 1; throw e; }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const noHScroll = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal');

try {
  await step('primeiro acesso abre a configuração inicial sem presumir horários', async () => {
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Configuração inicial' }).waitFor();
    const s = await page.evaluate(() => window.rumo.state);
    assert.equal(s.events.length, 0, 'sem compromissos de exemplo');
    assert.equal(s.availability.length, 0, 'sem janelas de exemplo (nada de 6h ou almoço presumidos)');
    assert.equal(s.profile.targetContestId, 'radar-queimados-2026-contador', 'Queimados como prioridade inicial');
    // sem marcar períodos, não gera janelas
    await page.fill('#cfg-acordo', '06:30'); await page.fill('#cfg-durmo', '23:00');
    await page.getByTestId('salvar-config').click();
    await page.getByText(/Nenhuma janela de estudo foi gerada/).waitFor();
    await shot('00-configuracao');
  });

  await step('configuração inicial gera rotina e plano; painel mostra “O que estudar hoje”', async () => {
    await completeSetup(page, BASE);
    const s = await page.evaluate(() => window.rumo.state);
    assert.ok(s.setupDone);
    assert.ok(s.events.some(e => e.type === 'faculdade' && e.start === '18:20' && e.end === '22:00'), 'faculdade 18h20–22h');
    assert.ok(!s.availability.some(a => a.start === '12:15'), 'almoço não marcado não vira janela');
    assert.ok(await page.locator('.hero .sess').count() >= 1, 'há sessões planejadas para hoje');
    await noHScroll();
    await shot('01-hoje');
  });

  await step('cadastra um concurso manualmente', async () => {
    await page.goto(BASE + '#/concursos/radar');
    await page.getByTestId('novo-concurso').click();
    await page.fill('#c-orgao', 'ISS Niterói');
    await page.fill('#c-cargo', 'Auditor Municipal de Receita');
    await page.selectOption('#c-local', 'RJ');
    await page.selectOption('#c-area', 'fiscal');
    await page.fill('#c-banca', 'Banca Teste');
    await page.fill('#c-vagas', '10');
    await page.fill('#c-inscInicio', '2026-09-20');
    await page.fill('#c-inscFim', '2026-10-02');
    await page.fill('#c-prova', '2026-11-15');
    await page.fill('#c-link', 'https://exemplo.gov.br/edital');
    await page.getByTestId('salvar-concurso').click();
    await page.locator('article.contest', { hasText: 'ISS Niterói' }).waitFor();
    assert.match(await page.locator('article.contest', { hasText: 'ISS Niterói' }).innerText(), /Inscrições abertas/);
    const q = await page.locator('article.contest', { hasText: 'Prefeitura de Queimados' }).innerText();
    assert.match(q, /Contador/); assert.match(q, /Fonte: Folha Dirigida/); assert.match(q, /conferido em 27\/09\/2026/); assert.match(q, /Notícia/);
    await shot('02-radar');
  });

  await step('marca o concurso como inscrito e registra dados da inscrição', async () => {
    const card = page.locator('article.contest', { hasText: 'ISS Niterói' });
    await card.locator('select[data-act="track"]').selectOption('inscrito');
    await page.fill('#m-numInscricao', '2026-000123');
    await page.fill('#m-taxa', '120');
    await page.check('#m-pago');
    await page.fill('#m-localProva', 'UFF – Campus Gragoatá');
    await page.getByTestId('salvar-acompanhamento').click();
    await page.goto(BASE + '#/concursos/meus');
    const mine = page.locator('.kanban-col', { has: page.locator('h3', { hasText: /^Inscrito/ }) });
    await mine.locator('article', { hasText: 'ISS Niterói' }).waitFor();
    assert.match(await mine.innerText(), /2026-000123/);
    assert.match(await mine.innerText(), /paga/);
    await shot('03-meus-concursos');
  });

  await step('gera o plano de estudos da semana', async () => {
    await page.goto(BASE + '#/plano');
    await page.getByTestId('gerar-plano').click();
    await page.locator('.sess-item').first().waitFor();
    const n = await page.locator('.sess-item').count();
    assert.ok(n >= 8, `plano com ${n} sessões`);
    assert.match(await page.locator('.sess-item').first().innerText(), /\d\d:\d\d/);
    await noHScroll();
    await shot('04-plano');
  });

  await step('move uma sessão para outro dia', async () => {
    await page.locator('.sess-item').first().click();
    await page.getByRole('button', { name: /Editar \/ mudar de dia/ }).click();
    await page.fill('#p-date', '2026-10-01');
    await page.fill('#p-start', '12:10');
    await page.getByRole('button', { name: 'Salvar' }).click();
    const day = page.locator('.day', { hasText: 'Qui 1 out' });
    await day.locator('.sess-item', { hasText: '12:10' }).waitFor();
  });

  await step('inicia uma sessão, pausa, retoma e o tempo só corre com o cronômetro ativo', async () => {
    await page.goto(BASE + '#/hoje');
    await page.getByTestId('iniciar-estudo').click();
    await page.getByTestId('comecar').click();
    await page.getByTestId('pausar').waitFor();
    await page.clock.runFor(10 * 60 * 1000); // 10 min estudando
    await page.getByTestId('pausar').click();
    const t1 = await page.getByTestId('timer').innerText();
    assert.match(t1, /^00:(09:5\d|1[01]:\d\d)$/, `tempo após 10 min: ${t1}`);
    await page.clock.runFor(5 * 60 * 1000); // 5 min pausado
    assert.equal(await page.getByTestId('timer').innerText(), t1, 'pausado não conta');
    await page.getByTestId('retomar').click();
    await page.clock.runFor(20 * 60 * 1000);
    const t2 = await page.getByTestId('timer').innerText();
    assert.match(t2, /^00:(29:5\d|3[01]:\d\d)$/, `tempo após retomar: ${t2}`);
    await shot('05-cronometro');
  });

  await step('pergunta se ainda estou estudando após inatividade', async () => {
    await page.clock.runFor(6 * 60 * 1000); // passa dos 25 min sem confirmação
    await page.getByRole('heading', { name: 'Ainda estudando?' }).waitFor();
    await page.getByRole('button', { name: /Sim, continuo/ }).click();
  });

  await step('encerra a sessão registrando questões, acertos e erros', async () => {
    await page.getByTestId('encerrar').click();
    await page.fill('#f-questoes', '20');
    await page.fill('#f-acertos', '14');
    await page.locator('#f-acertos').dispatchEvent('input');
    assert.equal(await page.inputValue('#f-erros'), '6');
    await page.fill('#f-obs', 'Revisar responsabilidade tributária');
    await page.getByRole('button', { name: /Salvar registro/ }).click();
    await page.getByText(/Registrado:/).waitFor();
    const s = await page.evaluate(() => window.rumo.state);
    assert.equal(s.logs.length, 1);
    assert.equal(s.logs[0].questoes, 20);
    assert.equal(s.logs[0].acertos, 14);
    assert.ok(s.logs[0].durSec >= 35 * 60 && s.logs[0].durSec <= 38 * 60, `duração efetiva ${s.logs[0].durSec}s`);
    assert.equal(s.timer, null);
    assert.equal(s.reviews.length, s.logs[0].topicId ? 3 : 0, 'revisões agendadas');
  });

  await step('registra manualmente um estudo feito fora do app', async () => {
    await page.goto(BASE + '#/estudar/manual');
    await page.fill('#f-durMin', '45');
    await page.fill('#f-date', '2026-09-27');
    await page.fill('#f-questoes', '10');
    await page.fill('#f-acertos', '5');
    await page.locator('#f-acertos').dispatchEvent('input');
    await page.getByRole('button', { name: /Salvar registro/ }).click();
    await page.getByText(/Registrado:/).waitFor();
    const s = await page.evaluate(() => window.rumo.state);
    assert.equal(s.logs.length, 2);
  });

  await step('consulta a evolução', async () => {
    await page.goto(BASE + '#/evolucao');
    await page.getByRole('heading', { name: 'Evolução' }).waitFor();
    const txt = await page.locator('#page').innerText();
    assert.match(txt, /Questões \(30 dias\)\s*30/);
    assert.match(txt, /63%/); // 19 acertos de 30
    assert.ok(await page.locator('.chart svg').count() >= 2, 'gráficos renderizados');
    await noHScroll();
    await shot('06-evolucao');
  });

  await step('painel mostra tempo estudado separado do tempo no app', async () => {
    await page.goto(BASE + '#/hoje');
    const txt = await page.locator('#page').innerText();
    assert.match(txt, /Tempo com o app aberto hoje/);
    assert.match(txt, /3[67] min\s*hoje/);
    assert.match(txt, /ISS Niterói/); // contagem regressiva da prova
    await shot('07-hoje-depois');
  });

  await step('demais telas abrem sem erro no celular', async () => {
    for (const r of ['materias', 'revisoes', 'rotina', 'config', 'mais']) {
      await page.goto(BASE + '#/' + r);
      await page.locator('#page h1').waitFor();
      await noHScroll();
      await shot(`08-${r}`);
    }
  });

  await step('dados persistem após recarregar', async () => {
    await page.reload();
    await page.locator('#page h1').waitFor();
    const s = await page.evaluate(() => window.rumo.state);
    assert.equal(s.logs.length, 2);
    assert.ok(Object.values(s.my).some(m => m.status === 'inscrito'));
  });

  assert.deepEqual(errors, [], 'sem erros de JavaScript');
  console.log('\nTodos os fluxos passaram.');
} catch (e) {
  if (errors.length) console.error('Erros no console:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
