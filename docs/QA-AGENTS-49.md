# QA — Horizonte Play 4.9: diálogos Gemini e memória durável

## Evidências
- Origem da 4.8 preservada no commit `fe8e15d`.
- `npm test`: **79/79 aprovados**, 0 falhas, com 7 testes novos em `agent-memory-ai.test.js`.
- `npm run build`: concluído com êxito. O aviso de bundle >500 kB permanece não bloqueante.
- REST Commerce e ponte Gemini foram reiniciados na mesma máquina, nas portas 4180 e 4174, e responderam a `/health`.
- Gemini configurado na ponte local: **sim**; a chave não foi exibida e não foi incluída em arquivo de código.
- Consulta a `GET /api/agents/memory?shopId=cafe-1`: Nina 0 e Alex 0 registros antes dos testes de demonstração. A gravação/releitura foi comprovada com arquivos temporários isolados no teste automatizado.
- O orçamento persistente em disco foi testado com reinício de instância, janelas de 10 minutos e 24 horas; não é orçamento financeiro garantido na conta do provedor.
- O endpoint de geração foi testado com respostas de Gemini simuladas, incluindo envio de memória anterior ao modelo, limite de requisições, rejeição de origem externa e proteção da chave.
- O Commerce foi testado com geração mockada, persistência de falas e missões, sem criar pedidos nem afetar saldo.
- Rede no navegador: **Gemini desmarcado por padrão** e **0 chamadas reais** de geração. Ao marcar opção com rota HTTP interceptada pelo Playwright, ocorreram 4 trocas Nina ⇄ Alex com texto simulado de API e andamento da missão.
- Viewports: desktop 1440×900 e celular 390×844 sem transbordamento horizontal. `PAGE_ERRORS=[]`.
- Estado real do comércio antes/depois do navegador: **wallet=148, lojas=8**, com dados idênticos.
- Capturas locais excluídas do commit: `PREVIA-GEMINI-MEMORIA-49.png`, `PREVIA-GEMINI-MEMORIA-MOBILE-49.png`.

## Restrições e pendências
1. **Não foi feita uma chamada real faturável à API Gemini.** A integração está preparada, e sua primeira ativação real depende do usuário marcar o botão no jogo.
2. Os textos gerados não podem comandar ferramentas, comprar produtos ou alterar estoque.
3. Memória persistente por agente é local no perfil Windows, com 30 registros e sem criptografia adicional (arquivos de memória não guardam a chave).
4. Conclusão física de rota A* com GPU real, FPS de hardware e condições de mundo com muitas lojas continuam como inspeção manual.
5. O mecanismo mantém uma tarefa global por vez e quatro falas geradas no máximo por missão. A expansão para múltiplas tarefas paralelas requer scheduler e revisão de governança.
6. Nenhum merge na main ou deploy feito; a versão deve ser revisada em PR empilhado.
