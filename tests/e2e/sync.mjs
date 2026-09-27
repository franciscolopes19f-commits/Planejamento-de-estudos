// Teste de login por código e sincronização nos dois sentidos entre "iPhone" e "notebook",
// usando um servidor local que imita o Supabase (tests/e2e/mock-supabase.mjs).
// Valida a lógica do app; o teste no Supabase real e no iPhone físico continua necessário.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, devices, completeSetup } from './helpers.mjs';
import { startMock } from './mock-supabase.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = process.env.SHOTS_DIR || 'tests/e2e/screens';
mkdirSync(OUT, { recursive: true });
const EMAIL = 'eu@exemplo.com';

const mock = await startMock({ allowed: [EMAIL] });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function device(name, dev) {
  const ctx = await browser.newContext({ ...dev, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript(url => { localStorage.setItem('rumo:supabase-config', JSON.stringify({ url, anonKey: 'anon-publica-de-teste' })); }, mock.url);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|ERR_NAME|net::|status of 4\d\d/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return page;
}
async function login(page, { expectChoice = null } = {}) {
  await page.goto(BASE + '#/config');
  await page.fill('#cl-email', EMAIL);
  await page.getByTestId('enviar-codigo').click();
  await page.locator('#cl-code').waitFor();
  const { code } = await (await fetch(`${mock.url}/__codes?email=${EMAIL}`)).json();
  await page.fill('#cl-code', code);
  await page.getByTestId('entrar').click();
  if (expectChoice) {
    await page.getByRole('heading', { name: 'Já existem dados na sua conta' }).waitFor();
    await page.getByRole('button', { name: expectChoice }).click();
  }
  await page.getByText(/Conectado como/).waitFor();
}
const state = page => page.evaluate(() => window.rumo.state);
const syncNow = async page => {
  await page.goto(BASE + '#/config');
  await page.evaluate(() => document.querySelector('.toast')?.remove());
  await page.getByTestId('sincronizar').click();
  await page.locator('.toast', { hasText: /^Sincronizado\.$/ }).waitFor();
};
async function manualLog(page, min, date) {
  await page.goto(BASE + '#/estudar/manual');
  await page.fill('#f-durMin', String(min));
  if (date) await page.fill('#f-date', date);
  await page.getByRole('button', { name: /Salvar registro/ }).click();
  await page.getByText(/Registrado:/).waitFor();
}
const step = async (name, fn) => { try { await fn(); console.log(`✔ ${name}`); } catch (e) { console.error(`✘ ${name}\n  ${e.message}`); process.exitCode = 1; throw e; } };

try {
  const iphone = await device('iPhone', devices['iPhone 13']);
  const note = await device('notebook', { viewport: { width: 1366, height: 850 } });

  await step('e-mail fora da equipe do projeto recebe mensagem clara', async () => {
    await completeSetup(iphone, BASE);
    await iphone.goto(BASE + '#/config');
    await iphone.fill('#cl-email', 'outra@pessoa.com');
    await iphone.getByTestId('enviar-codigo').click();
    await iphone.getByText(/não pode receber códigos no plano gratuito/).waitFor();
  });

  await step('iPhone entra com código de 6 dígitos e envia os dados', async () => {
    await manualLog(iphone, 30, null);
    await login(iphone);
    const rows = await (await fetch(`${mock.url}/__rows`)).json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data.logs.length, 1);
    assert.equal(rows[0].data.timer, undefined, 'cronômetro não vai para a nuvem');
    await iphone.screenshot({ path: `${OUT}/sync-iphone-conta.png`, fullPage: true });
  });

  await step('notebook entra e carrega os dados do iPhone (nuvem → notebook)', async () => {
    await completeSetup(note, BASE);
    await login(note, { expectChoice: /Usar os dados da conta/ });
    const s = await state(note);
    assert.equal(s.logs.length, 1);
    assert.ok(s.setupDone && s.availability.length > 0);
  });

  await step('alteração no notebook chega ao iPhone (notebook → iPhone)', async () => {
    await manualLog(note, 45, null);
    await syncNow(note);
    await syncNow(iphone);
    assert.equal((await state(iphone)).logs.length, 2);
  });

  await step('edições simultâneas nos dois aparelhos são juntadas, sem perder nada', async () => {
    await manualLog(iphone, 20, null);
    await manualLog(note, 25, null);
    await syncNow(iphone);
    await syncNow(note);
    await syncNow(iphone);
    const a = await state(iphone), b = await state(note);
    assert.equal(a.logs.length, 4); assert.equal(b.logs.length, 4);
    assert.deepEqual(a.logs.map(l => l.id).sort(), b.logs.map(l => l.id).sort());
  });

  await step('exclusão feita num aparelho é respeitada no outro', async () => {
    const victim = (await state(note)).logs[0].id;
    await note.goto(BASE + '#/estudar');
    await note.locator(`[data-act="del-log"][data-id="${victim}"]`).click();
    await note.getByRole('button', { name: 'Excluir', exact: true }).click();
    await syncNow(note); await syncNow(iphone);
    assert.equal((await state(iphone)).logs.some(l => l.id === victim), false);
    assert.equal((await state(iphone)).logs.length, 3);
  });

  await step('limite de e-mails do plano gratuito mostra mensagem clara', async () => {
    const other = await device('iPhone-2', devices['iPhone 13']);
    await completeSetup(other, BASE);
    await other.goto(BASE + '#/config');
    await other.fill('#cl-email', EMAIL);
    await other.getByTestId('enviar-codigo').click();
    await other.getByText(/Limite de envio de e-mails atingido/).waitFor();
  });

  await step('backup continua disponível com a conta conectada', async () => {
    await iphone.goto(BASE + '#/config');
    await iphone.getByRole('button', { name: /Baixar backup/ }).waitFor();
    const [dl] = await Promise.all([iphone.waitForEvent('download'), iphone.getByRole('button', { name: /Baixar backup/ }).click()]);
    assert.match(dl.suggestedFilename(), /^rumo-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  assert.deepEqual(errors, [], 'sem erros de JavaScript');
  console.log('\nSincronização: todos os cenários passaram (servidor simulado).');
} catch (e) {
  if (errors.length) console.error('Erros:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  await mock.close();
}
