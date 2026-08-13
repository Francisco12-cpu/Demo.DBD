// Smoke test do modo Solo (Sobrevivente vs IA). Sobe um navegador de
// verdade (Playwright/Chromium) contra o jogo servido estaticamente e
// confere que o mundo monta, o movimento funciona e a câmera/iluminação
// não lança nenhum erro — não é teste de unidade, é o mesmo tipo de
// verificação manual que o CLAUDE.md pede, só que automatizada.
//
// Pré-requisito: `npx http-server . -p 8941` rodando (ver README.md).
// Rodar: node test/smoke-solo.mjs
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8941';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(`${BASE_URL}/index.html`);
await page.waitForTimeout(400);
await page.fill('#menu-name', 'SmokeTestSolo');
await page.click('#menu-solo-survivor');
await page.waitForTimeout(300);

function readState(){
  const arena = document.getElementById('arena');
  const stage = document.getElementById('stage');
  const player = arena ? arena.querySelectorAll('.char')[0] : null;
  return {
    stageVisible: stage ? getComputedStyle(stage).display !== 'none' : false,
    wallCount: arena ? arena.querySelectorAll('.wall').length : 0,
    charCount: arena ? arena.querySelectorAll('.char').length : 0,
    playerX: player ? player.style.left : null,
  };
}

const before = await page.evaluate(readState);

await page.keyboard.down('KeyD');
await page.waitForTimeout(800);
await page.keyboard.up('KeyD');
await page.waitForTimeout(200);

const after = await page.evaluate(readState);
await browser.close();

const checks = [
  ['stage ficou visível ao entrar em partida', before.stageVisible === true],
  ['mundo montou paredes', before.wallCount > 0],
  ['2 personagens no mundo (jogador + IA)', before.charCount === 2],
  ['jogador se moveu de verdade (não só a câmera)', parseFloat(after.playerX) > parseFloat(before.playerX)],
  ['zero erros de console/página', errors.length === 0],
];

let ok = true;
for (const [label, passed] of checks){
  console.log(`${passed ? 'OK  ' : 'FAIL'} — ${label}`);
  if (!passed) ok = false;
}
if (errors.length) console.log('Erros capturados:', JSON.stringify(errors, null, 2));

process.exit(ok ? 0 : 1);
