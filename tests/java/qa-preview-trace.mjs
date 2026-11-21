// Optional evidence sink for the immutable local preview. Never persists headers, request bodies,
// query strings, raw response bodies, captcha material, share codes, credentials or tokens.
import {appendFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
let sequence=0;
const craftId=/^GY-\d{8}-[A-F0-9]{16}$/;
const states=new Set(['draft','pending','approved','rejected']);
export function traceRoute(rawPath){
 let path;try{path=new URL(rawPath,'http://localhost').pathname.replace(/^\/prod-api(?=\/)/,'');}catch{return null;}
 const fixed=new Set(['/login','/logout','/getInfo','/getRouters','/unlockscreen','/captchaImage','/api/health','/api/auth/login','/api/auth/logout','/api/auth/me','/api/crafts','/api/shares','/api/charts','/maoyi/craft/list','/maoyi/share/list']);
 if(fixed.has(path))return path;
 if(/^\/api\/shares\/[^/]+$/.test(path))return '/api/shares/[redacted]';
 let m=path.match(/^\/(api\/crafts|maoyi\/craft)\/(GY-\d{8}-[A-F0-9]{16})(\/(submit|review))?$/);if(m)return path;
 if(/^\/maoyi\/share\/[a-f0-9]{64}\/revoke$/.test(path))return '/maoyi/share/[share-hash]/revoke';
 if(/^\/api\/charts\/[^/]+$/.test(path))return '/api/charts/[chart-id]';
 if(/^\/system\/(user|role|menu|dept|post|config|notice|dict\/(type|data))(\/(list|optionselect|treeselect|profile|profile\/avatar|profile\/updatePwd|[0-9]+(?:,[0-9]+)*))?$/.test(path))return path;
 if(/^\/system\/user\/authRole\/[0-9]+$/.test(path))return path;
 if(/^\/monitor\/cache\//.test(path))return '/monitor/cache/[redacted]';
 if(/^\/monitor\/(server|cache|online|logininfor\/list|operlog\/list|job\/list|jobLog\/list)$/.test(path))return path;
 if(/^\/tool\/gen\/(list|db\/list|[0-9]+)$/.test(path))return path;
 return null;
}
export function projectResponse(body,route){
 const result={};if(!body||typeof body!=='object'||Array.isArray(body))return result;
 if(Number.isInteger(body.code)&&body.code>=100&&body.code<=599)result.applicationCode=body.code;
 if(Number.isSafeInteger(body.total)&&body.total>=0)result.total=body.total;
 if(Array.isArray(body.rows))result.rowCount=body.rows.length;
 if(route.startsWith('/api/crafts')||route.startsWith('/maoyi/craft')||route.startsWith('/api/shares')){
  const value=body.craft||body.data?.craft||body.data;
  if(value&&typeof value==='object'){
   if(typeof value.id==='string'&&craftId.test(value.id))result.craftId=value.id;
   if(Number.isSafeInteger(value.version)&&value.version>=0)result.version=value.version;
   if(states.has(value.status))result.status=value.status;
  }
  if(Number.isSafeInteger(body.expiresAt)&&body.expiresAt>0)result.expiresAt=body.expiresAt;
 }
 if(route==='/api/auth/me'||route==='/api/auth/login'){
  const id=body.user?.id;if(typeof id==='string'&&/^\d{1,12}$/.test(id)||Number.isSafeInteger(id)&&id>0)result.userId=String(id);
  if(['admin','supervisor','customer','employee'].includes(body.user?.roleCode))result.roleCode=body.user.roleCode;
 }
 return result;
}
export function createQaApiTrace({enabled=false,release,app,method,path,write,file,maxBytes=65536}){
 if(!enabled)return null;const route=traceRoute(path);if(!route)return null;
 if(!/^qa-[a-zA-Z0-9-]+$/.test(release)||!['h5','admin'].includes(app))throw Error('Invalid trace context');
 const id=release+'-'+app+'-'+(++sequence),started=Date.now();let finished=false;
 const sink=write||((event)=>{mkdirSync(dirname(file),{recursive:true});appendFileSync(file,JSON.stringify(event)+'\n');});
 const emit=extra=>{try{sink({at:new Date().toISOString(),release,traceId:id,source:'qa-preview:'+app+':'+(app==='h5'?5183:5186),method:['GET','POST','PUT','DELETE','PATCH','HEAD'].includes(method)?method:'OTHER',route,...extra});}catch{/* Evidence sink failure must not interrupt the product response. */}};
 emit({event:'request',provenance:'actual preview-proxied HTTP; correlate UI screenshot/time, not a claim of browser automation'});
 return {
  observe(response){
   let bytes=0,chunks=[],oversized=false;const skip=route==='/captchaImage';
   response.on('data',chunk=>{bytes+=chunk.length;if(skip||oversized)return;if(bytes>maxBytes){oversized=true;chunks=[];}else chunks.push(Buffer.from(chunk));});
   response.once('end',()=>{if(finished)return;finished=true;let safe={},jsonParsed=false;if(!skip&&!oversized){try{safe=projectResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')),route);jsonParsed=true;}catch{}}chunks=[];emit({event:'response',httpStatus:response.statusCode,durationMs:Date.now()-started,bytes,upstreamComplete:true,jsonParsed,projectionSkipped:skip?'captcha':oversized?'size-limit':undefined,...safe});});
   response.once('error',()=>{if(finished)return;finished=true;chunks=[];emit({event:'response-error',httpStatus:response.statusCode,durationMs:Date.now()-started,bytes});});
   response.once('close',()=>{if(finished)return;finished=true;chunks=[];emit({event:'upstream-closed',httpStatus:response.statusCode,durationMs:Date.now()-started,bytes,upstreamComplete:false});});
  },
  upstreamError(){if(finished)return;finished=true;emit({event:'proxy-error',httpStatus:502,durationMs:Date.now()-started});}
 };
}
