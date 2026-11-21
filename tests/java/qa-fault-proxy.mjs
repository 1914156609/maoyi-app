// Local fault harness: immutable original builds through a separate origin; never stops Java.
import http from 'node:http';
import {classifyFaultRequest,normalizeFaultPath,redactFaultPath,isAllowedFaultRule} from './qa-fault-routing.mjs';
import {pipeDelayed200} from './qa-delay-response.mjs';
import {initialSurfaceFeatures,featureCommand,setSurfaceFeature,clipboardPolicyHeaders,serveCacheFixture} from './qa-surface-features.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,appendFileSync,mkdirSync} from 'node:fs';
const secretFile='.secrets/qa-fault-proxy.json',command=process.argv[2]||'status';
const controlPort=5193;
if(command!=='start'){
 const {secret}=JSON.parse(readFileSync(secretFile,'utf8'));
 const body=featureCommand(command,process.argv[3])||(command==='release'?{action:'release',release:process.argv[3]}:command==='reset'?{action:'reset'}:command==='status'?{action:'status'}:{action:'arm',mode:command,path:process.argv[3],value:Number(process.argv[4]||500),method:process.argv[5]||'*',surface:process.argv[6]||'*'});
 const r=await fetch(`http://127.0.0.1:${controlPort}/__qa/control`,{method:'POST',headers:{'content-type':'application/json','X-QA-Control':secret},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.message);console.log(JSON.stringify(data,null,2));process.exit(0);
}
let release=process.env.QA_RELEASE_ID;if(!release)throw Error('Set QA_RELEASE_ID to the fixed target release');
mkdirSync('.secrets',{recursive:true,mode:0o700});mkdirSync('.data/qa/api-evidence',{recursive:true});
const secret=existsSync(secretFile)?JSON.parse(readFileSync(secretFile,'utf8')).secret:randomBytes(24).toString('base64url');writeFileSync(secretFile,JSON.stringify({secret,release})+'\n',{mode:0o600});
const logFile='.data/qa/api-evidence/fault-proxy.ndjson';
const previousEvents=existsSync(logFile)?readFileSync(logFile,'utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}}):[];
let rules=[],sequence=previousEvents.reduce((max,e)=>Math.max(max,e.ruleId||e.rule?.id||0),0);
const features=initialSurfaceFeatures();
const record=x=>{const safe={...x};if(safe.path)safe.path=redactFaultPath(safe.path);if(safe.rule?.path)safe.rule={...safe.rule,path:redactFaultPath(safe.rule.path)};appendFileSync(logFile,JSON.stringify({at:new Date().toISOString(),release,...safe})+'\n');};
const answer=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-QA-Release':release});res.end(JSON.stringify(data));};
for(const [surface,port,upstreamPort]of [['h5',5193,5183],['admin',5196,5186]])http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const {isApiRequest,normalized}=classifyFaultRequest(surface,pathname);
 if(pathname==='/__qa/control'){
  const supplied=String(req.headers['x-qa-control']||'');if(req.method!=='POST'||supplied.length!==secret.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(secret))){answer(res,403,{message:'QA control denied'});return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048){answer(res,413,{message:'Control too large'});return;}}
  try{
   const body=JSON.parse(raw);
   if(body.action==='reset')rules=[];
   else if(body.action==='feature'){setSurfaceFeature(features,body);record({event:'surface-feature',feature:body.feature,enabled:body.enabled});}
   else if(body.action==='release'){if(!/^qa-[a-zA-Z0-9-]+$/.test(body.release))throw Error('Invalid release');const manifests=await Promise.all([5183,5186].map(port=>fetch('http://127.0.0.1:'+port+'/__version').then(r=>r.json())));if(manifests.some(m=>m.id!==body.release))throw Error('Both upstream releases must match');release=body.release;writeFileSync(secretFile,JSON.stringify({secret,release})+'\n',{mode:0o600});record({event:'release-labelled'});}
   else if(body.action==='arm'){
    body.path=normalizeFaultPath(body.path);
    if(!isAllowedFaultRule(body))throw Error('Invalid fault rule');
    rules.push({id:++sequence,...body});record({event:'armed',rule:rules.at(-1)});
   }else if(body.action!=='status')throw Error('Invalid action');
   answer(res,200,{release,rules,features});
  }catch(e){answer(res,400,{message:e.message})}return;
 }
 if(serveCacheFixture(req,res,{surface,pathname,features,release})){record({event:'cache-fixture-page',surface,path:pathname,method:req.method,status:res.statusCode});return;}
 const index=isApiRequest?rules.findIndex(r=>r.path===normalized&&(r.method==='*'||r.method===req.method)&&(r.surface==='*'||r.surface===surface)):-1;
 let delayRule;
 if(index>=0){
  const rule=rules[index];if(rule.mode!=='failAlways')rules.splice(index,1);
  if(rule.mode==='delayOnce'){
   delayRule=rule;record({event:'delay-requested',surface,path:normalized,method:req.method,ruleId:rule.id,mode:rule.mode,value:rule.value,forwarded:true});
  }else{
  req.resume();record({event:'injected',surface,path:normalized,method:req.method,ruleId:rule.id,mode:rule.mode,value:rule.value,forwarded:false});
  if(rule.mode==='timeoutOnce'){
   const timer=setTimeout(()=>{if(!res.destroyed)answer(res,504,{code:504,message:'网络连接超时，请重试',msg:'网络连接超时，请重试'})},rule.value);res.on('close',()=>clearTimeout(timer));
  }else answer(res,rule.value,{code:rule.value,message:'服务暂时不可用，请稍后重试',msg:'服务暂时不可用，请稍后重试'});
  return;
  }
 }
 const upstream=http.request({host:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${upstreamPort}`}},response=>{
  if(isApiRequest)record({event:'forwarded',surface,path:normalized,method:req.method,status:response.statusCode,upstreamRelease:response.headers['x-qa-release']||release});
  if(delayRule){pipeDelayed200(response,res,{delayMs:delayRule.value,record,context:{surface,path:normalized,method:req.method,ruleId:delayRule.id,mode:delayRule.mode}});return;}
  const headers=clipboardPolicyHeaders(surface,response.headers,features);
  if(headers!==response.headers)record({event:'clipboard-policy-applied',surface,path:pathname,method:req.method,status:response.statusCode,policy:'clipboard-write=()',bodyUnmodified:true});
  res.writeHead(response.statusCode,headers);response.pipe(res);
 });
 upstream.on('error',()=>{if(!res.headersSent)answer(res,502,{code:502,message:'测试代理上游不可用',msg:'测试代理上游不可用'});else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}).listen(port,'127.0.0.1',()=>console.log(`${release} fault ${surface}: http://127.0.0.1:${port} -> ${upstreamPort}`));
