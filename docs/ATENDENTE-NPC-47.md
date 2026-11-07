# Horizonte Play 4.7 — Alex NPC 3D autônomo na cafeteria

## Contrato de missão MCF

- **mission_id:** HORIZONTE-ALEX-47
- **phase_id:** HORIZONTE-ALEX-47-IMPLEMENTACAO
- **Título:** Personagem físico animado vinculado ao Commerce MCP
- **Objetivo:** converter o atendente cenográfico Alex em NPC 3D com rotina própria dentro de cada cafeteria.
- **Resultado esperado:** personagem visível com animações, patrulha segura, saudação ao jogador, reação a Nina e gestos vinculados ao fluxo comercial.
- **Entrada:** Horizonte Play 4.6, commit `61770fa`, branch `feature/horizonte-atendente-ia-mcp-mvp`.
- **Escopo:** cérebro determinístico local, rig em blocos, integração visual, eventos de cliente/comércio, testes e documentação.
- **Fora do escopo:** NPCs conversando entre si por modelo, deslocamento por toda a cidade, diálogos por voz, pagamentos reais, contas, multiplayer, mudança no MCP ou Gemini.
- **Autoridade de decisão final:** Leandro; execução reversível e isolada em branch nova.
- **Classe de risco:** B — alteração visual e lógica cliente que mantém API de comércio, estoque e saldo existentes.
- **Riscos:** FPS em máquinas fracas; oclusão por paredes/telhado; bugs de movimento; inconsistência visual com Nina.
- **Contramedidas:** até 8 lojas; rota interna fixa atrás do balcão; estado independente por estabelecimento; nenhuma API em cada frame; texto de balão apenas de mensagens predefinidas; UI de comércio preservada.
- **Critérios de aceite:** Alex presente em cada loja; caminha entre estações; reage a proximidade e atendimento; sem movimento fora do balcão; navegador sem erros; testes e build aprovados; branch anterior e `main` preservadas.

## Arquitetura

```text
Horizonte Play (Three.js / scene)
   └── CommerceWorld (1 visual por cafeteria)
       ├── prédio, balcão, fachada, colisão existentes
       ├── CommerceAttendantBrain (local, determinístico)
       │    ├── estações: caixa, preparo, organização
       │    ├── detecção: jogador / Nina
       │    └── eventos: abrir, falar, confirmar, repor, sair
       └── CommerceAttendantCharacter (rig de blocos)
            ├── pernas / braços / cabeça / avental e chapéu
            ├── emote e balão fixo acima do telhado
            └── animações por interpolação
                       │
            CommerceClient observa/interage
                       │
            REST + MCP Commerce existentes
            (único responsável por registrar pedidos)
```

**Separação de responsabilidades:**
- `src/commerce-attendant-brain.js`: estado e rotinas, sem Three.js, DOM ou acesso à rede. Testes unitários não dependem do navegador.
- `src/commerce-attendant-character.js`: desenho e poses 3D, sem acesso a estoque, carteira ou Gemini.
- `src/commerce-world.js`: inicialização de um Alex por loja, atualização e exposição de snapshots.
- `src/commerce-client.js`: encaminha eventos apenas depois do sucesso de operações existentes, consulta a posição de Nina a cada 250ms e mantém o HUD.
- `server/commerce-mcp.mjs`, `server/commerce-domain.mjs`, `server/gemini-local.mjs`: **inalterados nesta fase**.

## Comportamentos MVP

1. **Recepção:** ao entrar a menos de 8m do centro da loja, Alex acena e diz "Bem-vindo!" uma vez por visita.
2. **Rotina:** percorre três pontos predefinidos internamente, com velocidade máxima de 0,65 unidade/s, trabalhando no balcão, preparando café e organizando pedidos.
3. **Conversa:** ao abrir a interface com G, para de caminhar, vira o corpo para o jogador e gesticula.
4. **Pedido confirmado:** reage com "Pedido pronto!" mas não realiza a compra por conta própria.
5. **Nina:** se passar a até 7,1m da loja, Alex a cumprimenta, sem criar pedido fictício, alterar necessidades ou mexer no saldo.
6. **Fechar conversa:** exibe despedida e retorna à rotina.
7. **HUD:** indica a atividade atual de Alex quando o jogador estiver perto da cafeteria.

## Futuro — fora do MVP

- Agentes NPC completos com objetivos próprios, memória por personagem e tarefas compartilhadas.
- Nina entrar no estabelecimento e ter uma conversa bidirecional com Alex via orquestrador.
- Mundo com diferentes profissões, turnos, diálogos mais elaborados e grupos sociais.
- Sistema de navegação em interiores e portas funcionais.
- Otimização de geometria e instancing quando a quantidade de NPCs ultrapassar o limite atual.

## Proteção

Nenhum modelo de IA é chamado automaticamente pelas animações; o Gemini textual continua opcional no atendimento do cliente. O fluxo de confirmação de pedido, permissões e estoque permanece no servidor. Em caso de regressão, volte à branch de origem `feature/horizonte-atendente-ia-mcp-mvp` / commit `61770fa`.

Consulte também [documentação do atendente e MCP](ATENDENTE-IA-MCP.md).
