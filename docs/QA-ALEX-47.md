# QA — Horizonte Play 4.7 / Alex NPC físico

## Evidências automatizadas

- `npm test`: **65 testes**, **65 aprovados**, **0 falhas** (incluindo 6 cenários novos do cérebro NPC 3D).
- `npm run build`: **exit code 0**, Vite compila os módulos do NPC 3D. Há aviso de bundle maior que 500 kB, sem bloquear a build.
- `git diff --check`: sem divergência de whitespace.
- Testes novos em `tests/commerce-attendant-3d.test.js` verificam: rotina no perímetro interno, cumprimento uma vez por visita, saudação a Nina, transição de conversa/pedido, isolamento por loja e entrada inválida.

## Validação navegador

- Chrome com WebGL software e Playwright: 3D inicia; cafeteria próxima (simulada somente em resposta de rede de teste) recebe um Alex.
- Snapshot no navegador: `shopId=cafe-1`, `nearPlayer=true`, mensagem `Bem-vindo! ☕`.
- Abrir balcão por botão: `activity=Conversando com o jogador`, `walking=false`, mensagem `Olá! Posso ajudar?`.
- Pergunta sobre preço mantém conversa e muda balão para `Pode falar!`.
- Escape fecha o modal, muda balão para `Até logo!`.
- `PAGE_ERRORS=[]` e `BROWSER_OK`; nenhum débito de moedas ou alteração do estoque foi solicitado no teste.
- Imagens temporárias capturadas localmente sob `PREVIA-ALEX-3D-47.png` e `PREVIA-ALEX-3D-MOBILE-47.png`; não entram no Git.

## Qualificações

- A cafeteria de teste foi reposicionada **somente na cópia da resposta GET /api/state recebida pelo navegador**; servidor e localização persistida não foram modificados.
- O Chrome em modo headless/software renderizou aproximadamente 1 FPS. Animação real/fps precisa de inspeção no navegador com GPU do usuário. O comportamento de deslocamento foi comprovado em teste unitário de simulação.
- O primeiro teste E2E falhou por checar animação antes do próximo frame; foi corrigido para aguardar `interacting=true` e passou.
- O rig permanece atrás do balcão, podendo ficar oculto por paredes em determinados ângulos. A mensagem de saudação foi elevada acima do telhado para facilitar a descoberta visual.
- Sem chamadas pagas Gemini e sem compras em dados reais do jogo.
- Não houve deploy, merge ou alteração na `main` durante esta fase.

## Gates de revisão

- Verificação manual de qualidade gráfica e FPS nas configurações Equilibrado / Alto / Ultra.
- Confirmar em jogo a leitura do balão acima do telhado e a presença do atendente quando visto pela entrada.
- Revisar PR da v4.7 em branch empilhada sobre a v4.6 antes de qualquer promoção.
