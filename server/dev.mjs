import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { openDatabase } from './sqlite.mjs';
import { handleApi } from './api.mjs';
await mkdir('.data',{recursive:true});
const db=openDatabase('.data/maoyi.sqlite');db.migrate(resolve('server/migrations'));
const configPath=process.env.MAOYI_CONFIG||'.secrets/server.json';
let config={};try{config=JSON.parse(await readFile(configPath,'utf8'));}catch{}
const env={...config,DB:db,LOCAL_DEV:true};
const root=resolve('dist/build/h5'),port=Number(process.env.MAOYI_API_PORT||5175);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname.startsWith('/api/')){
   const response=await handleApi(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})}),env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+sep)||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(file));
 }catch{res.writeHead(500);res.end('Service error');}
});
server.listen(port,'127.0.0.1',()=>console.log(`毛衣姑娘服务：http://127.0.0.1:${port}`));
