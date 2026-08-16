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

  // #lobby-start fica desabilitado até todo mundo marcar "pronto" —
  // feature adicionada depois deste teste ter sido escrito originalmente
  await killerPage.click('#lobby-ready');
  await survivorPage.click('#lobby-ready');
  await killerPage.waitForTimeout(300);

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

  // BUG-010 (sair da partida/sala): o Assassino sai pelo botão de pausa —
  // o Sobrevivente que ficou precisa ver o fim de partida quase na hora
  // (evento 'leave' pulando o RECONNECT_GRACE_MS de 25s do servidor),
  // não travado esperando reconexão de uma saída que foi voluntária.
  await killerPage.click('#pause-btn');
  await killerPage.click('#pause-exit');
  await killerPage.click('#pause-exit-confirm');
  const killerBackAtMenu = await killerPage.waitForSelector('#menu-start', { state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  const survivorSawEnd = await survivorPage.waitForSelector('#menu-result', { state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  const survivorEndText = survivorSawEnd ? await survivorPage.textContent('#result-detail') : '';

  await browser.close();

  const checks = [
    ['Assassino entrou na partida', killerInMatch === true],
    ['Sobrevivente entrou na partida', survivorInMatch === true],
    ['zero erros de console/página (Assassino)', errors.killer.length === 0],
    ['zero erros de console/página (Sobrevivente)', errors.survivor.length === 0],
    ['Assassino saiu pelo botão de pausa e voltou pro menu', killerBackAtMenu],
    ['Sobrevivente viu o fim de partida na hora (sem esperar o grace period)', survivorSawEnd && survivorEndText.includes('desistência')],
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
