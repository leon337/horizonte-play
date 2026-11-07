import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAgentMemory } from '../server/agent-memory.mjs';
import { createAgentBudget } from '../server/agent-ai-budget.mjs';
import { createHandler as createGeminiHandler } from '../server/gemini-local.mjs';
import { createCommerce } from '../server/commerce-domain.mjs';
import { createCommerceHandler } from '../server/commerce-mcp.mjs';
import { createMultiagentNetwork } from '../src/multiagent-network.js';

const ORIGIN='http://127.0.0.1:5173';
const KEY='AIza'+'A'.repeat(35);
function withTemp(run) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'horizonte-agent-test-'));
  const cleanup=()=>fs.rmSync(folder,{force:true,recursive:true});
  let result;
  try {result=run(folder);}catch(err){cleanup();throw err;}
  if(result && typeof result.then==='function')return result.finally(cleanup);
  cleanup();
  return result;
}
async function listen(handler,run){
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{return await run(base,server);}
  finally{await new Promise(resolve=>server.close(resolve));}
}
async function post(base,url,body,origin=ORIGIN){
  const res=await fetch(base+url,{method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify(body)});
  let json;
  try{json=await res.json();}catch{json=null;}
  return {status:res.status,body:json};
}
const mkPayload=()=>({
  agentId:'nina',recipient:'alex:cafe-1',
  kind:'inventory_request',fallback:'Alex, consulte o estoque?',
  context:'Cafeteria fictícia',memory:['Trabalhamos juntos ontem.']
});

test('memórias dos NPCs sobrevivem a reinício e são isoladas por cafeteria',async()=>{
  await withTemp(async folder=>{
    const file=path.join(folder,'mem.json');
    let memory=createAgentMemory({file});
    memory.append('nina',{id:'speech:task-test:one',kind:'dialogue',
      text:'Oi Alex, já nos conhecemos?',partner:'alex:cafe-1'});
    memory.recordCompletedTask({
      taskId:'task-random-a1',shopId:'cafe-1',product:'cafe'
    });
    const before=memory.summary('cafe-1');
    assert.equal(before.nina,2);
    assert.equal(before.alex,1);
    memory=createAgentMemory({file});
    const restored=memory.summary('cafe-1');
    assert.equal(restored.nina,2);
    assert.equal(restored.alex,1);
    assert.equal(memory.recall('alex:cafe-2').length,0);
    memory.recordCompletedTask({
      taskId:'task-random-a1',shopId:'cafe-1',product:'cafe'
    });
    assert.deepEqual(memory.summary('cafe-1'),restored);
    assert.throws(()=>memory.recall('../../something'),/Agente inválido/);
    assert.throws(()=>memory.append('nina',{
      id:'bad',kind:'dialogue',text:' '
    }),/Memória inválida/);
    assert.equal(fs.existsSync(file),true);
    assert.ok(!fs.readFileSync(file,'utf8').includes(KEY));
  });
});

test('memória fica limitada a 30 registros e ignora arquivo inválido',()=>{
  withTemp(folder=>{
    const file=path.join(folder,'memory.json');
    fs.writeFileSync(file,'{bad');
    const memory=createAgentMemory({file});
    assert.equal(memory.summary().nina,0);
    for(let n=0;n<40;n++)memory.append('nina',{
      id:'msg-'+n,kind:'dialogue',text:'Lembrança '+n
    });
    const next=createAgentMemory({file});
    assert.equal(next.summary().nina,30);
    assert.equal(next.recall('nina').length,6);
    assert.equal(next.recall('nina',10).at(-1).text,'Lembrança 39');
  });
});

test('cota de API persiste reinício, respeita janela e limite diário',()=>{
  withTemp(folder=>{
    const file=path.join(folder,'budget.json');
    let time=9000000000;
    const options={file,now:()=>time,perTenMinutes:2,perDay:3};
    let quota=createAgentBudget(options);
    assert.equal(quota.reserve(),true);
    assert.equal(quota.reserve(),true);
    assert.equal(quota.reserve(),false);
    quota=createAgentBudget(options);
    assert.equal(quota.reserve(),false);
    time+=601000;
    quota=createAgentBudget(options);
    assert.equal(quota.reserve(),true);
    assert.equal(quota.reserve(),false);
    time+=86401000;
    quota=createAgentBudget(options);
    assert.equal(quota.reserve(),true);
  });
});

test('Gemini endpoint gera fala, retorna só texto e aplica cota sem expor chave',async()=>{
  const upstream=[];
  const budget=createAgentBudget({persist:false,perTenMinutes:2,perDay:2,
    now:()=>10000000});
  const handler=createGeminiHandler({key:KEY,agentBudget:budget,
    fetcher:async(url,options)=>{
      upstream.push({url,options});
      return {ok:true,json:async()=>({candidates:[{content:{
        parts:[{text:JSON.stringify({text:'Oi Alex! Podemos organizar os cafés?'})}]
      }}]})};
    }});
  await listen(handler,async base=>{
    const denied=await post(base,'/api/agents/generate',mkPayload(),
      'https://foreign.example');
    assert.equal(denied.status,403);
    const bad=await post(base,'/api/agents/generate',{
      ...mkPayload(),agentId:'../../secrets'});
    assert.equal(bad.status,400);
    const first=await post(base,'/api/agents/generate',mkPayload());
    assert.equal(first.status,200);
    assert.equal(first.body.text,'Oi Alex! Podemos organizar os cafés?');
    assert.equal(first.body.mode,'gemini');
    assert.equal(JSON.stringify(first.body).includes(KEY),false);
    assert.equal(upstream[0].options.headers['x-goog-api-key'],KEY);
    const content=JSON.parse(upstream[0].options.body);
    assert.match(content.contents[0].parts[0].text,/Trabalhamos juntos ontem/);
    const second=await post(base,'/api/agents/generate',mkPayload());
    assert.equal(second.status,200);
    const third=await post(base,'/api/agents/generate',mkPayload());
    assert.equal(third.status,429);
    assert.equal(upstream.length,2);
  });
});

test('Commerce guarda fala gerada, reutiliza memória e não altera saldo',async()=>{
  await withTemp(async folder=>{
    const memory=createAgentMemory({file:path.join(folder,'mem.json')});
    const store=createCommerce({persist:false});
    const shop=store.createCafe({x:12,z:5,name:'Café Colaborativo'});
    const calls=[];
    const hosts=new Set();
    const handler=createCommerceHandler(store,{
      allowedHosts:hosts,memory,
      dialogueService:async params=>{
        calls.push(params);
        return {text:'Olá Nina, o café está disponível!',mode:'gemini'};
      }
    });
    await listen(handler,async(base,server)=>{
      hosts.add('127.0.0.1:'+server.address().port);
      const initial=store.snapshot();
      const payload={...mkPayload(),recipient:'alex:'+shop.id,
        taskId:'task-segment-1'};
      const result=await post(base,'/api/agents/dialogue',payload);
      assert.equal(result.status,200);
      assert.equal(result.body.text,'Olá Nina, o café está disponível!');
      assert.equal(memory.recall('nina').length,1);
      const second=await post(base,'/api/agents/dialogue',{
        ...payload,kind:'demo_request'
      });
      assert.equal(second.status,200);
      assert.match(calls[1].memory[0],/Olá Nina/);
      const done=await post(base,'/api/agents/memory/completed',{
        taskId:'task-segment-1',shopId:shop.id,product:'cafe'
      });
      assert.equal(done.status,200);
      assert.equal(memory.summary(shop.id).nina,3);
      assert.equal(memory.summary(shop.id).alex,1);
      const state=await fetch(base+'/api/agents/memory?shopId='+shop.id,{
        headers:{Origin:ORIGIN}
      });
      assert.equal(state.status,200);
      const status=await state.json();
      assert.equal(status.nina,3);
      assert.equal(status.alex,1);
      const forbidden=await post(base,'/api/agents/dialogue',payload,
        'https://foreign.example');
      assert.equal(forbidden.status,403);
      assert.deepEqual(store.snapshot(),initial);
      assert.equal(store.cash(shop.id).orders,0);
    });
  });
});

test('falha Gemini usa fala local, e resposta atrasada não continua tarefa cancelada',async()=>{
  const messages=[];
  let rejectGenerate;
  const pending=new Promise((resolve,reject)=>{rejectGenerate=reject;});
  const network=createMultiagentNetwork({
    readInventory:async()=>({products:[{
      sku:'cafe',label:'Café',stock:4,price:8
    }]}),
    assignNina:s=>({x:s.x,z:s.z-5.15}),
    generateDialogue:()=>pending,
    onMessage:m=>messages.push(m)
  });
  network.setGeminiEnabled(true);
  network.update(.1,{shops:[{id:'cafe-1',x:10,z:10,name:'Café'}],
    nina:{x:10,z:5.15,follow:false,conversationOpen:false}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messages.length,0);
  network.setEnabled(false);
  rejectGenerate(new Error('API offline'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(network.snapshot().active,null);
  assert.equal(messages.at(-1).kind,'failed');
  assert.equal(messages.filter(m=>m.kind==='inventory_request').length,0);
});

test('Nina e Alex mantêm quatro falas geradas por API e memória da missão concluída',async()=>{
  const generated=[],stored=[],messages=[];
  const shop={id:'cafe-1',x:10,z:10,name:'Café da Vila'};
  const nina={x:10,z:4.85,follow:false,conversationOpen:false};
  const network=createMultiagentNetwork({
    readInventory:async()=>({products:[{
      sku:'cafe',label:'Café quentinho',price:8,stock:4
    }]}),
    assignNina:s=>({x:s.x,z:s.z-5.15}),
    generateDialogue:async input=>{
      generated.push(input);
      return {mode:'gemini',text:'[IA] '+input.agentId+': '+input.kind};
    },
    persistTask:async task=>{stored.push(task);return {saved:true};},
    onMessage:m=>messages.push(m)
  });
  network.setGeminiEnabled(true);
  network.update(0.1,{shops:[shop],nina});
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(network.snapshot().active.phase,'travelling');
  assert.equal(generated.length,4);
  assert.equal(messages.filter(m=>m.text.startsWith('[IA]')).length,4);
  assert.ok(generated.some(m=>m.agentId==='nina'));
  assert.ok(generated.some(m=>m.agentId==='alex:cafe-1'));
  for(let i=0;i<40;i++) network.update(0.1,{shops:[shop],nina});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(network.snapshot().completed,1);
  assert.equal(stored.length,1);
  assert.equal(stored[0].shopId,'cafe-1');
  assert.equal(stored[0].product,'cafe');
  assert.equal(network.snapshot().memoryStatus,'saved');
});
