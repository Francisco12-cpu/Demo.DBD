// Smoke test do modo Solo-como-Assassino (jogador persegue, IA Sobrevivente
// foge e repara sozinha). Ver test/smoke-solo.mjs pro caso espelhado.
//
// Pré-requisito: `npx http-server . -p 8941` rodando (ver README.md).
// Rodar: node test/smoke-solo-killer.mjs
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8941';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(`${BASE_URL}/index.html`);
await page.waitForTimeout(400);
await page.fill('#menu-name', 'SmokeTestKiller');
await page.click('#menu-solo-killer');
await page.waitForTimeout(300);

function readPositions(){
  const arena = document.getElementById('arena');
  const chars = arena ? [...arena.querySelectorAll('.char')] : [];
  return chars.map((c) => ({ x: parseFloat(c.style.left), y: parseFloat(c.style.top) }));
}

const before = await page.evaluate(readPositions);

await page.keyboard.down('KeyD');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyD');
await page.waitForTimeout(500);

const after = await page.evaluate(readPositions);
await browser.close();

const playerMoved = before[0] && after[0] && Math.abs(after[0].x - before[0].x) > 5;
// a IA da Sobrevivente deve se mover sozinha atrás de gerador, sem nenhum
// input do "jogador" nela — confirma que updateSurvivorAI (e o helper
// nearestIncompleteObjective) está funcionando
const aiMoved = before[1] && after[1] && Math.hypot(after[1].x - before[1].x, after[1].y - before[1].y) > 5;

const checks = [
  ['2 personagens no mundo (Assassino + IA)', before.length === 2],
  ['jogador (Assassino) se moveu', playerMoved],
  ['IA da Sobrevivente se moveu sozinha', aiMoved],
  ['zero erros de console/página', errors.length === 0],
];

let ok = true;
for (const [label, passed] of checks){
  console.log(`${passed ? 'OK  ' : 'FAIL'} — ${label}`);
  if (!passed) ok = false;
}
if (errors.length) console.log('Erros capturados:', JSON.stringify(errors, null, 2));

process.exit(ok ? 0 : 1);
