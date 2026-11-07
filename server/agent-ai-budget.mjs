// Orçamento local por chamadas de inferência, persistido após reiniciar a ponte.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const FILE=path.join(process.env.LOCALAPPDATA ||
  path.join(os.homedir(),'.horizonte-play'),'HorizontePlay','agent-ai-budget-v1.json');
export function createAgentBudget({file=FILE,persist=true,now=Date.now,
  perTenMinutes=6,perDay=20}={}){
  let attempts=[];
  if(persist && fs.existsSync(file)){
    try{
      const json=JSON.parse(fs.readFileSync(file,'utf8'));
      if(Array.isArray(json.attempts)){
        attempts=json.attempts.filter(n=>Number.isSafeInteger(n) &&
          n<=now()&&n>now()-86400000).slice(-perDay);
      }
    }catch { /* Arquivo inválido: bloqueia a cota por segurança. */
      attempts=Array.from({length:perDay},()=>now());
    }
  }
  function reserve(){
    const time=now();
    attempts=attempts.filter(t=>t>time-86400000);
    const latest=attempts.filter(t=>t>time-600000).length;
    if(latest>=perTenMinutes || attempts.length>=perDay)return false;
    attempts.push(time);
    if(persist){
      fs.mkdirSync(path.dirname(file),{recursive:true});
      const temp=file+'.tmp-'+process.pid;
      try{
        fs.writeFileSync(temp,JSON.stringify({version:1,attempts}),{mode:0o600});
        fs.renameSync(temp,file);
      } catch(err){
        attempts.pop();
        try{fs.unlinkSync(temp);}catch{}
        throw err;
      }
    }
    return true;
  }
  return {reserve,getRemaining:()=>Math.max(0,perDay-attempts.length),
    limits:{perTenMinutes,perDay},get file(){return file;}};
}
