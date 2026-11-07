// Memória persistente e limitada para os NPCs. Não guarda segredos nem arquivos do jogador.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const defaultPath = path.join(process.env.LOCALAPPDATA ||
  path.join(os.homedir(), '.horizonte-play'), 'HorizontePlay', 'agent-memory-v1.json');
const AGENT_ID = /^(nina|alex:cafe-\d{1,8})$/;
const SHOP_ID = /^cafe-\d{1,8}$/;
const MAX_ENTRIES = 30;
const safe = (value, max) => typeof value === 'string'
  ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0,max) : '';
const goodEntry = item => item && ['dialogue','mission'].includes(item.kind) &&
  typeof item.text === 'string' && item.text.length <= 240 &&
  typeof item.id === 'string' && item.id.length <= 100 &&
  typeof item.when === 'string';
const empty = () => ({ version:1, agents:{} });
export function createAgentMemory({file = defaultPath, persist = true} = {}) {
  let state=empty();
  if(persist && fs.existsSync(file)) {
    try {
      const raw=JSON.parse(fs.readFileSync(file,'utf8'));
      if(raw?.version===1 && raw.agents && typeof raw.agents==='object' &&
          !Array.isArray(raw.agents)) {
        for(const [id,value] of Object.entries(raw.agents)) {
          if(!AGENT_ID.test(id) || !Array.isArray(value))continue;
          state.agents[id]=value.filter(goodEntry).slice(-MAX_ENTRIES);
        }
      }
    }catch { /* Nunca sobrescreve o arquivo inválido até uma nova escrita. */ }
  }
  function save(){
    if(!persist)return;
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=file+'.tmp-'+process.pid;
    try{
      fs.writeFileSync(temp,JSON.stringify(state,null,2),{mode:0o600});
      fs.renameSync(temp,file);
    }catch(err) {
      try{ fs.unlinkSync(temp); }catch{}
      throw err;
    }
  }
  function validateAgent(id) {
    if(typeof id!=='string'||!AGENT_ID.test(id))
      throw Object.assign(new Error('Agente inválido.'),{status:400});
  }
  function recall(id,limit=6){
    validateAgent(id);
    return (state.agents[id] || []).slice(-Math.min(10,Math.max(0,limit)))
      .map(item=>({...item}));
  }
  function append(id,{kind,id:entryId,text,partner=''}={}){
    validateAgent(id);
    if(!['dialogue','mission'].includes(kind) || !safe(entryId,100) ||
        !safe(text,240)) throw Object.assign(
      new Error('Memória inválida.'),{status:400});
    const previous=JSON.stringify(state);
    const collection=state.agents[id] ||= [];
    const canonicalId=safe(entryId,100);
    if(collection.some(item=>item.id===canonicalId))return recall(id,MAX_ENTRIES);
    collection.push({kind,id:canonicalId,text:safe(text,240),
      partner:safe(partner,40),when:new Date().toISOString()});
    state.agents[id]=collection.slice(-MAX_ENTRIES);
    try {save();}catch(err){state=JSON.parse(previous);throw err;}
    return recall(id,MAX_ENTRIES);
  }
  function recordCompletedTask({taskId,shopId,product}={}) {
    if(typeof taskId!=='string'||!/^task-[a-z0-9-]{1,45}$/.test(taskId) ||
        typeof shopId!=='string'||!SHOP_ID.test(shopId) ||
        typeof product!=='string'||!['cafe','pao_queijo','suco'].includes(product))
      throw Object.assign(new Error('Missão inválida.'),{status:400});
    const description='Colaborei na demonstração fictícia de '+product+
      ' na cafeteria '+shopId+'; sem venda ou consumo de estoque.';
    const records=[
      ['nina','alex:'+shopId],['alex:'+shopId,'nina']
    ];
    const previous=JSON.stringify(state);
    try {
      for(const [id,partner] of records) {
        const entries=state.agents[id] ||= [];
        if(!entries.some(item=>item.id===taskId)) {
          entries.push({kind:'mission',id:taskId,text:description,partner,
            when:new Date().toISOString()});
          state.agents[id]=entries.slice(-MAX_ENTRIES);
        }
      }
      save();
    } catch(err) { state=JSON.parse(previous); throw err; }
    return {saved:true,taskId,nina:recall('nina').length,
      alex:recall('alex:'+shopId).length};
  }
  function summary(shopId='') {
    const id=SHOP_ID.test(shopId)?'alex:'+shopId:null;
    return {nina:(state.agents.nina || []).length,
      alex:id?(state.agents[id] || []).length:0,
      ninaRecent:recall('nina',3).map(({text,kind,when})=>({text,kind,when})),
      alexRecent:id?recall(id,3).map(({text,kind,when})=>({text,kind,when})) : []};
  }
  return {append,recall,recordCompletedTask,summary,get file(){return file;}};
}
