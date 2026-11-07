import http from 'node:http';
import { pathToFileURL } from 'node:url';

// Ponte local: a chave verdadeira nunca é enviada ao frontend.
export const GEMINI_MODEL = 'gemini-3.8-live';
export const LOCAL_PORT = 4174;
const ORIGINS = new Set(['http://127.0.0.1:5173','http://localhost:5173',
 'http://127.0.0.1:5174','http://localhost:5174']);
export const validGeminiKey = key =>
 typeof key === 'string' && /^(?:AIza[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,})$/.test(key.trim());

function reply(res, code, obj, origin = null) {
 res.writeHead(code, {
   'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer', ...(origin ? {
     'Access-Control-Allow-Origin':origin, 'Vary':'Origin'
   } : {})
 });
 res.end(JSON.stringify(obj));
}
export function createHandler({ key=process.env.GEMINI_API_KEY||'', fetcher=fetch,
 now=Date.now }={}) {
 const attempts=[];
 return async function(req,res) {
   const origin=req.headers.origin||'';
   if(req.method==='GET' && req.url==='/health') {
     return reply(res,200,{online:true,configured:validGeminiKey(key),model:GEMINI_MODEL},
       ORIGINS.has(origin)?origin:null);
   }
   if(!ORIGINS.has(origin)) return reply(res,403,{error:'Origem não autorizada.'});
   if(req.method==='OPTIONS' && req.url==='/api/live-token') {
     res.writeHead(204,{
       'Access-Control-Allow-Origin':origin,
       'Access-Control-Allow-Methods':'POST, OPTIONS',
       'Access-Control-Allow-Headers':'Content-Type',
       'Access-Control-Max-Age':'300','Cache-Control':'no-store','Vary':'Origin'
     });return res.end();
   }
   if(req.method!=='POST'||req.url!=='/api/live-token')
     return reply(res,404,{error:'Rota não encontrada.'},origin);
   if(!validGeminiKey(key))return reply(res,503,{
     code:'NOT_CONFIGURED',error:'A chave Gemini ainda não está configurada neste computador.'
   },origin);
   const timestamp=now();
   while(attempts.length&&attempts[0]<timestamp-600000) attempts.shift();
   if(attempts.length>=8)return reply(res,429,{error:'Limite de sessões locais. Aguarde 10 minutos.'},origin);
   attempts.push(timestamp);
   try{
     const upstream=await fetcher('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{
       method:'POST',
       headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
       body:JSON.stringify({
         uses:1,
         expireTime:new Date(timestamp+10*60000).toISOString(),
         newSessionExpireTime:new Date(timestamp+60000).toISOString()
         // A API de provisionamento do projeto rejeitou liveConnectConstraints
         // com INVALID_ARGUMENT. O token permanece efêmero e de uso único.
       }),
       signal:AbortSignal.timeout(15000)
     });
     if(!upstream.ok)return reply(res,502,{
       code:'GEMINI_ERROR',
       error:[401,403].includes(upstream.status)
         ? 'Chave recusada pelo Gemini ou sem permissão para Live.'
         : upstream.status===429?'Limite de uso do Gemini atingido.':
         'Serviço Gemini indisponível (HTTP '+upstream.status+').'
     },origin);
     const body=await upstream.json();
     if(typeof body.name!=='string'||body.name.length<20)
       return reply(res,502,{error:'Token temporário inválido.'},origin);
     return reply(res,200,{token:body.name,model:GEMINI_MODEL},origin);
   }catch {
     return reply(res,502,{error:'Falha de conexão com a API Gemini.'},origin);
   }
 };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 http.createServer(createHandler()).listen(LOCAL_PORT,'127.0.0.1',()=>{
  console.log('GEMINI_BRIDGE_READY http://127.0.0.1:'+LOCAL_PORT+
   ' configured='+validGeminiKey(process.env.GEMINI_API_KEY||''));
 });
}
