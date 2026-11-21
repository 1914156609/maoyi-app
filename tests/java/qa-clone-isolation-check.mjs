import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const c=JSON.parse(readFileSync('.secrets/qa-clone.json')),qa=JSON.parse(readFileSync('.secrets/qa-accounts.json'));
const sql=(q,db)=>execFileSync('mysql',['--protocol=socket','-uroot',db,'-N'],{input:q,encoding:'utf8'}).trim();
const key='qa.clone.identity.'+c.runId.split('-').at(-1);
assert.match(c.database,/^maoyi_qa_clone_[a-f0-9]{6}$/);assert.equal(c.redisPort,6390);assert.equal(c.apiPort,8082);
assert.equal(sql(`SELECT COUNT(*) FROM sys_config WHERE config_key='${key}'`,'maoyi_ruoyi'),'0');
if(sql(`SELECT COUNT(*) FROM sys_config WHERE config_key='${key}'`,c.database)==='0')sql(`INSERT INTO sys_config(config_name,config_key,config_value,config_type,create_by,create_time) VALUES('QA clone marker','${key}','${c.runId}','N','qa',NOW())`,c.database);
async function req(origin,path,token,method='GET',body){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),data=await r.json();return {status:typeof data.code==='number'&&data.code>=400?data.code:r.status,data}}
const clone='http://127.0.0.1:8082',primary='http://127.0.0.1:8081',a=qa.accounts.systemAdmin;
const health=await req(clone,'/api/health');assert.equal(health.status,200);
const logged=await req(clone,'/api/auth/login',null,'POST',{type:'employee',account:a.account,password:a.password});assert.equal(logged.status,200);const token=logged.data.token;
try{
 const marker=await req(clone,'/system/config/configKey/'+key,token);assert.equal(marker.status,200);assert.ok(JSON.stringify(marker.data).includes(c.runId));
 const cache=await req(clone,'/monitor/cache',token);assert.equal(cache.status,200);assert.equal(String(cache.data.data.info.tcp_port),'6390');
 const foreign=await req(primary,'/api/auth/me',token);assert.equal(foreign.status,401);
 const frontend=await req('http://127.0.0.1:5197','/__version');assert.equal(frontend.data.environment,'isolated-clone');assert.equal(frontend.data.api,clone);assert.equal(frontend.data.id,c.release);
 const forwarded=await req('http://127.0.0.1:5197','/prod-api/system/config/configKey/'+key,token);assert.ok(JSON.stringify(forwarded.data).includes(c.runId));
 const result={runId:c.runId,release:c.release,at:new Date().toISOString(),adminOrigin:'http://127.0.0.1:5197',apiOrigin:clone,database:c.database,observedRedisPort:cache.data.data.info.tcp_port,isolatedMarkerObservedThroughJava:true,isolatedMarkerObservedThroughAdminProxy:true,primaryMarkerCount:0,primaryRejectsCloneJwt:foreign.status,allCloneJobsDisabled:sql("SELECT COUNT(*) FROM sys_job WHERE status!='1'",c.database)==='0',result:'隔离前置自动化验证通过；真实清空页面操作尚未执行'};
 assert.equal(result.allCloneJobsDisabled,true);writeFileSync('.data/qa/api-evidence/clone-isolation.json',JSON.stringify(result,null,2)+'\n');
 writeFileSync('.data/qa/clone-handoff.json',JSON.stringify({...result,javaStarted:true,credentials:'读取 .secrets/qa-accounts.json systemAdmin，需在5197真实登录，不得复用5186页面会话。',restriction:'只有5197→8082→本克隆数据库/Redis6390允许执行全局清空；正常5186/8081/Redis6388禁止。'},null,2)+'\n');
 console.log('Verified clone Java8082 DB marker, Redis6390, independent JWT and admin5197 proxy.');
}finally{await req(clone,'/api/auth/logout',token,'POST',{})}
