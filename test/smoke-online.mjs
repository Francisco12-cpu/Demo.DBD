// Smoke test do modo Online (LAN) com 2 clientes reais (Assassino +
// Sobrevivente) — sobe o próprio servidor de sala (server/server.js) como
// processo filho, então não precisa de nada rodando de antemão além do
// http-server estático.
//
// Pré-requisito: `npx http-server . -p 8941` rodando (ver README.md).
// Rodar: node test/smoke-online.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8941';
const SERVER_PORT = process.env.TEST_SERVER_PORT || '8794';
const SERVER_PASSWORD = 'smoketest123';

const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..', 'server'),
  env: { ...process.env, PORT: SERVER_PORT, ROOM_PASSWORD: SERVER_PASSWORD },
  stdio: 'pipe',
});
let serverLog = '';
serverProc.stdout.on('data', (d) => { serverLog += d.toString(); });
serverProc.stderr.on('data', (d) => { serverLog += d.toString(); });

function stopServer(){
  serverProc.kill();
}

// dá um tempinho pro WebSocketServer bindar a porta antes de conectar
await new Promise((r) => setTimeout(r, 800));

const errors = { killer: [], survivor: [] };
const browser = await chromium.launch();

async function makeCtx(label){
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') errors[label].push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors[label].push(`[pageerror] ${err.message}`));
  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForTimeout(300);
  return page;
}

async function joinLan(page, name){
  await page.fill('#menu-name', name);
  await page.click('#menu-lan');
  await page.waitForTimeout(200);
  await page.fill('#join-host', 'localhost');
  await page.fill('#join-port', SERVER_PORT);
  await page.fill('#join-password', SERVER_PASSWORD);
  await page.click('#join-connect');
  await page.waitForTimeout(700);
}

function inMatch(){
  return getComputedStyle(document.getElementById('stage')).display !== 'none';
}

let ok = true;
try {
  const killerPage = await makeCtx('killer');
  const survivorPage = await makeCtx('survivor');

  await joinLan(killerPage, 'SmokeKiller');
  await joinLan(survivorPage, 'SmokeSurvivor');

  await killerPage.click('#lobby-be-killer');
  await killerPage.waitForTimeout(200);
  await survivorPage.click('#lobby-be-survivor');
  await survivorPage.waitForTimeout(200);

  await killerPage.click('#lobby-start');
  await killerPage.waitForTimeout(1000);
  await survivorPage.waitForTimeout(1000);

  const killerInMatch = await killerPage.evaluate(inMatch);
  const survivorInMatch = await survivorPage.evaluate(inMatch);

  // movimento + Sentido (KeyE) — exercita a sincronização de posição e o
  // caminho revealAll da iluminação (js/lighting.js)
  await killerPage.keyboard.down('KeyD');
  await survivorPage.keyboard.down('KeyA');
  await killerPage.waitForTimeout(700);
  await survivorPage.waitForTimeout(700);
  await killerPage.keyboard.up('KeyD');
  await survivorPage.keyboard.up('KeyA');
  await killerPage.keyboard.press('KeyE');
  await killerPage.waitForTimeout(300);

  await browser.close();

  const checks = [
    ['Assassino entrou na partida', killerInMatch === true],
    ['Sobrevivente entrou na partida', survivorInMatch === true],
    ['zero erros de console/página (Assassino)', errors.killer.length === 0],
    ['zero erros de console/página (Sobrevivente)', errors.survivor.length === 0],
  ];
  for (const [label, passed] of checks){
    console.log(`${passed ? 'OK  ' : 'FAIL'} — ${label}`);
    if (!passed) ok = false;
  }
  if (errors.killer.length) console.log('Erros (Assassino):', JSON.stringify(errors.killer, null, 2));
  if (errors.survivor.length) console.log('Erros (Sobrevivente):', JSON.stringify(errors.survivor, null, 2));
} catch (err){
  ok = false;
  console.log('FAIL — exceção durante o teste:', err.message);
  console.log('Log do servidor até aqui:', serverLog);
} finally {
  stopServer();
}

process.exit(ok ? 0 : 1);
