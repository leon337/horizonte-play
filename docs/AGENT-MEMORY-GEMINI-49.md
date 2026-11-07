# Horizonte Play 4.9 — Gemini por API e memória persistente dos agentes

## Contrato da missão MCF
- **mission_id:** HORIZONTE-AGENTS-49
- **parent_mission_id:** HORIZONTE-MULTIAGENT-48
- **objetivo:** ampliar a colaboração Nina ⇄ Alex com inferência opcional via Gemini e memória que sobrevive ao reinício.
- **origem:** `fe8e15d` v4.8; branch isolada `feature/horizonte-npc-gemini-memory-49`.
- **escopo:** memória local por agente, cotas duráveis, geração de falas, fallback, UI, testes, documentação e PR.
- **fora do escopo:** livre delegação de ferramentas para LLM, compras/autonomia financeira, multiplayer, rede distribuída, geração de voz automática ou acesso remoto aos arquivos.
- **risco:** B; operações em arquivo local e uso opcional de API podem gerar custos após ativação pelo jogador.
- **aceite:** diálogo em duas vias com falas geradas quando o jogador ativa IA; contexto de memória por personagem; restauração de memória e cotas após reinício; fallback local e operações financeiras inalteradas; testes e build.
- **gate:** revisão antes de merge ou deploy, validação com GPU e chamada real Gemini somente com consentimento consciente de custo.

## Arquitetura

```text
Nina / Alex (4.8)
  ├── Eventos tipados determinísticos do coordenador local
  ├── Se IA ligada → POST /api/agents/dialogue (Commerce 4180)
  │       ├── valida agente, destino, evento, tarefa e loja
  │       ├── recupera últimas 6 memórias do remetente
  │       └── POST /api/agents/generate (Gemini Bridge 4174)
  │                 ├── validação de prompt e JSON
  │                 ├── orçamento persistente (6 em 10 min; 20 em 24 h)
  │                 └── Gemini 2.5 Flash (generateContent; texto)
  ├── Resposta somente texto → mensagem Nina ⇄ Alex
  ├── Falha, cota ou API offline → fala local sem interromper a missão
  └── Missão concluída → POST /api/agents/memory/completed
               └── Lembrança persistida para Nina e Alex
```

O mecanismo de ação (consultar estoque via MCP, andar até a cafeteria, preparar demonstração e retornar à rotina) independe da saída do Gemini. Nenhuma fala pode executar diretamente uma ferramenta.

## Armazenamento e privacidade

Diretório padrão Windows: `%LOCALAPPDATA%\HorizontePlay`

Arquivos novos:
- `agent-memory-v1.json`: histórico por `nina` e `alex:cafe-N`, no máximo 30 registros por agente (missões ou falas geradas). Os registros têm id, data, parceiro e texto curto; são salvos por escrita atômica.
- `agent-ai-budget-v1.json`: carimbos de tempo de inferências, com janela de 10 minutos e janela móvel de 24 horas; impede zerar contadores apenas reiniciando a ponte.

**Não são gravadas chaves de API nesses arquivos.** A chave continua protegida via DPAPI no arquivo `gemini-key.dpapi` do perfil Windows. O navegador não recebe a chave.

O Gemini recebe apenas contexto reduzido da tarefa e até seis lembranças de texto do agente remetente. Isso implica envio desses trechos ao provedor externo somente quando a opção Gemini estiver marcada.

## Uso

1. Execute `INICIAR-3D.bat` e abra `http://127.0.0.1:5173/`.
2. Em **Rede Multiagente**, mantenha **Ativa** para que Nina e Alex realizem tarefas.
3. **Diálogos Gemini por API** começa **desmarcado** para não consumir sua cota inadvertidamente. Marque para permitir até quatro falas geradas por missão, sujeitas ao teto de chamadas.
4. O painel mostra estado do modelo, memórias locais de Nina e Alex e as mensagens entre eles.
5. Ao concluir a missão, uma lembrança é salva automaticamente para os dois NPCs, independentemente de usar Gemini.

### Custos e limites
- Modelo de texto: `gemini-2.5-flash`; separado do modelo Live usado nas conversas com a Nina.
- Máximo por ponte local: **6 chamadas por 10 minutos** e **20 chamadas em 24 horas**. Cada tentativa reservada conta, inclusive se a API retornar falha.
- Os limites são locais e **não constituem teto financeiro garantido** na conta Google, já que preços/quotas são externos e outros projetos também podem usar a chave.
- A opção controla apenas o diálogo multiagente; não altera configurações de Gemini Live ou do atendimento de balcão.
- Falta ou rejeição da chave, indisponibilidade da API ou extrapolação de cota resulta em mensagens locais, sem bloquear a missão.

## Restrições
- **Memória é por agente, não global:** Nina lembra seus eventos; cada Alex lembra apenas sua cafeteria. O contexto passado ao modelo é limitado.
- Memória local não é criptografada; não guarde nela dados pessoais reais, segredos ou documentos.
- Os registros permanecem até serem excluídos no próprio computador. Para limpar apenas essa memória, encerre o jogo e a ponte, e exclua `agent-memory-v1.json` (não exclua `gemini-key.dpapi` nem `commerce-v1.json`).
- Fala gerada não vira decisão de compra, criação de loja, pedido, pagamento ou alteração de estoque.
- Nesta versão não há diálogo ilimitado livre: o coordenador define a sequência de tarefas e autoriza no máximo quatro falas geradas por missão. Isso previne loops e gastos acidentais.

## Testes
- `npm test` inclui reinício e recuperação de memória, cotas persistentes, geração mockada, ausência de vazamento de chave, invalidação de agentes e proteção das transações comerciais.
- `npm run build` verifica a UI cliente.
- Navegador E2E precisa validar ativação/desativação, UI com histórico e memórias, sem consumir Gemini real no QA.
