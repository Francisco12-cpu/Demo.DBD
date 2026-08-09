# Bibliotecas de terceiros

## PeerJS (`peerjs.min.js`)
- Versão: 1.5.5
- Licença: MIT
- Repositório: https://github.com/peers/peerjs
- Usada só no modo "Multiplayer P2P" (`js/net-webrtc.js`), pra abrir conexões
  WebRTC direto entre navegadores sem precisar de servidor próprio rodando
  o relay — só usa o broker público gratuito da PeerJS pra fazer a conexão
  inicial entre os jogadores.

## qrcode-generator (`qrcode.min.js`)
- Versão: 2.0.4
- Licença: MIT
- Repositório: https://github.com/kazuhikoarase/qrcode-generator
- Usada só pra desenhar o QR code do código da sala P2P (`js/menu.js`), pra
  não precisar digitar o código manualmente.
