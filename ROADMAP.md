# Roadmap — Until Dawn

Documento curto pra você (Francisco), separado do `CLAUDE.md` (que é
orientação técnica pra sessões do Claude Code) e do `README.md` (que é o
changelog completo, funcionalidade por funcionalidade). Aqui é só: onde o
jogo está agora, o que está quebrado, e o que vem a seguir.

Atualizado em 2026-08-16.

## Estado atual

Jogo completo e jogável: movimento, mapa com 3 layouts, portas/pallets/
janelas, esconderijo, geradores com skill check, captura em 3 fases
(derrubado → carregado → pendurado), portão de saída, iluminação,
áudio 3D sintetizado, sprites pixel art autorais, multiplayer LAN + P2P
com reconexão automática, lobby com escolha de papel/habilidade/"pronto",
host podendo kickar ou trocar o papel de alguém, marcador de comunicação
pros Sobreviventes, remapeamento de tecla, histórico de partidas.

Publicado em: https://francisco12-cpu.github.io/Demo.DBD/ (deploy
automático a cada push na branch `main`).

## Bugs relatados (pendente de análise)

_Nenhum registrado ainda nesta seção — assim que você colocar seu arquivo
de bugs na pasta do projeto, cada um entra aqui como um item marcado
`[ ]` até ser corrigido e testado, depois vira `[x]` com uma linha
explicando a causa e a correção._

## Ideias pra próxima atualização

Itens pequenos e médios já viraram funcionalidade nesta sessão (ver
`CLAUDE.md` → "Ideias futuras" pro histórico completo, testado item por
item). O que sobra agora é maior — cada um precisa de uma decisão sua
antes de eu começar:

- **Mapa em pixel art de verdade** — hoje as salas são `<div>`/CSS
  geradas a partir de retângulos; só os personagens têm arte sua. Pra
  virar pixel art de verdade eu precisaria de tiles desenhados por você
  (paredes, chão, decoração) — sem isso eu só teria como gerar algo
  genérico, o que não bate com o padrão do projeto de nunca usar arte
  que não seja sua.
- **Sistema de tileset customizável** — você poder subir seu próprio
  spritesheet (PNG + config de tamanho/animação) em vez do sprite fixo
  de hoje. Dá pra construir o mecanismo de upload/parsing sem esperar a
  arte pronta, mas o formato do arquivo de config precisa ser definido
  com você antes.
- **2º estágio de gancho antes da morte definitiva** — hoje é só 1
  estágio (decisão consciente de simplificação, não bug). Mudar isso é
  mudar uma mecânica já fechada, prefiro confirmar contigo antes.
- **Failover de host real no P2P** — se quem hospeda a sala fechar a
  aba, a sala cai; hoje só existe reconexão em queda curta de rede.
  Descartado por complexidade e por não dar pra testar de ponta a ponta
  no ambiente onde eu trabalho (sem saída pro broker WebRTC daqui).

**Fora de escopo por pedido seu, não reconsiderar sem perguntar de
novo:** modo "2 Assassinos" e multiplayer local (mesmo teclado/tela).

## Como testar

- **P2P (celular + celular, sem servidor):** abre o link acima nos 2
  aparelhos → um cria sala (P2P → Criar), o outro entra com o código de
  5 letras + senha.
- **LAN (celular/PC na mesma rede, com servidor local no PC):**
  `cd server && npm install && npm start`, os outros entram pelo IP
  local do PC + porta + senha.
- **Antes de qualquer entrega:** `npx http-server . -p 8941 -s` +
  `npm test` (3 suites automáticas) precisam passar limpo.
