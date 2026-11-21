// Immutable admin bundle served only against isolated Java8082; no upstream fallback.
import http from 'node:http';
import fs from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const c=JSON.parse(await fs.readFile('.secrets/qa-clone.json','utf8'));
if(c.apiPort!==8082||c.redisPort!==6390||!/^maoyi_qa_clone_[a-f0-9]{6}$/.test(c.database)||!c.env.DB_URL.includes('/'+c.database+'?'))throw Error('Isolation contract mismatch');
const release=c.release,root=resolve('.data/qa/releases',release,'admin');
const manifest={id:release,environment:'isolated-clone',admin:'http://127.0.0.1:5197',api:'http://127.0.0.1:8082',database:c.database,redisPort:6390,sourceManifest:resolve('.data/qa/releases',release,'manifest.json')};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{
 res.setHeader('X-QA-Release',release);res.setHeader('X-QA-Isolation','clone');res.setHeader('Cache-Control','no-store');
 if(req.url==='/__version'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return;}
 if(req.url.startsWith('/prod-api/')||req.url.startsWith('/api/')){
  const upstream=http.request({host:'127.0.0.1',port:8082,path:req.url.replace(/^\/prod-api/,''),method:req.method,headers:{...req.headers,host:'127.0.0.1:8082'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({code:502,msg:'隔离测试后台不可用'}))});req.pipe(upstream);return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep))throw Error('Invalid path');
  try{if(!(await fs.stat(file)).isFile())file=resolve(root,'index.html')}catch{if(extname(file)){res.writeHead(404);res.end('Not found');return}file=resolve(root,'index.html')}
  const body=await fs.readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(400);res.end('Bad request')}
}).listen(5197,'127.0.0.1',()=>console.log(`${release} isolated admin http://127.0.0.1:5197 -> Java8082 only`));
