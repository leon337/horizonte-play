# Horizonte Play — Evidências de QA da versão experimental 4.6

## Contrato da fase
- **Missão:** HORIZONTE-PLAY-ALEX-UX-46
- **Objetivo:** verificar a experiência do atendente Alex e melhorar o acesso à conversa, preservando a versão atual e a economia fictícia.
- **Escopo:** UX do balcão, navegação por abas, perguntas específicas de preço, guarda de intenção Gemini, testes e documentação.
- **Fora do escopo:** contas, multiplayer, pagamentos reais, deploy público, merge em `main` e consumo deliberado de API paga.
- **Classe:** B (alteração funcional reversível em branch isolada).
- **Critérios:** teste visual desktop/móvel, nenhum débito sem confirmação, testes automatizados e build aprovados.
- **Execução:** MESTRE com ferramentas do computador; não há alegação de subagentes cognitivos independentes.

## Evidência de implementação
- Base preservada: `2c25ac1` (Horizonte Play 4.5).
- Código: `index.html`, `src/commerce-client.js`, `src/style.css`, `server/commerce-attendant.mjs`.
- Novos testes: `tests/commerce-attendant.test.js`.
- `npm test`: **59 testes aprovados, 0 falhas**.
- `npm run build`: **exit code 0**, aviso de chunks maiores que 500 kB herdado do bundling atual, sem erro de compilação.
- `git diff --check`: **exit code 0**.

## Evidência de interação no navegador
Chrome local via Playwright, com WebGL por software, Vite na porta 5173, MCP Commerce na porta 4180:
- ✅ Canvas WebGL inicializado e jogo entrando no modo de exploração.
- ✅ Janela de atendimento aberta com cafeteria válida.
- ✅ Abas `Conversar com Alex` e `Compra rápida` alternando por clique e seta do teclado.
- ✅ Pergunta "Quanto custa um café?" respondeu o preço de 8 moedas sem propor compra.
- ✅ Mensagem "Quero dois cafés" gerou orçamento de 16 moedas e botão de confirmação.
- ✅ Modal fechou com Escape.
- ✅ Desktop 1440×900 sem overflow horizontal.
- ✅ Celular em viewport 390×844 sem overflow horizontal.
- ✅ Sem erros de JavaScript no teste.

As capturas `PREVIA-ALEX-COMMERCE-46.png`, `PREVIA-ALEX-PEDIDO-46.png` e
`PREVIA-ALEX-MOBILE-46.png` foram salvas **localmente fora do Git**.

**Limite do teste:** o navegador recebeu uma cópia temporária da resposta de `GET /api/state`
com uma cafeteria movida para perto do personagem; **o servidor não sofreu escrita**.
A navegação a pé até uma cafeteria na posição original foi inconclusiva porque o Chrome
headless com WebGL via software entregou aproximadamente 1–2 FPS. FPS na GPU real
ainda requer inspeção manual no computador do usuário.

## Segurança e rollback
- O Gemini real não foi acionado no teste (não houve API paga para esse QA).
- O usuário precisa marcar a opção Gemini no próprio jogo; sem isso o atendimento é local.
- Chat não executa pedido diretamente; confirmação é ação separada, com token temporário.
- Testes cobrem confirmação única, saldos e estoque, pedidos simultâneos e divergência da IA.
- O código permanece em branch de feature, sem mudança da `main`.
- Rollback: voltar à branch `feature/horizonte-lojas-mcp-mvp` ou ao commit `2c25ac1`.
