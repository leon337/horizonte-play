// Horizonte Commerce: UM servidor central MCP + API HTTP para o jogo.
// Somente 127.0.0.1, sem pagamentos reais ou acesso remoto.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCommerce, COMMERCE_PORT } from './commerce-domain.mjs';
import { createAttendantService } from './commerce-attendant.mjs';

export const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:5174', 'http://localhost:5174'
]);
const VALID_HOSTS = new Set(['127.0.0.1:4180', 'localhost:4180']);
function sendJson(res, code, data, origin = null) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {})
  });
  res.end(JSON.stringify(data));
}
function readJson(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let text = '', size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        const e = new Error('Requisição muito grande.'); e.status = 413;
        reject(e);
        req.destroy();
        return;
      }
      text += chunk.toString('utf8');
    });
    req.on('end', () => {
      try { resolve(text ? JSON.parse(text) : {}); }
      catch { const e = new Error('JSON inválido.'); e.status = 400; reject(e); }
    });
    req.on('error', reject);
  });
}
function toolResult(callback) {
  return async input => {
    try {
      const result = callback(input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text',
        text: error?.message || 'Operação recusada' }] };
    }
  };
}
export function createCommerceMcpServer(store) {
  const mcp = new McpServer({ name: 'horizonte-commerce', version: '1.0.0' });
  mcp.registerTool('listar_estabelecimentos', {
    description: 'Lista cafeterias do mundo Horizonte e o saldo fictício da carteira do jogador.',
    inputSchema: {},
    annotations: { readOnlyHint: true }
  }, toolResult(() => store.snapshot()));

  mcp.registerTool('consultar_estoque', {
    description: 'Consulta produtos, preços em moedas virtuais e estoque de uma cafeteria.',
    inputSchema: { estabelecimento_id: z.string().max(30) },
    annotations: { readOnlyHint: true }
  }, toolResult(({ estabelecimento_id }) => store.inventory(estabelecimento_id)));

  mcp.registerTool('criar_cafeteria', {
    description: 'Cria cafeteria no mundo local. Exige confirmação explícita antes de modificar o mundo.',
    inputSchema: {
      nome: z.string().min(3).max(35), x: z.number(), z: z.number(),
      confirmar: z.boolean()
    },
    annotations: { destructiveHint: false }
  }, toolResult(({ nome, x, z, confirmar }) => {
    if (!confirmar) throw new Error('Solicite confirmação do usuário antes de criar.');
    return store.createCafe({ name: nome, x, z });
  }));

  mcp.registerTool('registrar_pedido', {
    description: 'Registra venda fictícia com estoque e saldo. O cliente padrão é o jogador.',
    inputSchema: {
      estabelecimento_id: z.string().max(30),
      produto: z.enum(['cafe', 'pao_queijo', 'suco']),
      quantidade: z.number().int().min(1).max(20),
      cliente: z.enum(['jogador', 'nina']).default('jogador'),
      confirmar: z.boolean()
    }
  }, toolResult(({ estabelecimento_id, produto, quantidade, cliente, confirmar }) => {
    if (!confirmar) throw new Error('Solicite confirmação do pedido fictício.');
    return store.order({ shopId: estabelecimento_id, sku: produto,
      quantity: quantidade, customer: cliente });
  }));

  mcp.registerTool('repor_estoque', {
    description: 'Reposição simulada sem dinheiro real. Exige confirmação explícita.',
    inputSchema: {
      estabelecimento_id: z.string().max(30),
      produto: z.enum(['cafe', 'pao_queijo', 'suco']),
      quantidade: z.number().int().min(1).max(25),
      confirmar: z.boolean()
    }
  }, toolResult(({ estabelecimento_id, produto, quantidade, confirmar }) => {
    if (!confirmar) throw new Error('Solicite confirmação para repor estoque.');
    return store.restock({ shopId: estabelecimento_id, sku: produto, quantity: quantidade });
  }));

  mcp.registerTool('consultar_caixa', {
    description: 'Consulta número de vendas, receita, saldo e último pedido virtual.',
    inputSchema: { estabelecimento_id: z.string().max(30) },
    annotations: { readOnlyHint: true }
  }, toolResult(({ estabelecimento_id }) => store.cash(estabelecimento_id)));
  return mcp;
}

// O atendente chama ferramentas reais do MCP, no mesmo processo e com transporte
// em memória. Assim nenhuma loja precisa de servidor MCP próprio.
async function invokeCommerceTool(store, name, args) {
  const server = createCommerceMcpServer(store);
  const client = new Client({ name: 'horizonte-attendant', version: '1.0.0' },
    { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      const msg = result.content?.find(part => part.type === 'text')?.text || 'Pedido recusado.';
      const error = new Error(msg);
      error.status = /Estoque insuficiente|moedas virtuais suficientes/.test(msg) ? 409 : 400;
      throw error;
    }
    return JSON.parse(result.content.find(part => part.type === 'text').text);
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
async function interpretWithGemini(message) {
  const response = await fetch('http://127.0.0.1:4174/api/attendant/parse', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Gemini indisponível');
  return response.json();
}
export function createCommerceHandler(store, {
  allowedHosts = VALID_HOSTS, interpreter = interpretWithGemini
} = {}) {
  const attendant = createAttendantService(
    (name, args) => invokeCommerceTool(store, name, args), { interpreter });
  return async function handle(req, res) {
    const origin = req.headers.origin || '';
    const allowed = ALLOWED_ORIGINS.has(origin) ? origin : null;
    if (!allowedHosts.has(req.headers.host || '')) {
      return sendJson(res, 403, { error: 'Host não permitido.' });
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1:4180');
    if (url.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { online: true, service: 'horizonte-commerce',
        mcp: '/mcp', virtualOnly: true, shops: store.list().length }, allowed);
    }
    if (origin && !allowed) return sendJson(res, 403, { error: 'Origem não autorizada.' });
    if (url.pathname === '/mcp') {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Use POST para MCP Streamable HTTP.' }, allowed);
      }
      let transport, server;
      try {
        const body = await readJson(req, 256 * 1024);
        server = createCommerceMcpServer(store);
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (error) {
        if (!res.headersSent) sendJson(res, error.status || 500,
          { error: 'Falha no protocolo MCP.' }, allowed);
      } finally {
        // O transporte é sem sessão e é criado por requisição.
        if (transport) await transport.close().catch(() => {});
        if (server) await server.close().catch(() => {});
      }
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Não encontrado.' }, allowed);
    }
    // Somente o frontend local autorizado pode modificar o mundo pelo REST.
    if (!allowed) return sendJson(res, 403, { error: 'Origem do jogo obrigatória.' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '300'
      });
      return res.end();
    }
    try {
      if (url.pathname === '/api/state' && req.method === 'GET')
        return sendJson(res, 200, store.snapshot(), allowed);
      if (url.pathname === '/api/shops' && req.method === 'POST')
        return sendJson(res, 201, store.createCafe(await readJson(req)), allowed);
      const aiRoute = url.pathname.match(
        /^\/api\/shops\/([a-z0-9-]+)\/attendant\/(chat|confirm)$/);
      if (aiRoute && req.method === 'POST') {
        const [, shopId, action] = aiRoute;
        const body = await readJson(req, 4096);
        const result = action === 'chat'
          ? await attendant.chat({ ...body, shopId })
          : await attendant.confirm({ ...body, shopId });
        return sendJson(res, action === 'chat' ? 200 : 201, result, allowed);
      }

      const match = url.pathname.match(/^\/api\/shops\/([a-z0-9-]+)\/(inventory|orders|restock|cash)$/);
      if (match) {
        const [, id, resource] = match;
        if (resource === 'inventory' && req.method === 'GET')
          return sendJson(res, 200, store.inventory(id), allowed);
        if (resource === 'cash' && req.method === 'GET')
          return sendJson(res, 200, store.cash(id), allowed);
        if (resource === 'orders' && req.method === 'POST')
          return sendJson(res, 201, store.order({ ...(await readJson(req)), shopId: id }), allowed);
        if (resource === 'restock' && req.method === 'POST')
          return sendJson(res, 200, store.restock({ ...(await readJson(req)), shopId: id }), allowed);
      }
      return sendJson(res, 404, { error: 'Operação inexistente.' }, allowed);
    } catch (error) {
      return sendJson(res, error.status || 500,
        { error: error.status ? error.message : 'Falha no armazenamento local.' }, allowed);
    }
  };
}
export function startCommerceServer(store = createCommerce(), port = COMMERCE_PORT) {
  const server = http.createServer(createCommerceHandler(store));
  server.listen(port, '127.0.0.1', () =>
    console.log('HORIZONTE_COMMERCE_READY http://127.0.0.1:' + port +
      ' MCP=/mcp data=local'));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCommerceServer();
}
