# QA — Horizonte Play 4.8 / Rede multiagente

## Contrato e proteção

Base: `9c4f9af` (Horizonte Play 4.7), branch `feature/horizonte-npc-multiagent-network-48`.
Missão: `HORIZONTE-MULTIAGENT-48`, documentação: [MULTIAGENT-NETWORK-48.md](MULTIAGENT-NETWORK-48.md).

## Evidência de testes

- `npm test`: **72/72 passaram**, **0 falhas**, sete casos novos em `tests/multiagent-network.test.js`.
- `npm run build`: aprovado; aviso não bloqueante de bundle > 500 kB permanece.
- E2E Chrome headless + Playwright com WebGL software: Nina e Alex iniciaram a tarefa, troca bidirecional foi exibida, o MCP respondeu, Nina começou a se mover em direção à cafeteria e o controle de desligar cancelou a missão.
- Console JavaScript: `PAGE_ERRORS=[]`.
- Verificação antes/depois do servidor local: **wallet=148** em ambos, **8 cafeterias** com os mesmos dados persistidos; nenhum pedido ou reposição.
- Painel de conversa no navegador foi testado em desktop 1440×900 e viewport móvel 390×844, sem overflow horizontal e com rolagem interna.
- No navegador E2E, a posição de UMA cafeteria foi alterada **apenas na cópia da resposta GET /api/state recebida pelo Playwright**, para reduzir a distância até Nina. Nenhuma alteração física ou comercial foi enviada ao servidor.
- A execução completa da demonstração (`arrived → demo_ready → thanks`) foi validada com relógio simulado e eventos reais do barramento nos testes unitários. O navegador headless com renderização software opera a ~1 FPS, portanto o trajeto físico completo ainda precisa de confirmação com GPU.
- O teste do gateway chamou `GET /api/shops/cafe-N/agents/stock` e comprovou que a resposta vem da ferramenta real MCP `consultar_estoque`; métodos POST e origens externas foram rejeitados.

## Riscos residuais e limites

1. **Conversa estruturada, não LLM-LLM:** falas entre NPCs são mensagens determinísticas baseadas em estado; generativa multiagente é uma etapa futura com opt-in e orçamentos de custo.
2. **Deslocamento:** Nina caminha por A*, respeitando colisões e lago; a rota completa precisa de teste manual em mapa real com GPU.
3. **Interface:** o HUD de comércio cresce com o histórico; o painel passa a ter rolagem interna para não cobrir o painel de comandos.
4. **Autonomia:** o ciclo é demonstrativo, sem escrita em estoque/caixa, sem cobrança de API, sem contas ou rede distribuída.
5. **Concorrência:** há uma missão global por vez, com cooldown, timeout e número máximo de mensagens. Expandir para muitas tarefas paralelas exige um scheduler e permissões por agente.

## Gate de revisão

Aguarda revisão do PR em rascunho, validação de desempenho GPU real e aprovação humana para qualquer merge ou deploy. `main`, v4.6 e v4.7 permanecem preservadas.
