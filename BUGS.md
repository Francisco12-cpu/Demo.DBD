# BUGS.md — Registro de Bugs, Débitos e Roadmap

> Projeto: **Assassino vs Sobreviventes** (HTML/JS, foco mobile)
> Última atualização: 2026-08-16
> Este arquivo é a fonte única de verdade sobre o que está quebrado, o que não tem regra ainda, e para onde o jogo vai.

---

## 0. Triagem (2026-08-16) — este arquivo foi escrito a partir de um teste jogado, não de leitura de código

Antes de agir em cima da lista abaixo, uma sessão de Claude Code leu o
código inteiro (não só grep) pra cada item. Resultado: vários sintomas
estão certos mas a causa raiz proposta está errada, e a Seção 3
("comparação com o gênero") está desatualizada — pallets, janelas, raio de
terror, portões de saída e gancho com fases **já existem e estão
testados**, a tabela original os marcava como ausentes. Isso teria gerado
trabalho duplicado na fase v0.4. Ver `CLAUDE.md` → "Estado atual" pro
histórico completo do que já foi implementado.

Cada bug abaixo ganhou uma nota `**Triagem:**` com a causa real encontrada
lendo o código, sem apagar o texto original (convenção do arquivo). A
Seção 3 foi corrigida na tabela em si.

---

## Como usar este arquivo

1. Todo bug encontrado em teste vira uma entrada com **ID fixo** (`BUG-000`). O ID nunca é reaproveitado.
2. Bug corrigido **não é apagado** — muda o status para 🟢 e vai para o Changelog. Histórico é o que impede repetir erro.
3. Se o problema não é "código quebrado" mas "regra que nunca foi definida", ele vai na seção **2. Débitos de Design**, não em Bugs.
4. Nenhum bug é fechado sem passar no **Critério de Aceite** escrito nele.

### Legenda

**Status:** 🔴 Aberto · 🟡 Em progresso · 🟢 Corrigido · ⚪ Backlog

**Severidade:**
| Nível | Significado |
|---|---|
| **P0** | Quebra a partida / impede jogar / trava o jogador |
| **P1** | Quebra o equilíbrio ou a regra do jogo (dá pra "apelar") |
| **P2** | Atrapalha a experiência, mas dá pra jogar |
| **P3** | Polimento, visual, conforto |

**Categoria:** `[VIS]` visual · `[SIS]` sistema/regra · `[UX]` interface/fluxo · `[REDE]` multiplayer · `[BAL]` balanceamento · `[ARQ]` arquitetura/pipeline

---

## 1. Bugs Abertos — encontrados no teste online

### BUG-001 · Sombras quebradas · 🟢 P2 `[VIS]` — corrigido 2026-08-16
- **Sintoma:** As sombras aparecem erradas — posição, tamanho ou renderização fora do esperado.
- **Esperado:** Sombra fixa e barata (blob/elipse escura embaixo de cada entidade), sempre atrás do sprite, seguindo o pé do personagem.
- **Causa provável:** Sombra sendo desenhada na mesma camada do sprite, ou tentando ser dinâmica (calculada por fonte de luz) sem necessidade.
- **Correção proposta:** Separar em camada própria (`z-index` abaixo de entidades). Sombra = elipse com opacidade fixa ancorada no pé. Nada dinâmico por enquanto.
- **Critério de aceite:** Todo personagem tem sombra ancorada nos pés, ela nunca aparece por cima de outro sprite, e o custo de render não sobe em celular fraco.
- **Triagem:** a sombra já É o blob estático pedido (`.shadow` em `css/style.css`, criado como 1º filho do `.char` em `main.js` — já fica atrás do sprite, nada dinâmico). A causa real do "por cima de outro sprite" é que `#arena` empilha só por ordem do DOM — não existe `z-index`/ordenação por Y entre personagens, então quem nasceu depois desenha por cima de quem nasceu antes, não importa a posição. Correção = 1 linha (`z-index` por Y em `character.js render()`), não refatoração de camadas.
- **Corrigido:** `character.js render()` agora seta `el.style.zIndex = Math.round(state.pos.y)`. Testado via `npm test` (3 suites, sem regressão de posicionamento visual).

---

### BUG-002 · Sistema de luzes bugado · 🔴 P2 `[VIS]`
- **Sintoma:** As luzes estão se comportando de forma errada (posição, intensidade ou sobreposição).
- **Esperado:** Iluminação simples e previsível: escuridão global + máscara de visão do jogador + focos estáticos no mapa.
- **Causa provável:** Luzes acopladas ao render das entidades em vez de existirem como uma camada de composição própria.
- **Correção proposta:** Uma única camada de luz desenhada por cima do mundo em modo de blend (`destination-out` ou `multiply`). Cada fonte de luz vira um dado (`{x, y, raio, intensidade}`), não um objeto de render solto.
- **Critério de aceite:** Adicionar/remover uma luz é mudar um item de array; a cena continua a 60fps no celular.
- **Depende de:** BUG-001 (mesma refatoração de camadas).
- **Triagem:** a arquitetura pedida já existe — `js/lighting.js` desenha num canvas próprio (`#lighting`), por cima do mundo, em `destination-out`, via raycasting. O que falta é só o array de focos estáticos no mapa (`{x,y,raio,intensidade}`) — isso é feature nova, não conserto de bug. **Bloqueado até o Francisco descrever o que exatamente viu de errado** ("posição, intensidade ou sobreposição" não é reproduzível sem mais detalhe).

---

### BUG-003 · Pipeline de arte não é "plug and play" · 🟡 P1 `[ARQ]` — chão/parede feitos 2026-08-16
- **Sintoma:** Não existe um caminho fácil para colocar sprites e pixel art no chão, nas paredes e nos objetos. Cada arte nova exige mexer no código.
- **Esperado:** Trocar/adicionar arte deve ser **só soltar um arquivo e escrever uma linha**, sem tocar na lógica do jogo.
- **Correção proposta:**
  - Criar `assets/` com subpastas: `chao/`, `parede/`, `objetos/`, `personagens/`, `faces/`.
  - Criar um manifesto central (`assets.json` ou `assets.js`) mapeando `id → caminho do arquivo`. O jogo lê o manifesto, nunca caminhos hardcoded.
  - Padronizar tamanho de tile (ex.: 32×32) e documentar isso aqui.
  - Fallback obrigatório: se a imagem não carregar, desenha um retângulo colorido com o ID escrito em cima — assim dá pra jogar mesmo sem arte pronta.
- **Critério de aceite:** Adicionar uma parede nova = colocar `parede_tijolo.png` na pasta + 1 linha no manifesto. Zero alteração em arquivo de lógica.
- **Triagem:** confirmado, real. Hoje os caminhos de sprite vivem em `Game.CONFIG.sprites` (melhor que hardcoded na lógica, mas ainda não é manifesto), e paredes/chão são `div`/CSS geradas de retângulos — não tem arte nenhuma. Maior item de escopo do arquivo inteiro; precisa da arte pronta (tiles 32×32) pra ir além do manifesto+fallback.
- **Corrigido (parcial — chão, parede, porta, pallet):** Francisco forneceu `Dungeon tileset.png` (384×192, licença livre — movido pra `assets/tiles/dungeon-tileset.png`). A folha mistura 2 formatos: tiles de 32×32 alinhados à grade (repetem bem) e props soltos SEM alinhamento de grade (achado auditando pixel a pixel com flood-fill de componentes conectados via numpy, depois de um recorte errado inicial não bater com o que aparecia visualmente — os props não seguem a grade de 32px do resto da folha).
  - **Chão/parede** (`floor-stone.png`/`wall-brick.png`): únicos 2 tiles de grade que repetem sem costura (resto da grade é decoração de uso único — pilar, altar, grade de ventilação, banner fixo). `#arena`/`.wall` usam via `background-image` repetido.
  - **"Cada lado da parede"** (pedido do Francisco): a folha não tem uma 2ª textura de parede pra variar por lado, então virou baixo-relevo por CSS — `.wall-h`/`.wall-v` (decidido pela proporção width/height do retângulo em `buildWorld()`, `js/main.js`) dão claro no topo/escuro embaixo (parede deitada) ou claro na esquerda/escuro na direita (parede em pé), via `box-shadow: inset`.
  - **Porta** (`door-arch.png`, prop solto ~17×19px, não é tile de grade): ícone de arco centralizado e não repetido em `.door`; `.door.locked` (vira parede de verdade) ganha a MESMA textura de parede, reforçando visualmente que virou parede.
  - **Pallet** (`wood-crate.png`, tile de grade, linha dos caixotes): textura de caixote de madeira tiled em `.pallet` (em pé); `.pallet.dropped` (vira parede) ganha a textura de parede, mesmo raciocínio da porta trancada.
  - Manifesto `Game.CONFIG.tiles` (`{size, floor, wall, crate, door}`, mesmo padrão de `Game.CONFIG.sprites`, não um `assets.js` separado — mantém 1 fonte de verdade só). `main.js` resolve os caminhos pra URL absoluta (achado testando: URL relativa numa CSS custom property setada via JS resolve de forma inconsistente entre navegadores — vinha 404 pedindo `css/assets/tiles/...`).
  - **Fallback de graça**: `background-color` sólido continua por baixo se a imagem não carregar — não precisou de código de fallback novo, só evitar o shorthand `background:` (que reseta a cor junto).
  - **Ainda falta**: gate/hook continuam cor sólida, BUG-004 (camada de face), fallback "retângulo com ID" pra sprite de PERSONAGEM faltando (hoje só os elementos do mapa têm fallback de graça via CSS). Resto da folha (banners, tochas, pilares, barris) documentado mas não usado — coordenadas em `assets/tiles/dungeon-tileset.png`.
  - Testado: todas as imagens carregam (`new Image()`), estrutura de paredes confere `.wall-h`/`.wall-v` corretos (38 paredes, 19/19 no layout padrão), screenshots reais conferindo chão/parede/porta/pallet/relevo visualmente; `npm test` sem regressão.

---

### BUG-004 · Face/skin personalizada sem sistema de suporte · 🔴 P2 `[ARQ]`
- **Sintoma:** Existe a ideia de colocar faces próprias nos personagens, mas o sistema não está preparado — é manual e frágil.
- **Esperado:** Camada de "face" separada do corpo do personagem, trocável por ID, igual troca de skin.
- **Correção proposta:**
  - Personagem = **corpo (spritesheet animado)** + **face (imagem estática sobreposta)**, em duas camadas.
  - Definir um ponto de âncora fixo da face no corpo, por frame de animação.
  - Registro de faces no mesmo manifesto do BUG-003 (`faces/`).
  - Tamanho e formato documentados neste arquivo para o "eu do futuro" não errar.
- **Critério de aceite:** Colocar uma face nova = adicionar PNG na pasta `faces/` + 1 linha no manifesto; ela aparece alinhada em todas as animações.
- **Depende de:** BUG-003.
- **Triagem:** confirmado, real, e depende mesmo do manifesto do BUG-003 existir primeiro.

---

### BUG-005 · Objetos interativos bugados (portas, esconderijos) · 🟡 P0 `[SIS]` — parcial, 2026-08-16
- **Sintoma:** Portas e objetos interativos respondem errado — abrem/fecham fora de hora, ou o estado do objeto não bate com o que aparece na tela.
- **Esperado:** Cada objeto interativo é uma **máquina de estados explícita**, e o visual é derivado do estado (nunca o contrário).
- **Correção proposta:** Definir para cada objeto: estados possíveis, quem pode interagir, tempo de interação, cooldown, e o que acontece se o assassino interromper.
  - **Porta:** `aberta` → `fechada` → `barricada` → `quebrada`. Barricada só é removida pelo assassino (tempo de quebra) ou consumindo o próprio recurso.
  - **Esconderijo:** `vazio` → `ocupado` → (saída voluntária | arrancado pelo assassino).
- **Critério de aceite:** Nenhuma interação pode ser disparada duas vezes no mesmo frame; o estado visual sempre bate com o estado lógico.
- **Triagem:** porta e esconderijo JÁ SÃO máquinas de estado com visual derivado do estado (`door.js`, `hideout.js`). Achei a causa real do "estado visual não bate com o lógico": `setColorOverride()` em `character.js` escreve `torso.style.filter` **inline**, e estilo inline vence as regras de CSS `.char.injured .torso`/`.char.hooked .torso`/`.hit-flash`. Como `survivorHues = [0, 70, 160, 250]`, só o Sobrevivente 1 (hue 0 → filter vazio) mostra feedback visual de ferido/pendurado/dano no online — os outros 3 não mostram nada. Correção real = trocar filter inline por variável CSS (`--hue`) que o CSS compõe junto do resto. Falta também o estado "barricada" da porta (hoje é binária) e o Assassino conseguir arrancar alguém do esconderijo.
- **Corrigido (parcial):** o conflito de filtro CSS — `setColorOverride()` agora seta `--survivor-hue` (custom property no `.char`) em vez de `torso.style.filter` direto; todo `filter` de estado (`hit-flash`/`captured`/`stunned`/`snared`/`downed`/`carried`/`hooked`/`injured`) ganhou `hue-rotate(var(--survivor-hue, 0deg))` encadeado no final — os dois `hue-rotate()` somam matematicamente (CSS já faz isso sozinho), então a cor do jogador e a cor do estado convivem em vez de uma apagar a outra. Testado isolado via `Game.createCharacter()`: filtro computado muda de verdade entre base/injured/hooked com hue != 0 (antes ficava travado em `hue-rotate(160deg)` sozinho, agora mostra a composição certa). **Ainda faltam** as 2 peças de escopo maior (estado "barricada" da porta, Assassino arrancar do esconderijo) — ficam pra quando o Francisco confirmar que quer essa profundidade extra, não são bugs, são feature gap.

---

### BUG-006 · Sobrevivente fica preso ao se proteger/esconder · 🟢 P0 `[SIS]` — corrigido 2026-08-16
- **Sintoma:** Sobrevivente que entra em esconderijo/proteção fica **preso lá para sempre**, sem saída.
- **Esperado:** Toda entrada tem saída. Nenhum estado do jogo pode ser um beco sem saída.
- **Correção proposta:**
  - Saída voluntária: mesmo botão que entrou, com pequeno tempo de animação (não instantâneo, para não virar exploit de "pisca-pisca").
  - Saída forçada: assassino arranca o sobrevivente (tempo de execução da ação).
  - **Regra global de segurança:** todo estado precisa de pelo menos uma transição de saída registrada. Estado sem saída = bug P0 automático.
- **Critério de aceite:** Não existe nenhuma sequência de ações que deixe um jogador travado sem poder agir até o fim da partida.
- **Triagem:** saída voluntária (botão de ataque), saída forçada (14s) e cooldown de reentrada já existem em `hideout.js`. Causa real achada: `hideout.state.hidden` nunca é limpo quando o jogador é derrubado enquanto escondido — o branch `captured` em `main.js` vem antes do branch do esconderijo e nunca chama `hideout.exit()`, então o timer congela com `hidden:true`. Ao ser resgatado, o jogador volta imóvel/`.hidden-in-spot` longe de qualquer esconderijo. É a mesma armadilha que já foi corrigida pro gerador engajado (`main.js`, comentário "segurança: se o Assassino derrubou o jogador ENQUANTO..."), só que o esconderijo ficou de fora dessa correção. 3 linhas.
- **Corrigido:** `hideout.exit()` adicionado no mesmo bloco `if (capture.state.captured)` que já desengaja o gerador, em `startSolo` e `startOnline` (o `startSoloAsKiller` não usa esconderijo). Testado junto com o resto de `npm test` (3 suites, sem regressão).

---

### BUG-007 · Sistema de reviver infinito e apelão · 🟢 P1 `[BAL]` `[SIS]` — corrigido 2026-08-16
- **Sintoma:** Dá para reviver/ser revivido infinitas vezes. Não existe custo, limite ou consequência — a partida nunca termina de verdade.
- **Esperado (paridade com o gênero):** Sobrevivente tem uma **economia de vida finita**, com escalada de estados.
- **Correção proposta — máquina de estados do sobrevivente:**

  ```
  SAUDÁVEL → (hit) → FERIDO → (hit) → CAÍDO → (capturado) → PRESO → MORTO
       ↑                  ↑                 ↑
    cura completa    cura parcial      resgate por outro
  ```

  - **Contador de "vezes que já caiu"** por jogador (ex.: 3 quedas = eliminação).
  - **Auto-recuperação limitada:** sozinho, o sobrevivente só levanta um número limitado de vezes na partida (ou não levanta sozinho, dependendo do balanceamento) — nunca infinito.
  - **Resgate por outro jogador:** custa tempo, e reviver alguém tem penalidade se for feito na frente do assassino.
  - **Timer de sangramento:** caído sem resgate morre depois de X segundos.
- **Critério de aceite:** Existe um caminho garantido para a partida terminar. Nenhuma combinação de ações gera vidas infinitas.
- **Triagem:** confirmado e pior do que o sintoma sugere. `capture.js` `revive()` não tem limite; não existe contador de quedas; `capture.update()` só decrementa `timeLeft` na fase *hooked* — **um Sobrevivente caído (downed) nunca morre sozinho**, fica esperando resgate pra sempre. Como `checkMatchResolution()` só resolve quando não sobra Sobrevivente "ativo", um caído esquecido trava a partida sem fim. Este bug e o DD-02 (fim de partida) são o mesmo problema — resolver junto. Números aplicados por padrão (Francisco pode ajustar): 3 quedas = eliminação, caído sangra por 60s sem resgate até eliminação, revive ganha limite/cooldown (mantido instantâneo, canalizar exigiria barra de progresso nova — registrado como possível ajuste futuro).
- **Corrigido:** `Game.CONFIG.capture.bleedOutDuration` (60s) e `maxDowns` (3). `capture.js` ganhou `state.downCount`/`state.bleedOut`: `update()` decrementa `bleedOut` só enquanto `downed` de verdade (pausa durante `carried`/`hooked`, retoma do zero a cada nova queda via `dropFree()`/`down()`) e elimina sozinho ao chegar a 0. `down()` incrementa `downCount` e, a partir da queda além de `maxDowns`, elimina direto (`resolve('eliminated','maxDowns')`) sem passar pelas fases normais — fecha o "reviver infinito" sem precisar de um 2º estágio de gancho novo. `resolve()` ganhou um 2º parâmetro `reason` ('hook'|'bleedOut'|'maxDowns'|'collapse') propagado pro callback, usado em `main.js` (`eliminationMessage()`) pra mostrar a causa certa da derrota em vez de sempre "sacrificado no gancho". Testado: 6 cenários isolados via `Game.createCapture()` direto (sangra até morrer; carregado pausa o relógio; teto de quedas elimina na hora certa; ciclo normal derrubado→pego→pendurado→resgatado continua idêntico com downCount=1; timeout de gancho ainda elimina com reason correto; soltar do carrego renova o sangramento) + `npm test` (3 suites) sem regressão.

---

### BUG-008 · Objetivos (geradores/missões) se completam sozinhos · 🟢 P0 `[SIS]` — corrigido 2026-08-16
- **Sintoma:** Os objetivos progridem "de qualquer jeito" — enchem sozinhos, sem input real e sem skill check.
- **Esperado:** Progresso só existe enquanto há input ativo **e** o skill check está sendo respeitado.
- **Correção proposta:**
  - Progresso **opt-in**: só começa quando o jogador aperta o botão de interagir, e para no instante em que solta ou se afasta.
  - **Skill check:** ponteiro girando + zona alvo. Acertou → bônus de progresso. Errou → penalidade de progresso + ruído que denuncia a posição.
  - Skill check aparece em **intervalo aleatório** enquanto o objetivo está sendo feito (não em tempo fixo — vira decoreba).
  - **Regressão:** objetivo abandonado perde progresso lentamente até um piso.
  - Estado por objetivo: `parado` → `em progresso` → `regredindo` → `concluído`.
- **Critério de aceite:** Com o dedo fora da tela, o progresso nunca sobe. Errar skill check é punido de forma perceptível.
- **Triagem:** já exige `engage()` (apertar o botão perto do gerador — só chegar perto não progride), já tem skill check em intervalo aleatório, já desengaja se o jogador andar. Dois pontos reais batem com o sintoma: (a) depois de engajar, o progresso sobe sem NENHUM input adicional enquanto o jogador fica parado no raio — é isso que parece "enche sozinho"; (b) não existe regressão — progresso abandonado nunca cai, e por padrão errar não custa progresso (só no "modo difícil" opcional). Decisão tomada: manter o modelo de engajar (não trocar pra "segurar botão" — no toque isso brigaria com o mesmo botão do skill check) e adicionar regressão real.
- **Corrigido:** `Game.CONFIG.objective.regressRate` (0.01/s, bem mais devagar que o ganho de ~0.029/s — "lentamente", como o critério de aceite pedia) e `regressFloor` (0, decai até zerar, igual ao jogo original). `objective.js` ganhou `decayIfAbandoned(delta)`, chamado em TODO objetivo (não só o engajado) a cada frame nos 3 modos — a própria função se ignora se `done`/`engaged`, então não precisa filtrar antes de chamar. Estado novo `regressing` (+ classe CSS `.objective.regressing`, borda/barra vermelha, visualmente distinto de `.active` dourado) liga/desliga sozinho; `engage()` limpa a classe na hora se o jogador reengajar antes da próxima `decayIfAbandoned` rodar (senão ficava presa ligada). Testado: 6 cenários isolados via `Game.createObjective()` direto (não decai engaged; decai a taxa certa abandonado; liga/desliga a classe certo; para no piso sem passar; reengajar limpa a classe na hora) + `npm test` sem regressão.

---

### BUG-009 · Tela não trava em modo paisagem ao entrar na partida · 🟢 P1 `[UX]` — corrigido 2026-08-16
- **Sintoma:** Ao entrar na partida, o jogador precisa girar o celular manualmente; a tela não se ajusta sozinha para jogar deitado.
- **Esperado:** Partida sempre em landscape, sem o jogador precisar pensar nisso.
- **Correção proposta:**
  - Tentar `screen.orientation.lock('landscape')` ao entrar em partida (funciona em fullscreen na maioria dos Android).
  - **Fallback obrigatório** (iOS não permite lock): se detectar portrait, mostrar overlay "Gire o celular" com ícone animado e **pausar** a entrada até girar.
  - Layout do HUD precisa ser responsivo a *safe areas* (notch, barra de gestos).
- **Critério de aceite:** Em qualquer celular, o jogador nunca entra na partida vendo o jogo cortado ou em pé.
- **Triagem:** confirmado, real. Hoje só existe um aviso dismissível (`#rotate-prompt`) que some sozinho em 6s — não existe `screen.orientation.lock()`, não existe overlay bloqueante em portrait, e `env(safe-area-inset-*)` só é usado no padding dos controles de toque (o HUD com `top/left/right:16px` ignora notch/gestos).
- **Corrigido:** `#rotate-prompt` virou overlay de tela cheia bloqueante (`position:fixed; inset:0`) em vez da faixinha dispensável — captura todo toque por baixo enquanto ativo (confirmado via `elementFromPoint` no teste). `beginMatchUi()` tenta `document.documentElement.requestFullscreen()` + `screen.orientation.lock('landscape')` (best-effort, silenciosamente ignorado onde não suportado — iOS Safari nunca suporta a API, é justamente pra isso que o overlay existe). **Escape hatch mantido** ("Jogar mesmo assim", `body.rotate-override`) — não é a permanência de antes (`localStorage`), reseta sozinho a cada partida nova; existe só pra não contradizer a própria convenção do projeto contra estado sem saída (ver BUG-006), já que detecção de orientação por CSS pode falhar em foldable/split-screen. `env(safe-area-inset-*)` somado no `#hud`/bússolas/`#touch-controls` (antes só existia no padding-bottom dos controles de toque). Testado via emulação de iPhone em portrait: overlay aparece, bloqueia toque de verdade, escape hatch funciona, e o override NÃO vaza pra próxima partida (reseta em `beginMatchUi`); `npm test` sem regressão em contexto desktop/landscape (onde o overlay nunca deveria aparecer).

---

### BUG-010 · Não existe forma de sair da partida ou da sala · 🟢 P0 `[UX]` `[REDE]` — corrigido 2026-08-16
- **Sintoma:** Depois de iniciar uma partida, não há como sair para testar outra coisa. Fica travado até o fim.
- **Esperado:** Sair é sempre possível, em qualquer estado, em no máximo dois toques.
- **Correção proposta:**
  - Botão de pausa/menu **sempre visível** no HUD (canto superior).
  - Menu de pausa: `Continuar` · `Sair da partida` · `Sair da sala`.
  - Confirmação em 1 passo para evitar toque acidental.
  - **Limpeza de estado ao sair** (o ponto mais importante e mais esquecido): destruir listeners, timers, loop de render e conexão. Sair e entrar 10 vezes seguidas não pode acumular lentidão nem duplicar entidades.
  - Se quem sair for o host: encerrar a sala para todos com aviso claro (ou migrar host, se P2P suportar).
- **Critério de aceite:** Entrar e sair de partida 10x seguidas mantém a performance idêntica à primeira vez e não deixa jogador fantasma na sala.
- **Triagem:** confirmado, real, e é o P0 mais crítico do arquivo — sem isso, dá pra testar qualquer outra correção sem recarregar a página. `net.close()` (`js/net.js`) nunca é chamado em lugar nenhum do projeto. O vazamento real ao entrar/sair não é o loop de render (já tem guardas `matchOver`/`onlineSessionId`) — é `Game.Input.init()` (`setupTouchControls` em `input.js`), chamado toda partida sem nenhuma guarda de idempotência, registrando os listeners de toque de novo a cada vez.
- **Corrigido:** botão de pausa sempre visível durante a partida (`#pause-btn`) abre um overlay com 1 passo de confirmação (`#pause-menu`) → `Continuar` / `Sair da partida`. Cada modo (`startSolo`/`startSoloAsKiller`/`startOnline`) ganhou uma função `exitMatch()` central, registrada em `activeExitMatch` e acionada por `Game.requestExitMatch()`: para o loop, desengaja gerador/esconderijo pendente, esconde a UI de partida e chama `Game.Menu.exitToStart()` (novo, em `menu.js`) — que fecha a conexão de rede (se online) e volta pro menu principal. `setupTouchControls` (`input.js`) ganhou guarda de idempotência (`touchControlsInitialized`), resolvendo o vazamento real de listeners. Saída intencional agora manda `{type:'leave'}` antes de fechar (`net.js`/`net-webrtc.js`/`server.js`), pulando o `RECONNECT_GRACE_MS` de 25s que era só pra queda de rede acidental — os outros jogadores veem a saída na hora. P2P: se quem sai é o host, todo mundo recebe `roomClosed` com aviso claro (não tem failover de host de verdade, limitação já documentada). Lobby e tela de resultado ganharam botão "Sair da sala" próprio, sem precisar estar em partida. Testado: script ad-hoc (5x entrar/sair solo via pausa sem acumular estado; cancelar não sai; sair da sala pela lobby atualiza a contagem pro outro jogador; Assassino saindo mid-match faz o Sobrevivente ver o fim de partida em <1s, não 25s) — os 2 últimos casos foram incorporados a `test/smoke-online.mjs` pra virarem cobertura permanente. `npm test` (3 suites) passa sem regressão.

---

### BUG-011 · `intentionalClose` podia travar em `true` e engolir uma queda de rede real · 🟢 P2 `[REDE]` — achado e corrigido 2026-08-16
- **Sintoma:** achado em autorrevisão do próprio código do BUG-010, não relatado em teste. Se o jogador clicasse "Sair" bem no meio de uma tentativa de reconexão automática que já tinha morrido silenciosamente (`net` apontando pra uma conexão já fechada), `net.close()` podia não disparar um novo evento `close` — e a flag `intentionalClose` (que existe pra `exitToStart()` não disparar `attemptAutoReconnect()` numa saída voluntária) ficava travada em `true` pra sempre.
- **Como reproduzir:** difícil de reproduzir manualmente (janela de alguns segundos, exige a conexão já estar morta no instante exato do clique) — achado lendo o código, não jogando.
- **Esperado:** a flag nunca fica presa; a próxima queda de rede de verdade (numa conexão totalmente nova) ainda tenta reconectar normalmente.
- **Causa provável:** `intentionalClose` só era resetado dentro do próprio handler `onClose()` — se esse handler nunca disparasse (conexão já fechada não reemite `close`), nada resetava a flag.
- **Correção aplicada:** `exitToStart()` (`menu.js`) agora agenda `setTimeout(() => intentionalClose = false, 1000)` como rede de segurança, mesmo padrão já usado no antigo `rotateAutoHideTimer` — nunca fica presa mais que 1s.
- **Critério de aceite:** uma queda de rede de verdade, mesmo depois de uma saída voluntária anterior na mesma sessão de página, ainda dispara a reconexão automática normalmente. ✅ coberto pela lógica em si (não tem teste automatizado dedicado — a janela de reprodução é pequena demais pra um teste E2E confiável).

---

### BUG-012 · Menu de pausa não bloqueava teclado/gamepad, só toque · 🟢 P2 `[UX]` — achado e corrigido 2026-08-16
- **Sintoma:** achado em autorrevisão do BUG-010. Abrir o menu de pausa mostrava o overlay (bloqueando toque de verdade, já que ele cobre a tela com `pointer-events:auto`), mas quem jogava de teclado/gamepad continuava com o personagem se movendo/atacando "às cegas" por baixo do overlay — segurar uma tecla de movimento ao abrir a pausa fazia o personagem continuar andando sem o jogador conseguir ver.
- **Como reproduzir:** segurar uma tecla de movimento (ex: D) e, ainda segurando, clicar no botão de pausa — o personagem continua andando com o menu aberto por cima.
- **Esperado:** com o menu de pausa aberto, nenhum input de jogo (movimento/ataque/habilidade) deveria ser processado, não importa a origem (teclado/toque/gamepad).
- **Causa provável:** o overlay bloqueava toque só porque é um elemento de tela cheia por cima (`pointer-events:auto`) — teclado (`window.addEventListener('keydown', ...)`) e gamepad (`navigator.getGamepads()`) não têm noção nenhuma de z-index/overlay, então continuavam sendo lidos pelo loop do jogo normalmente.
- **Correção aplicada:** `Game.Input.setPaused(bool)` (novo, `input.js`) — quando `true`, `readMovement()` retorna `{x:0,y:0}` e todo `consumeXRequest()` retorna `false` (limpando os requests pendentes de toque/gamepad, pra nada "vazar" pro frame seguinte ao despausar). `openPauseMenu()`/`closePauseMenu()` (`main.js`) chamam isso ao abrir/fechar.
- **Critério de aceite:** segurar uma tecla de movimento e abrir a pausa não move mais o personagem; fechar a pausa (Continuar) devolve o controle na hora. ✅ testado via Playwright (posição do jogador não muda com a pausa aberta segurando `KeyD`; volta a mudar depois de "Continuar").

---

### BUG-013 · Colapso (DD-02) pode ser adiado indefinidamente reconectando de propósito · ⚪ P3 `[REDE]` `[BAL]` — achado 2026-08-16, aceito por ora
- **Sintoma:** achado em autorrevisão do DD-02 (colapso de fim de partida). `collapseAt` é recalculado a partir do `performance.now()` LOCAL de cada cliente, no momento em que `checkWinFromObjectives()` roda nele — pra quem reconecta (`resumeData` → `checkWinFromObjectives()`), isso significa um prazo de colapso NOVO, contado a partir da hora da reconexão, não da hora real em que os geradores terminaram.
- **Como reproduzir:** um Sobrevivente desconecta de propósito perto do colapso e reconecta — ganha mais `collapseDuration` (150s) inteiros de prazo, só pra ele, podendo repetir.
- **Esperado (se for corrigir):** o prazo de colapso seria o mesmo, sincronizado, pra todo mundo, não importa quando cada um conectou.
- **Por que não foi corrigido agora:** exigiria sincronizar um timestamp absoluto de colapso pela rede (mais superfície de protocolo) pra fechar um exploit que exige o jogador deliberadamente desconectar/reconectar repetidas vezes — não afeta os OUTROS jogadores (cada um decide sua própria eliminação por colapso de forma independente, então os demais são eliminados no prazo certo mesmo que esse aqui não seja). Consistente com o modelo de confiança já aceito no projeto (client-authoritative, pensado pra jogar com amigos, não anti-cheat de verdade — ver DD-06 no BUGS.md e a arquitetura documentada no CLAUDE.md).
- **Critério de aceite (se decidir corrigir no futuro):** o servidor/host guardaria um `collapseDeadline` absoluto (timestamp de servidor) e mandaria pra quem conecta/reconecta via `matchStart`/`matchResume`, em vez de cada cliente calcular o próprio.

---

## 2. Débitos de Design — sistemas sem regra definida

> Não são bugs de código: são regras que **nunca foram escritas**. É daqui que nasce a maior parte da sensação de "apelão".

| ID | Sistema | Problema | Regra que precisa existir |
|---|---|---|---|
| **DD-01** | Condição de vitória | Não está claro como assassino ou sobreviventes vencem de fato | Sobreviventes: concluir X objetivos → abrir saída → escapar. Assassino: eliminar todos antes disso |
| **DD-02** | Fim de partida | Partida pode se arrastar para sempre | Timer global ou colapso de fim de jogo (quando a saída abre, começa contagem regressiva) |
| **DD-03** | Recursos finitos | Barricar/curar/esconder parecem ilimitados | Todo recurso tem contador, cooldown ou custo. Nada é infinito |
| **DD-04** | Interrupção | Ações podem ser feitas na cara do assassino sem risco | Toda ação longa é cancelável por dano e tem tempo de "vulnerabilidade" |
| **DD-05** | Informação | Jogador não sabe o que está acontecendo | Feedback obrigatório: som de coração por proximidade, ícone de estado dos aliados, contador de objetivos |
| **DD-06** | Autoridade de estado | Em rede, quem decide o que é verdade? | Host é autoridade. Cliente prevê, host confirma. Sem isso, o multiplayer vira brecha de trapaça |
| **DD-07** | Anti-camp / anti-tunnel | Assassino pode ficar em cima do capturado | Penalidade ou aceleração de barra quando o assassino não se afasta |

**Triagem por item:**
- **DD-01** — já implementada e testada (geradores→portão→escapar / Assassino elimina todos). Faltava só documentar a regra por escrito, não codar.
- **DD-02** — mesmo problema de fundo do BUG-007 (caído não morre sozinho). **Corrigido em 2026-08-16**: `Game.CONFIG.match.collapseDuration` (150s) — quando `gatesActive` vira `true` (geradores prontos), começa uma contagem regressiva; quem ainda está ativo (livre ou capturado, em qualquer fase) quando ela zera é eliminado. Modo solo: cada `startSolo`/`startSoloAsKiller` guarda seu próprio `collapseAt` e checa no início do `loop()`. Modo online: cada Sobrevivente decide por si (client-authoritative de sempre) via `capture.forceEliminate()` (novo em `capture.js`) e reaproveita o evento `struggleResult`/`eliminated` que já existe — sem precisar de `kind` novo no protocolo, e já compatível com `eliminatedIds` no reconnect. Corrigido de graça um bug latente descoberto no caminho: reconectar depois que os geradores já tinham terminado deixava `gatesActive`/`collapseAt` zerados nesse cliente (o `checkWinFromObjectives()` só rodava reativo a um evento `objectiveDone` que não vem mais depois que todos já terminaram) — `resumeData` agora chama `checkWinFromObjectives()` uma vez ao reconectar. Testado: partida solo real (gerador único num spot de campo aberto, andado de verdade) completando e o colapso encerrando a partida sozinho (Assassino vence) sem nenhuma ação do jogador; `npm test` sem regressão.
- **DD-03** — habilidades já têm usos/cooldown, esconderijo já tem duração máxima + cooldown de reentrada. O que é infinito de verdade é reviver (BUG-007) e curar sozinho parado (`health.js`, sem limite de vezes).
- **DD-05** — batimento por proximidade, bússola do Assassino, bússola de objetivo, contador de geradores e badge numerado por Sobrevivente já existem. O buraco real é ver o estado dos aliados (ferido/caído/pendurado) à distância — piorado pelo bug do filtro inline achado no BUG-005.
- **DD-06** — **contradiz a arquitetura atual do projeto** (client-authoritative por evento discreto, decisão registrada no `CLAUDE.md`, atravessa `server.js`/`net-webrtc.js`/todos os handlers de `main.js`). Migrar é reescrever o multiplayer inteiro; só compensa se for jogar com desconhecidos, não com amigos. **Não mexer sem pedido explícito.**

---

## 3. Comparação com o gênero (referência: Dead by Daylight)

> **Corrigido na triagem de 2026-08-16** — a tabela original foi escrita a
> partir da primeira impressão de teste e estava desatualizada; a maioria
> das mecânicas listadas como "Ausente"/"Planejado" já existe e está
> testada (ver `CLAUDE.md` → "Estado atual"). Mantida a estrutura original,
> só a coluna "Estado atual" foi corrigida pra bater com o código real.

| Mecânica de referência | Estado atual | Risco se ficar como está |
|---|---|---|
| Estados de saúde progressivos | Existe (saudável→ferido→caído), mas caído não morre sozinho | 🔴 Partida sem fim (BUG-007) |
| Gancho / captura com escalada de fases | **Feito** — downed→carried→hooked, resgate, wiggle | — |
| Geradores com skill check e regressão | Skill check existe; falta regressão de progresso abandonado | 🟠 Objetivo sem desafio pleno (BUG-008) |
| Portões de saída + escotilha (última chance) | Portão de saída **feito**; escotilha/última chance ainda não existe | 🟠 Falta clímax final quando restam poucos vivos |
| Raio de terror / som por proximidade | **Feito** — batimento cardíaco, bússola do Assassino, ruído por raio de audição | — |
| Palletes e janelas (loop de perseguição) | **Feito** — pallet derruba/atordoa/quebra, janela muda velocidade | — |
| Aura / leitura de informação | Parcial — bússola de objetivo, badge por Sobrevivente, marcador de ping; falta ver estado dos aliados à distância | 🟠 Time ainda joga um pouco separado |
| Progressão de partida perceptível | Parcial — contador de objetivos existe; falta indicador de fase final/tensão crescente | 🟠 Pouco senso de escalada |

**Leitura de arquiteto (revisada):** o loop de perseguição (pallets/janelas) **já está implementado e testado**, não é mais o item crítico. O que falta de verdade nessa tabela é: caído que nunca morre sozinho (BUG-007), regressão de objetivo (BUG-008), e a escotilha/última chance como clímax de fim de partida (fica pra v0.4, depois do essencial).

---

## 4. Roadmap

### v0.1 — Estabilidade (a partida precisa terminar)
- [x] BUG-010 — Sair da partida/sala + limpeza de estado (2026-08-16)
- [x] BUG-006 — Nenhum estado sem saída (2026-08-16, esconderijo; gerador engajado já cobria antes)
- [x] BUG-008 — Objetivo só progride com input + skill check + regressão (2026-08-16)
- [x] BUG-007 — Economia de vida finita (2026-08-16: sangramento + teto de quedas)
- [x] DD-01 — já era verdade, só faltava documentar (ver Seção 2)
- [x] DD-02 — Colapso de fim de partida (2026-08-16, junto com BUG-007)

### v0.2 — Jogabilidade mobile
- [x] BUG-009 — Landscape trava/bloqueia de verdade + safe-area no HUD (2026-08-16)
- [x] BUG-005 — Parcial (2026-08-16: filtro CSS corrigido); falta estado "barricada" da porta e Assassino arrancar do esconderijo
- [ ] DD-04 / DD-05 — Interrupção e feedback ao jogador
- [ ] Controles de toque revisados (zona morta, tamanho de botão para dedo)

### v0.3 — Pipeline de arte
- [x] BUG-003 (parcial) — Chão/parede com tileset de verdade (2026-08-16); objetos do mapa (porta/pallet/gate) ainda cor sólida
- [ ] BUG-004 — Camada de face personalizada
- [x] BUG-001 / [ ] BUG-002 — Sombra corrigida (Fase 1); luz ainda bloqueada

### v0.4 — Profundidade e equilíbrio
- [ ] Palletes / janelas / loop de perseguição
- [ ] Saída final + última chance
- [ ] DD-07 — Anti-camp
- [ ] Passe de balanceamento com dados de partidas reais

### v1.0 — "Mandar pros amigos"
- [ ] Link direto que abre e joga, sem instalação
- [ ] Entrar na sala por código curto
- [ ] Tutorial de 30 segundos
- [ ] Testado em pelo menos 3 celulares diferentes (Android antigo incluso)

---

## 5. Template para novos bugs

```markdown
### BUG-0XX · <título curto> · 🔴 P? `[CAT]`
- **Sintoma:** o que aconteceu na prática
- **Como reproduzir:** 1. ... 2. ... 3. ...
- **Esperado:** o que deveria acontecer
- **Causa provável:** hipótese técnica
- **Correção proposta:** o que fazer
- **Critério de aceite:** como saber que foi resolvido de verdade
- **Depende de:** BUG-0XX (se houver)
```

---

## 6. Changelog

| Data | Versão | Mudança |
|---|---|---|
| 2026-08-16 | — | Criação do arquivo. 10 bugs e 7 débitos de design registrados a partir do primeiro teste online. |
| 2026-08-16 | — | Triagem completa (Seção 0): causa raiz revisada lendo o código de cada bug; Seção 3 corrigida (pallets/janelas/portões/raio de terror já existiam, tabela estava desatualizada). |
| 2026-08-16 | — | BUG-010, BUG-006 e BUG-001 corrigidos e testados (ver cada entrada). Fase 1 do roadmap de correção concluída. |
| 2026-08-16 | — | BUG-007 e DD-02 corrigidos e testados (ver cada entrada) — economia de vida finita (sangramento + teto de quedas) e colapso de fim de partida. Fase 3 do roadmap de correção concluída (Fase 2 já tinha sido coberta pela correção do BUG-006 na Fase 1). |
| 2026-08-16 | — | BUG-008 (regressão de progresso do gerador), BUG-009 (landscape trava/bloqueia de verdade + safe-area) e BUG-005 parcial (filtro CSS que apagava feedback visual dos Sobreviventes 2-4) corrigidos e testados. Fases 4-6 do roadmap de correção concluídas — só falta pipeline de arte (v0.3) e profundidade/equilíbrio (v0.4). |
| 2026-08-16 | — | Autorrevisão do código desta sessão + auditoria fresca em arquivos não lidos ainda (pallet.js, window.js, ability.js, sw.js, resto de menu.js). 2 bugs novos achados e corrigidos: BUG-011 (`intentionalClose` podia travar em `true`) e BUG-012 (menu de pausa não bloqueava teclado/gamepad). 1 achado de baixo risco registrado e aceito por ora sem correção: BUG-013 (colapso pode ser adiado reconectando de propósito). |
| 2026-08-16 | — | BUG-003 (parcial): Francisco forneceu um tileset de mapa (`assets/tiles/dungeon-tileset.png`) — chão e paredes ganharam textura de verdade pela 1ª vez (antes eram cor sólida), via novo manifesto `Game.CONFIG.tiles`. Testado (imagens carregam, screenshot conferido, sem regressão). |
| 2026-08-16 | — | BUG-003 expandido: porta (ícone de arco), pallet (caixote de madeira) e baixo-relevo por lado da parede (`.wall-h`/`.wall-v`, pedido explícito do Francisco) — mesmo tileset, mais peças usadas. Testado com screenshots reais de cada elemento. |

---

## 7. Convenções do projeto

- **Nada de estado implícito.** Se um objeto tem comportamento, ele tem uma máquina de estados escrita.
- **Nada infinito.** Todo recurso tem limite, custo ou cooldown.
- **Todo estado tem saída.** Estado sem transição de saída é bug P0.
- **Arte é dado, não código.** Nenhum caminho de imagem hardcoded na lógica.
- **Host é a autoridade.** Cliente nunca decide dano, progresso ou morte sozinho.
- **Testar no celular mais fraco que existir**, não no melhor.
