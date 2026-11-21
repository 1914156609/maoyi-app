// Sequential, bounded upload validation against local QA. No pressure testing.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync,existsSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';

const origin=process.env.MAOYI_TEST_ORIGIN,jar=process.env.QA_CONTRACT_JAR;
if(!/^http:\/\/127\.0\.0\.1:808[12]$/.test(origin||'')||!jar)throw Error('Pin a local QA origin and running Jar');
const account=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.systemAdmin;
assert.equal(account.id,114);
const root=resolve(JSON.parse(readFileSync('.secrets/java-local.json')).env.UPLOAD_PATH);
if(!root.startsWith(resolve('.data')+sep))throw Error('Unexpected QA upload root');
const prefix='QA_R30_LIMIT_'+randomBytes(6).toString('hex'),checks=[],requests=[],owned=[],expectedHashes=new Set();
mkdirSync('.data/qa/current-review/round30',{recursive:true});
writeFileSync('.data/qa/current-review/round30/upload-limits-ownership.json',JSON.stringify({prefix,root,at:new Date().toISOString()},null,2)+'\n');
let token,failure;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=dir=>existsSync(dir)?readdirSync(dir).flatMap(name=>{const path=resolve(dir,name);return statSync(path).isDirectory()?files(path):[path];}):[];
function image(size){
 const bytes=Buffer.alloc(size);
 Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1kAAAAASUVORK5CYII=','base64').copy(bytes);
 expectedHashes.add(hash(bytes));
 return bytes;
}
async function call(label,path,{body,form}={}){
 const r=await fetch(origin+path,{method:'POST',signal:AbortSignal.timeout(30000),headers:{...(!form?{'content-type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:form||JSON.stringify(body||{})});
 const data=await r.json();requests.push({label,path,httpStatus:r.status,code:data.code??null,message:data.msg||data.message});
 return {response:r,data};
}
function noFiles(){assert.equal(files(root).filter(path=>path.includes(prefix)).length,0);}
try{
 const login=await call('login','/api/auth/login',{body:{type:'employee',account:account.account,password:account.password}});
 token=login.data.token;assert.equal(typeof token,'string');
 const bytes=image(10*1024*1024),form=new FormData();
 form.append('file',new Blob([bytes],{type:'image/png'}),prefix+'_exact.png');
 const valid=await call('single-exactly-10MB','/common/upload',{form});assert.equal(valid.data.code,200);
 const profile=valid.data.fileName;assert.match(profile,/^\/profile\/upload\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.png$/);
 const path=resolve(root,profile.slice('/profile/'.length));assert.ok(path.startsWith(root+sep));
 owned.push({path,sha256:hash(bytes)});
 assert.equal(hash(readFileSync(path)),hash(bytes));
 const fetched=await fetch(origin+profile,{signal:AbortSignal.timeout(30000)});
 assert.equal(fetched.status,200);assert.equal(hash(Buffer.from(await fetched.arrayBuffer())),hash(bytes));
 checks.push({name:'exact 10MB allowed, persisted and echoed with identical SHA256',passed:true});
 unlinkSync(path);noFiles();
 for(const [name,sizes,endpoint,field] of [
  ['single-10MB-plus-1',[10*1024*1024+1],'/common/upload','file'],
  ['request-over-20MB',[7*1024*1024,7*1024*1024,7*1024*1024],'/common/uploads','files'],
 ]){
  const oversized=new FormData();sizes.forEach((size,index)=>oversized.append(field,new Blob([image(size)],{type:'image/png'}),prefix+'_'+name+'_'+index+'.png'));
  const result=await call(name,endpoint,{form:oversized});
  assert.equal(result.data.code,400);assert.match(result.data.msg,/[\u4e00-\u9fff]/);
  assert.doesNotMatch(result.data.msg,/java\.|org\.|Exception|Maximum upload|stack|Servlet/i);noFiles();
  checks.push({name:name+' rejected with friendly Chinese 400 and no stored file',passed:true});
 }
}catch(error){failure={name:error.name,message:error.message};}
finally{
 for(const path of files(root).filter(path=>path.split(sep).at(-1).startsWith(prefix+'_'))){
  const sha256=hash(readFileSync(path));
  if(expectedHashes.has(sha256)&&!owned.some(file=>file.path===path))owned.push({path,sha256});
 }
 for(const file of owned)if(existsSync(file.path)){
  if(hash(readFileSync(file.path))!==file.sha256){failure??={name:'CleanupConflict',message:'Owned upload changed externally'};continue;}
  unlinkSync(file.path);
 }
 if(token)try{await call('logout','/api/auth/logout');}catch{failure??={name:'CleanupError',message:'Owned QA logout failed'};}
 const remaining=files(root).filter(path=>path.includes(prefix)).length;
 if(remaining)failure??={name:'CleanupError',message:'Owned upload files remain'};
 mkdirSync('.data/qa/current-review/round30',{recursive:true});
 const result={at:new Date().toISOString(),origin,jarSha256:hash(readFileSync(jar)),kind:'three sequential synthetic upload boundaries, no parallel load',passed:!failure,failure,checks,requests,cleanup:{remainingFiles:remaining,ownedFiles:owned.map(file=>({path:file.path,sha256:file.sha256}))},credentialsStored:false};
 writeFileSync('.data/qa/current-review/round30/upload-limits.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:result.passed,checks:checks.length,remainingFiles:remaining,failure}));
 if(failure)process.exitCode=1;
}
