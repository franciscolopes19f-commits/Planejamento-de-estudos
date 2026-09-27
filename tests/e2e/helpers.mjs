// Utilitários compartilhados pelos testes de navegador.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
export const { chromium, devices } = pw;

// Preenche a configuração inicial com uma rotina típica (valores de teste, não do usuário).
export async function completeSetup(page, base) {
  await page.goto(base + '#/configurar');
  await page.locator('#cfg-acordo').waitFor();
  await page.fill('#cfg-acordo', '05:30');
  await page.fill('#cfg-durmo', '23:30');
  for (const d of ['1', '2', '3', '4', '5']) await page.check(`input[name="tDias"][value="${d}"]`);
  await page.fill('#cfg-tEntrada', '08:00');
  await page.fill('#cfg-tSaida', '17:00');
  await page.fill('#cfg-aIni', '12:00');
  await page.fill('#cfg-aFim', '13:00');
  for (const d of ['1', '2', '3', '4']) await page.check(`input[name="fDias"][value="${d}"]`);
  for (const p of ['antesTrabalho', 'aposTrabalho', 'sabManha', 'sabTarde', 'domManha']) await page.check(`input[name="periodos"][value="${p}"]`);
  await page.getByTestId('salvar-config').click();
  await page.getByRole('heading', { name: 'O que estudar hoje' }).waitFor();
}
