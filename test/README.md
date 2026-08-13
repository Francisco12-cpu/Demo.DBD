# Smoke tests

Testes automatizados via Playwright (navegador real), no mesmo espírito do
que o `CLAUDE.md` já pedia pra testar manualmente antes de dar uma mudança
como pronta — só que persistidos no repo em vez de reescritos a cada sessão.

Não são testes de unidade: sobem o jogo de verdade num Chromium headless e
conferem que os 3 modos carregam, o mundo monta, o movimento funciona e não
aparece nenhum erro de console.

## Rodar

```bash
npm install                          # instala o Playwright (só a lib)
npx playwright install chromium      # baixa o navegador (~150MB, só na 1ª vez)
cd server && npm install && cd ..    # dependência do servidor LAN (só pro smoke-online)

npx http-server . -p 8941 -s &       # serve o jogo estático (deixa rodando)

npm test                             # roda os 3 smoke tests em sequência
# ou individualmente:
node test/smoke-solo.mjs
node test/smoke-solo-killer.mjs
node test/smoke-online.mjs           # sobe e derruba o server/server.js sozinho
```

Cada script sai com código 0 (passou) ou 1 (alguma checagem falhou ou
apareceu erro de console/exceção), pra dar pra usar em CI.

## O que cada um cobre

- **smoke-solo.mjs**: modo Solo (Sobrevivente vs IA) — mundo monta,
  movimento, câmera/iluminação.
- **smoke-solo-killer.mjs**: modo Solo-como-Assassino — igual acima, mas
  jogando o Assassino, com a IA da Sobrevivente se movendo sozinha.
- **smoke-online.mjs**: modo Online LAN, 2 clientes reais (Assassino +
  Sobrevivente) — lobby, início de partida, sincronização de posição, e o
  Sentido do Assassino (único caminho de iluminação que os 2 testes solo
  não cobrem).

## O que NÃO cobre

Celular real (touch/joystick/vibração), modo P2P (`net-webrtc.js`), e
qualquer interação além de "entra na partida e anda um pouco" — captura,
geradores, pallets etc. ainda dependem de teste manual. Ver `CLAUDE.md`
pro padrão de teste manual mais completo (`page.evaluate` pra encurtar
timers antes de testar mecânicas específicas).
