# Horizonte Play 4.8 — Rede multiagente Nina ⇄ Alex

## Contrato de missão

- **ID:** HORIZONTE-MULTIAGENT-48
- **Objetivo:** permitir que agentes NPCs troquem mensagens em dois sentidos, se coordenem e concluam tarefas comuns dentro do mundo.
- **Base:** Horizonte Play 4.7, `9c4f9af`, branch `feature/horizonte-alex-npc-3d-47`.
- **Escopo:** agente Nina, um Alex por cafeteria, barramento local de mensagens tipadas, missão colaborativa de demonstração, consulta MCP real somente leitura, HUD de conversas e testes.
- **Fora do escopo:** conversas livres entre modelos de linguagem, compra NPC persistente, recarga automática de estoque, pagamentos, multiplayer, serviços externos ou rede distribuída entre computadores.
- **Risco:** B, reversível em branch de feature; nenhuma autorização para alterar estoque ou moedas automaticamente.
- **Critérios de aceite:** comunicação Nina → Alex e Alex → Nina, IDs/correlação por missão, Nina usa navegação segura, consulta o MCP, concluem demonstração em parceria, controles de interrupção, ausência de escrita comercial, testes e build aprovados.
- **Autoridade final:** Leandro. PR em rascunho e sem merge/deploy.

## Arquitetura implementada

```text
NINA (cérebro / rota A*)
   │  inventory_request, demo_request, arrived, thanks
   ▼
REDE MULTIAGENTE (orquestração local em memória)
   • registro de agentes: nina / alex:cafe-N
   • envelope: id, taskId, from, to, kind, at, text
   • tarefas, timeout, limite de 14 mensagens, histórico de 40 eventos
   │                                  ▲
   │ inventory_report, demo_accept, demo_ready
   ▼                                  │
ALEX (um por cafeteria) ──────────────┘
   │
   └── Gateway GET /api/shops/:id/agents/stock
          └── MCP consultar_estoque (leitura real, same-process)
                 └── DOMÍNIO DO COMÉRCIO (fonte de estoque)
```

O endpoint `/agents/stock` aceita somente GET, origem local autorizada e executa a ferramenta MCP `consultar_estoque`, que é declarada somente leitura. Nenhum agente recebe acesso à ferramenta `registrar_pedido` ou `repor_estoque`. A chave Gemini permanece na ponte local já existente, mas a colaboração não consome Gemini.

## Ciclo concreto — colaboração

1. Com a opção **Rede multiagente** ativa, Nina escolhe uma cafeteria acessível a até 35 metros e assume a missão.
2. Nina envia `inventory_request` a Alex com `taskId` rastreável.
3. Alex consulta o MCP real por GET e devolve `inventory_report` com produtos disponíveis.
4. Nina seleciona um produto disponível e propõe um **pedido demonstrativo**, não uma compra.
5. Alex responde `demo_accept` e Nina caminha até um ponto seguro em frente à loja usando navegação A* já existente.
6. Ao chegar, Nina envia `arrived`. Alex simula a preparação durante 3,5 segundos de tempo de jogo, respondendo `demo_ready`.
7. Nina envia `thanks`, encerrando a missão. Alex mostra a animação de demonstração e os NPCs retomam a rotina.

**Importante:** essa é uma rede de agentes locais com comunicação bidirecional estruturada e tarefas reais de coordenação. Ainda não é um diálogo livre gerado por dois modelos de linguagem. As falas são controladas, auditáveis e livres de custos de API.

## Segurança, controle e limites

- Concluída uma missão, a próxima só é iniciada após aproximadamente 90 segundos de tempo ativo de jogo.
- Máximo de 14 mensagens por missão; histórico limitado a 40 eventos (20 no snapshot, 9 mensagens visíveis no HUD).
- Uma missão ativa por vez, com expiração em 75 segundos de tempo de jogo.
- O botão de desligar rede cancela a missão; conversar com Nina tem prioridade e interrompe sua colaboração.
- Sem saldo, pagamento, retirada de estoque ou alteração persistida no jogo durante a missão.
- Consultas falhadas e estoque vazio geram falhas explícitas, sem inventar sucesso.
- Devido à arquitetura do jogo, agentes e mensagens ficam no navegador (um jogador); reiniciar a sessão reinicia as tarefas e histórico.
- A automação visual em Chrome headless usa renderização WebGL por software. Desempenho e conclusão física no hardware real requerem validação manual.

## Arquivos

- `src/multiagent-network.js`: barramento e coordenador de tarefas.
- `src/npc.js`: Nina assume o objetivo colaborativo e caminha até ponto de atendimento.
- `src/commerce-client.js`: integra rede, ferramentas, HUD e eventos.
- `src/commerce-attendant-brain.js`: reação visual de conclusão demonstrativa.
- `server/commerce-mcp.mjs`: endpoint HTTP protegido, delega leitura para ferramenta MCP.
- `tests/multiagent-network.test.js`: testes da coordenação, mensagens, falhas e segurança.
- `docs/QA-MULTIAGENT-48.md`: evidências das verificações.

## Expansões previstas

Próximo ciclo: tarefas variadas (limpeza, reposição proposta para aprovação humana, entregas fictícias), troca de mensagens entre mais moradores, memória de equipe por estabelecimento e política de permissões escalável. Conversa gerativa entre NPCs por Gemini poderá ser um recurso **explicitamente opcional e limitado em custo**; nenhuma ação do mundo deve ser executada com base apenas em texto de modelo.
