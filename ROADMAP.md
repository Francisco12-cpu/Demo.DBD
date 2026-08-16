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
pros Sobreviventes, remapeamento de tecla, histórico de partidas. Desde
2026-08-16 (ver `BUGS.md`): dá pra sair da partida/sala a qualquer
momento (botão de pausa), Sobrevivente caído sem resgate morre sozinho
(sangramento + teto de 3 quedas — a partida sempre termina), a partida
colapsa sozinha (Assassino vence) se ninguém escapar 150s depois dos
geradores prontos, e **chão/parede/porta/pallet têm textura de verdade**
em vez de cor sólida, pela 1ª vez desde que o projeto existe — parede
com textura DIFERENTE por lado (frente com tijolo/tocha/bandeira, topo
liso pra lateral de sala), tochas acesas iluminando o mapa de verdade
(corrigiu o bug de "parede preta" que você relatou), chão variado com
decalques rachados aleatórios, e porta grande de verdade.

Publicado em: https://francisco12-cpu.github.io/Demo.DBD/ (deploy
automático a cada push na branch `main`).

## Bugs relatados

O rastreamento de verdade é `BUGS.md` (10 bugs + 7 débitos de design,
triagem completa lendo o código feita em 2026-08-16 — vários sintomas
relatados tinham causa raiz diferente da suposta, e a comparação com o
gênero na Seção 3 estava desatualizada). Resumo do que já foi corrigido
nesta rodada (ver `BUGS.md` pra causa raiz e teste de cada um):

- [x] BUG-010 — Sair da partida/sala (botão de pausa + `net.close()` de
      verdade, saída avisa os outros na hora em vez de esperar 25s)
- [x] BUG-006 — Esconderijo não travava mais o jogador pro resto da partida
- [x] BUG-001 — Sombra não aparece mais por cima de outro personagem
- [x] BUG-007 — Reviver infinito (sangramento + teto de 3 quedas)
- [x] DD-02 — Colapso de fim de partida (150s depois dos geradores prontos)
- [x] BUG-008 — Gerador abandonado agora perde progresso aos poucos
- [x] BUG-009 — Landscape trava/bloqueia de verdade + HUD respeita notch
- [x] BUG-005 (parcial) — feedback visual (ferido/pendurado) agora aparece
      certo pros Sobreviventes 2-4 no online
- [x] BUG-011 / BUG-012 — 2 bugs achados em autorrevisão (não relatados):
      queda de rede podia ser engolida por engano; menu de pausa não
      bloqueava teclado/gamepad
- [x] BUG-003 (parcial) — chão, parede (frente/topo de verdade por lado),
      porta grande, pallet e focos de luz com o tileset que você mandou,
      em vez de cor sólida (gate/gancho ainda são cor sólida)
- [x] BUG-002 — Luzes corrigidas de vez (a causa raiz real era o
      gradiente de luz nunca cobrir bem quem está na frente de uma
      parede — nada a ver com sprite faltando) + tochas estáticas
- [x] BUG-006 (completo) — Assassino agora consegue forçar a saída de um
      esconderijo ocupado (achou e corrigiu um bug de sincronização de
      rede no caminho, BUG-014 — o Assassino nunca sabia quem estava
      escondido de verdade)
- [x] 3 nomes de sprite corrigidos em `sprites_organizados/06_barris_potes/`

Pendente: BUG-004 (camada de face — pipeline igual ao tileset, precisa
de arte de face), resto do BUG-003 (gate/gancho, e o resto da folha —
banners/pilares/barris — ainda não usado), 2 peças que sobraram do
BUG-005 (estado "barricada" da porta, Assassino arrancar do esconderijo
já feito — falta só a porta), DD-04/DD-05 (interrupção/feedback),
controles de toque (zona morta, tamanho de alvo), BUG-013 (baixo risco,
aceito por ora — colapso pode ser adiado reconectando de propósito).
Achado auditando (registrado, não corrigido): `coluna_simples.png` e
`bloco_parede_escura_grande/pequeno.png` são recortes 100% vazios;
`coluna_ornamentada_1/2.png` estão cortados pela metade.

## Ideias pra próxima atualização

Itens pequenos e médios já viraram funcionalidade nesta sessão (ver
`CLAUDE.md` → "Ideias futuras" pro histórico completo, testado item por
item). O que sobra agora é maior — cada um precisa de uma decisão sua
antes de eu começar:

- **Mapa em pixel art de verdade** — **bem mais completo desde
  2026-08-16**: chão, parede (frente/topo por lado), porta, pallet e
  tochas acesas já usam o tileset organizado. Ainda faltam gate/gancho
  (continuam cor sólida) e decoração de mais peças da própria folha
  (banners, pilares, barris, potes — não usados ainda, dá pra aproveitar,
  é só decidir onde cada peça entra no mapa). Se quiser recortar mais
  peças da folha original você mesmo, cuidado: alguns arquivos em
  `sprites_organizados/05_colunas/` e `01_paredes/` (`coluna_simples`,
  `coluna_ornamentada_1/2`, `bloco_parede_escura_grande/pequeno`) saíram
  com recorte quebrado (vazios ou cortados pela metade) — não usei esses.
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
