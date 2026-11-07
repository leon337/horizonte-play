import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler, validGeminiKey, GEMINI_MODEL } from '../server/gemini-local.mjs';

const ORIGIN='http://127.0.0.1:5173';
async function withServer(handler, action) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    return await action('http://127.0.0.1:'+server.address().port);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
test('modelo e formato de chave reconhecidos sem expor segredo', () => {
  assert.equal(GEMINI_MODEL,'gemini-3.8-live');
  assert.equal(validGeminiKey('AIza'+'A'.repeat(35)),true);
  assert.equal(validGeminiKey('uma chave errada'),false);
});
test('saúde local não devolve a chave, somente estado', async () => {
  const key='AIza'+'X'.repeat(35);
  await withServer(createHandler({key}), async url => {
    const resp=await fetch(url+'/health');
    const text=await resp.text();
    assert.equal(resp.status,200);
    assert.equal(JSON.parse(text).configured,true);
    assert.ok(!text.includes(key));
  });
});
test('origens externas não recebem tokens', async () => {
  let calls=0;
  const key='AIza'+'X'.repeat(35);
  await withServer(createHandler({key,fetcher:()=>{calls++;return null}}), async url => {
    const resp=await fetch(url+'/api/live-token',{
      method:'POST',headers:{Origin:'https://exemplo.com'}
    });
    assert.equal(resp.status,403);
  });
  assert.equal(calls,0);
});
test('sem chave, não acessa serviço nem emite token', async () => {
  await withServer(createHandler({key:''}),async url=>{
    const resp=await fetch(url+'/api/live-token',{
      method:'POST',headers:{Origin:ORIGIN}
    });
    assert.equal(resp.status,503);
    assert.equal((await resp.json()).code,'NOT_CONFIGURED');
  });
});
test('backend troca chave por token efêmero com modelo limitado', async () => {
  const key='AIza'+'X'.repeat(35);
  let upstream;
  const fetcher=async (url,options)=>{
    upstream={url,options};
    return {ok:true,json:async()=>({name:'auth_tokens/'+'T'.repeat(50)})};
  };
  await withServer(createHandler({key,fetcher,now:()=>Date.parse('2026-11-06T18:00:00Z')}),async url=>{
    const resp=await fetch(url+'/api/live-token',{
      method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
      body:'{}'
    });
    const body=await resp.json();
    assert.equal(resp.status,200);
    assert.equal(body.model,GEMINI_MODEL);
    assert.equal(body.token,'auth_tokens/'+'T'.repeat(50));
    assert.ok(!JSON.stringify(body).includes(key));
  });
  assert.equal(upstream.options.headers['x-goog-api-key'],key);
  assert.equal(JSON.parse(upstream.options.body).liveConnectConstraints.model,'models/gemini-3.8-live');
});
