import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createCommerce } from '../server/commerce-domain.mjs';
import { createCommerceHandler } from '../server/commerce-mcp.mjs';

async function testServer(callback) {
  const store=createCommerce({persist:false});
  const validHosts=new Set();
  const server=http.createServer(createCommerceHandler(store,{allowedHosts:validHosts}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  validHosts.add('127.0.0.1:'+server.address().port);
  try {return await callback(origin,store);}
  finally {await new Promise(resolve=>server.close(resolve));}
}
const REQUEST_ORIGIN='http://127.0.0.1:5173';
const post=(url,data,origin=REQUEST_ORIGIN)=>fetch(url,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify(data)
});
test('REST aceita apenas o jogo local e verifica localização da cafeteria',async()=>{
  await testServer(async(base,store)=>{
    const forbidden=await post(base+'/api/shops',{x:12,z:5,name:'Loja'},'https://site-externo.com');
    assert.equal(forbidden.status,403);
    const noOrigin=await fetch(base+'/api/shops',{method:'POST',
      headers:{'Content-Type':'application/json'},body:'{"x":12,"z":5}'});
    assert.equal(noOrigin.status,403);
    const invalid=await post(base+'/api/shops',{x:30,z:-25,name:'Lago'});
    assert.equal(invalid.status,400);
    const created=await post(base+'/api/shops',{x:12,z:5,name:'Café da Praça'});
    assert.equal(created.status,201);
    assert.equal((await created.json()).id,'cafe-1');
    const state=await fetch(base+'/api/state',{headers:{Origin:REQUEST_ORIGIN}});
    assert.equal(state.status,200);
    assert.equal((await state.json()).shops.length,1);
  });
});
test('REST registra pedidos fictícios, atualiza estoque e suporta reposição',async()=>{
  await testServer(async(base)=>{
    const shop=await (await post(base+'/api/shops',{x:12,z:5,name:'Café do Vale'})).json();
    const order=await post(base+'/api/shops/'+shop.id+'/orders',
      {sku:'cafe',quantity:2,customer:'jogador'});
    assert.equal(order.status,201);
    assert.equal((await order.json()).wallet,164);
    const stock=await fetch(base+'/api/shops/'+shop.id+'/inventory',
      {headers:{Origin:REQUEST_ORIGIN}});
    assert.equal((await stock.json()).products.find(p=>p.sku==='cafe').stock,12);
    const restock=await post(base+'/api/shops/'+shop.id+'/restock',
      {sku:'cafe',quantity:4});
    assert.equal((await restock.json()).stock,16);
    const cash=await fetch(base+'/api/shops/'+shop.id+'/cash',
      {headers:{Origin:REQUEST_ORIGIN}});
    assert.equal((await cash.json()).revenue,16);
  });
});
test('protocolo MCP real apresenta ferramentas e executa consulta e pedido',async()=>{
  await testServer(async(base)=>{
    const client=new Client({name:'horizonte-commerce-test',version:'1.0.0'},
      {capabilities:{}});
    const transport=new StreamableHTTPClientTransport(new URL(base+'/mcp'));
    try {
      await client.connect(transport);
      const tools=(await client.listTools()).tools.map(item=>item.name);
      for(const item of ['listar_estabelecimentos','consultar_estoque',
        'criar_cafeteria','registrar_pedido','repor_estoque','consultar_caixa']) {
        assert.ok(tools.includes(item),'Ferramenta MCP ausente: '+item);
      }
      const unconfirmed=await client.callTool({name:'criar_cafeteria',
        arguments:{nome:'Loja do Vale',x:12,z:5,confirmar:false}});
      assert.equal(unconfirmed.isError,true);
      const created=await client.callTool({name:'criar_cafeteria',
        arguments:{nome:'Loja do Vale',x:12,z:5,confirmar:true}});
      assert.ok(!created.isError);
      const shop=JSON.parse(created.content[0].text);
      assert.equal(shop.id,'cafe-1');
      const placed=await client.callTool({name:'registrar_pedido',
        arguments:{estabelecimento_id:shop.id,produto:'cafe',
          quantidade:1,cliente:'nina',confirmar:true}});
      assert.ok(!placed.isError);
      assert.equal(JSON.parse(placed.content[0].text).receipt.customer,'nina');
      const query=await client.callTool({name:'consultar_caixa',
        arguments:{estabelecimento_id:shop.id}});
      assert.equal(JSON.parse(query.content[0].text).orders,1);
    } finally {
      await client.close().catch(()=>{});
      await transport.close().catch(()=>{});
    }
  });
});
