# Horizonte Play — MVP Atendente Alex (Commerce MCP + Gemini opcional)

## O que foi implementado
- Alex é o atendente da cafeteria 3D existente. Abra o balcão com **G**.
- Digite "Quero dois cafés", "Me vê três pães de queijo" ou "Quanto custa um suco?".
- O backend consulta o inventário por **ferramentas MCP reais** (cliente e servidor em memória).
- Pedidos recebem orçamento com produto, quantidade e moedas virtuais. **Nenhum débito é feito no chat**.
- O botão **Confirmar compra com moedas virtuais** realiza um segundo POST. O token da proposta dura 2 minutos e é de uso único.
- A ferramenta MCP `registrar_pedido` executa a venda após confirmar, e o domínio verifica saldo e estoque novamente.
- A opção "Usar Gemini" só é ativada pelo jogador; por padrão o atendimento é local, sem API.
- Se o serviço Gemini estiver indisponível ou devolver dados inesperados, volta ao interpretador local.

## Arquitetura

```text
Jogador (modal / G) -> POST /api/shops/:id/attendant/chat
   -> createAttendantService -> MCP in-memory consultar_estoque
   -> Interpretador local OU ponte Gemini local (4174)
   -> proposta de pedido, sem escrita
Jogador confirma explicitamente -> POST /api/shops/:id/attendant/confirm
   -> token temporário de uso único
   -> MCP in-memory registrar_pedido(confirmar:true)
   -> domínio determinístico: valida estoque, saldo, grava pedido
   -> resposta de recibo -> UI atualiza estoque e carteira
```

O serviço MCP HTTP em `127.0.0.1:4180/mcp` e suas ferramentas anteriores permanecem disponíveis.
Não há servidor MCP extra por cafeteria. A lógica de NPC e a Gemini Live da Nina permanecem isoladas.

## Gemini: opção de custo e segurança
A ponte Gemini já existente obtém a chave a partir do arquivo DPAPI criptografado no perfil Windows.
A chave nunca vai ao frontend nem ao Commerce MCP. Para a interpretação estruturada do
atendente, o modelo textual padrão é **gemini-2.5-flash** via `generateContent`, distinto
do modelo **gemini-3.8-live** usado no diálogo da Nina. A disponibilidade, quota e cobrança
dependem da conta e do acesso do usuário no Google AI Studio. Testes automatizados usam mocks:
nenhuma chamada de IA faturável foi feita na validação.

- Texto enviado ao Gemini apenas após o jogador marcar a opção, com limite de 240 caracteres.
- Limite de 12 requisições de interpretação em 10 minutos e timeout de 10 segundos.
- Modelo só retorna intenção, SKU e quantidade; não recebe ferramentas de escrita.
- Respostas de modelo são validadas por allowlist e comparadas ao pedido extraído localmente.
- Preço, estoque e confirmação não dependem do texto do modelo.
- O servidor aceita apenas origens locais no navegador, e escuta em loopback.
- Restrição de origem **não é autenticação**: este MVP não deve ser exposto em rede pública.

## Uso e testes
1. Inicie `INICIAR-3D.bat` para abrir Vite, Commerce e a ponte Gemini.
2. Crie cafeteria (tecla **B**) ou use uma já existente. Aproxime-se e pressione **G**.
3. Converse com Alex. Deixe Gemini desligado para teste gratuito.
4. Faça um pedido, confirme o orçamento e observe carteira e estoque.
5. Para testar interpretação Gemini, marque a caixa correspondente, sabendo que poderá haver cobrança.

```powershell
npm test
npm run build
```

Testes verificam confirmação única, controle de origem, limite de quantidades,
saldo e estoque, token expirado, corrida entre confirmações, rejeição de SKU alheio,
fallback do modelo e redaction da chave no endpoint local.

## Limitações do MVP
- Atendimento apenas por texto, uma cafeteria por conversa, cliente 'jogador' exclusivamente.
- Sem memória longa do Alex, sem entrada física em prédios, sem multiplayer e sem pagamentos reais.
- Propostas ficam em RAM: reiniciar Commerce invalida orçamentos não confirmados.
- Não há autenticação multiusuário nem proteção de acesso público.
- Validação com modelo Gemini real depende de aceite consciente de custos e da disponibilidade da chave/modelo; o fluxo foi testado com simulação controlada.
