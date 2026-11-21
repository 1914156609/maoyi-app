// Authorized fixed-release proof on dedicated QA106. Never uses or invalidates UI sessions.
import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import assert from'node:assert/strict';import{randomBytes}from'node:crypto';
const invalidPassword='qa-invalid-'+randomBytes(8).toString('hex');
const release=process.env.QA_RELEASE_ID;if(!['qa-20261118-r18','qa-20261118-r19'].includes(release))throw Error('Explicit authorized publication required');const suffix=release.split('-').at(-1);
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081';if(origin!=='http://127.0.0.1:8081')throw Error('Only authorized loopback Java');
const account=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.api;if(account.id!==106||!/^qa_api_[a-f0-9]{6}$/.test(account.account))throw Error('Dedicated API identity mismatch');
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','--raw'],{input:q,encoding:'utf8'}).trim();
const before=Number(sql('SELECT COALESCE(MAX(info_id),0) FROM sys_logininfor'));
const audits=()=>{const text=sql(`SELECT JSON_OBJECT('id',info_id,'account',user_name,'status',status,'ip',ipaddr,'browser',browser,'os',os,'message',msg,'at',DATE_FORMAT(login_time,'%Y-%m-%d %H:%i:%s')) FROM sys_logininfor WHERE info_id>${before} AND user_name='${account.account}' ORDER BY info_id`);return text?text.split('\n').map(JSON.parse):[];};
const requests=[],checks=[],stages=[];let token,failure,rows=[],statusMutated=false,auditCursor=before;
const originalStatus=sql('SELECT status FROM sys_user WHERE user_id=106');if(originalStatus!=='0')throw Error('QA106 must begin enabled');
// Preserve only this independently owned test identity's transient authentication counters.
const redis=(...args)=>execFileSync('redis-cli',['-p','6388',...args],{encoding:'utf8'}).trim();
const passwordKeys=[account.account,account.account.toUpperCase()].map(a=>'pwd_err_cnt:'+a);
const passwordState=passwordKeys.map(key=>({key,value:redis('GET',key),ttl:Number(redis('PTTL',key)),at:Date.now()}));
const check=(name,value)=>{checks.push({name,passed:!!value});assert.ok(value,name)};
async function waitOneAudit(stage,status){
 let emitted=[];for(let n=0;n<40;n++){emitted=audits().filter(r=>r.id>auditCursor);if(emitted.length)break;await new Promise(r=>setTimeout(r,100));}
 check(stage+' emits exactly one audit before next login',emitted.length===1);
 check(stage+' audit status correct',emitted[0].status===status);
 stages.push({stage,observedAt:new Date().toISOString(),requestIndex:requests.length-1,audit:emitted[0]});auditCursor=emitted[0].id;
}
async function call(path,{body,authenticated=false}={}){const method=body===undefined?'GET':'POST';const response=await fetch(origin+path,{method,headers:{'content-type':'application/json','user-agent':'Mozilla/5.0 (QA employee audit R18) Chrome/120.0.0.0 Safari/537.36',...(authenticated&&token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();requests.push({at:new Date().toISOString(),method,path,httpStatus:response.status,applicationCode:typeof data.code==='number'?data.code:response.status,authenticated,userId:data.user?.id,hasToken:typeof data.token==='string'});return {response,data};}
try{
 for(const port of[5183,5186])check('fixed preview '+port,(await fetch('http://127.0.0.1:'+port+'/__version').then(r=>r.json())).id===release);
 const wrong=await call('/api/auth/login',{body:{type:'employee',account:account.account,password:invalidPassword}});check('wrong password rejected',wrong.response.status===401||wrong.data.code===401);check('failure has no token',!wrong.data.token);
 if(suffix==='r19'){
  await waitOneAudit('valid-format wrong password','1');
  const pre=await call('/api/auth/login',{body:{type:'employee',account:account.account,password:'x'}});check('preCheck failure rejected',pre.response.status===401||pre.data.code===401);
  await waitOneAudit('preCheck short password','1');
  statusMutated=true;sql("UPDATE sys_user SET status='1' WHERE user_id=106");const disabled=await call('/api/auth/login',{body:{type:'employee',account:account.account,password:account.password}});check('disabled account rejected',disabled.response.status===401||disabled.data.code===401);check('disabled failure no token',!disabled.data.token);await waitOneAudit('disabled account','1');sql("UPDATE sys_user SET status='0' WHERE user_id=106");statusMutated=false;
 }
 const success=await call('/api/auth/login',{body:{type:'employee',account:account.account.toUpperCase(),password:account.password}});token=success.data.token;check('success returns real token',success.response.status===200&&typeof token==='string');check('success identity is dedicated106',success.data.user?.id==='106');
 if(suffix==='r19')await waitOneAudit('canonical successful account','0');
 const me=await call('/api/auth/me',{authenticated:true});check('new session authenticates106',me.data.user?.id==='106');
 const expectedFailures=suffix==='r19'?3:1;
 for(let n=0;n<30;n++){rows=audits();if(rows.filter(r=>r.status==='0'&&r.message==='登录成功').length===1&&rows.filter(r=>r.status==='1').length===expectedFailures)break;await new Promise(r=>setTimeout(r,100));}
 check('exactly one success audit',rows.filter(r=>r.status==='0'&&r.message==='登录成功').length===1);
 check('each failure audited once including existing preCheck',rows.filter(r=>r.status==='1').length===expectedFailures);
 check('only expected login audits',rows.length===expectedFailures+1);
 check('authenticated canonical account recorded',rows.find(r=>r.status==='0')?.account===account.account);
 check('request loopback source recorded',rows.every(r=>r.ip==='127.0.0.1'));
 check('request browser parsed',rows.every(r=>/^Chrome(?:\s|$)/.test(r.browser)));
 const text=JSON.stringify(rows);check('audit excludes credentials',![account.password,token,invalidPassword].some(s=>text.includes(s)));
}catch(e){failure=e;}
finally{
 if(statusMutated)sql("UPDATE sys_user SET status='0' WHERE user_id=106");
 if(token){await call('/api/auth/logout',{authenticated:true,body:{}});const after=await call('/api/auth/me',{authenticated:true});checks.push({name:'only own test token revoked',passed:after.response.status===401||after.data.code===401});}
 for(const state of passwordState){const remaining=state.ttl-(Date.now()-state.at);if(state.ttl===-2||state.ttl>=0&&remaining<=0)redis('DEL',state.key);else if(state.ttl===-1)redis('SET',state.key,state.value);else redis('SET',state.key,state.value,'PX',String(remaining));}
 checks.push({name:'QA106 original status restored',passed:sql('SELECT status FROM sys_user WHERE user_id=106')===originalStatus});
 const file='.data/qa/api-evidence/'+suffix+'-employee-audit-live.json';writeFileSync(file,JSON.stringify({release,at:new Date().toISOString(),kind:'Actual Java HTTP and SQL on isolated existing QA106; not UI',origin,accountId:106,auditWatermark:before,audits:rows,stages,requests,checks,cleanup:{businessObjectsCreated:0,ownTokenLoggedOut:!!token,ownPasswordRetryCountersRestored:true,auditRowsRetained:rows.map(r=>r.id),reason:'Real audit evidence retained; no general log cleanup authorized'},scope:'No admin1/user103/systemAdmin114 tokens, credentials, profiles or fixtures accessed or modified. Public artifacts exclude all credentials.',failure:failure?.message},null,2)+'\n');console.log(JSON.stringify({file,checks:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,auditIds:rows.map(r=>r.id),httpRequests:requests.length}));
}
if(failure)throw failure;if(checks.some(c=>!c.passed))throw Error('Audit or cleanup check failed');
