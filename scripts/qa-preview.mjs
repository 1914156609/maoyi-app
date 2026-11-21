// Serves immutable build copies, never Vite/HMR. Each port shares one release manifest.
import http from 'node:http';
import fs from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createQaApiTrace } from '../tests/java/qa-preview-trace.mjs';
const release=process.env.QA_RELEASE_ID;
if(!release||!/^qa-[a-zA-Z0-9-]+$/.test(release))throw Error('Set QA_RELEASE_ID');
const base=resolve('.data/qa/releases',release), manifest=await fs.readFile(resolve(base,'manifest.json'));
const apiPort=Number(process.env.QA_JAVA_PORT||8081);
const traceEnabled=process.env.QA_API_TRACE==='1';
const traceFile=resolve('.data/qa/api-evidence',`http-preview-trace-${release}.ndjson`);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.ico':'image/x-icon'};
for(const [app,port]of [['h5',5183],['admin',5186]]){
 const root=resolve(base,app);
 http.createServer(async(req,res)=>{
  res.setHeader('X-QA-Release',release);res.setHeader('Cache-Control','no-store');
  if(req.url==='/__version'){res.setHeader('Content-Type','application/json');res.end(manifest);return;}
  if(req.url.startsWith('/api/')||req.url.startsWith('/prod-api/')){
   const trace=createQaApiTrace({enabled:traceEnabled,release,app,method:req.method,path:req.url,file:traceFile});
   const upstream=http.request({host:'127.0.0.1',port:apiPort,path:req.url.replace(/^\/prod-api/,''),method:req.method,headers:{...req.headers,host:`127.0.0.1:${apiPort}`}},r=>{trace?.observe(r);res.writeHead(r.statusCode,r.headers);r.pipe(res);});
   upstream.on('error',()=>{trace?.upstreamError();res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({code:502,message:'服务暂时不可用，请稍后重试',msg:'服务暂时不可用，请稍后重试'}));});req.pipe(upstream);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
   const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   let file=resolve(root,'.'+path);if(file!==root&&!file.startsWith(root+sep))throw Error('Path');
   try{if(!(await fs.stat(file)).isFile())file=resolve(root,'index.html');}catch{if(extname(file)){res.writeHead(404);res.end('Not found');return;}file=resolve(root,'index.html');}
   const body=await fs.readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(400);res.end('Bad request');}
 }).listen(port,'127.0.0.1',()=>console.log(`${release} ${app} http://127.0.0.1:${port}`));
}
