import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8084';
if(!/^http:\/\/127\.0\.0\.1:808[124]$/.test(origin))throw Error('Local QA origin required');
const database=process.env.MAOYI_REVIEW_DATABASE||'maoyi_ruoyi';if(!/^(maoyi_ruoyi|maoyi_qa_clone_[a-f0-9]{6})$/.test(database))throw Error('Unexpected database');
const release=process.env.QA_RELEASE_ID||'current-review',suffix=randomBytes(3).toString('hex').toUpperCase();
const q=s=>"'"+String(s).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const sql=s=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','-N',database],{input:s,encoding:'utf8'}).trim();
const repo=resolve(process.env.HOME,'.m2/repository');const cv=readdirSync(repo+'/org/springframework/security/spring-security-crypto').sort().at(-1),jv=readdirSync(repo+'/org/springframework/spring-jcl').sort().at(-1);const cp=`${repo}/org/springframework/security/spring-security-crypto/${cv}/spring-security-crypto-${cv}.jar:${repo}/org/springframework/spring-jcl/${jv}/spring-jcl-${jv}.jar`;
const password=randomBytes(12).toString('base64url'),hash=execFileSync('java',['--class-path',cp,'scripts/java/HashPassword.java'],{input:password,encoding:'utf8'}).trim();
const users=[],tokens=[],records=[],checks=[],requests=[];let failure;mkdirSync('.data/qa/current-review',{recursive:true});
const ownership='.secrets/backend-pagination-review-'+suffix+'.json';const save=()=>writeFileSync(ownership,JSON.stringify({database,users,records},null,2)+'\n',{mode:0o600});
async function call(path,{token,method='GET',body}={}){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await r.json();const status=typeof data.code==='number'&&data.code>=400?data.code:r.status;requests.push({path,method,status,httpStatus:r.status,count:data.crafts?.length,total:data.total,hasMore:data.hasMore});return{status,data};}
const sizes=Object.fromEntries(['bodyLength','chest','shoulder','armhole','armholeDecrease','shoulderSlope','bodyRib','neckWidth','frontNeckDepth','frontNeckFlat','backNeckDepth','backNeckFlat','sleeveLength','sleeveCapHeight','sleeveCapWidth','sleeveWidth','sleeveRib','underarmFlat','sleeveCuffWidth','placketWidth','placketLength'].map((key,i)=>[key,i+1]));
const payload={style:'套头',neck:'圆领',sleeve:'长袖',length:'常规',measurementBasis:'flat',calculationVersion:'video-v1',density:30,rowDensity:40,sizes,parts:[]};
const check=(name,fn)=>{fn();checks.push({name,passed:true});};
try{
 for(const lane of ['mine','peer']){const account='qa_pg_'+lane[0]+'_'+suffix.toLowerCase();const id=Number(sql(`INSERT INTO sys_user(dept_id,user_name,nick_name,password,status,del_flag,create_by,create_time) VALUES(103,${q(account)},'分页审查',${q(hash)},'0','0','qa_review',NOW());SELECT LAST_INSERT_ID();`));users.push({id,account,lane});save();sql(`INSERT INTO sys_user_role(user_id,role_id) VALUES(${id},211)`);}
 const stamp=Date.now(),values=[];
 for(let i=0;i<502;i++){const id='GY-20261121-'+suffix+i.toString(16).toUpperCase().padStart(10,'0');const name='分页审查'+suffix+'-'+i;const owner=users[i===501?1:0].id;records.push({id,owner});values.push(`(${q(id)},${owner},${q(name)},'draft',1,${q(JSON.stringify({...payload,name}))},${stamp},${stamp})`);}save();sql('INSERT INTO maoyi_craft(id,owner_id,name,status,version,payload,created_at,updated_at) VALUES '+values.join(','));
 for(const user of users){const r=await call('/api/auth/login',{method:'POST',body:{type:'employee',account:user.account,password}});assert.equal(r.status,200);tokens.push(r.data.token);}
 const token=tokens[0],first=await call('/api/crafts?pageNum=1&pageSize=500',{token}),second=await call('/api/crafts?pageNum=2&pageSize=500',{token});
 check('501 owned crafts are discoverable across two bounded pages',()=>{assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.data.crafts.length,500);assert.equal(second.data.crafts.length,1);assert.equal(first.data.total,501);assert.equal(second.data.total,501);assert.equal(first.data.hasMore,true);assert.equal(second.data.hasMore,false);assert.equal(first.data.pageSize,500);assert.equal(second.data.pageNum,2);});
 const combined=[...first.data.crafts,...second.data.crafts],expected=records.slice(0,501).map(r=>r.id).sort().reverse();
 check('stable id tie breaker avoids duplicate or missing rows with identical timestamps',()=>assert.deepEqual(combined.map(c=>c.id),expected));
 check('all 21 size fields and calculation metadata echo on every row',()=>{for(const c of combined){assert.deepEqual(c.sizes,sizes);assert.equal(c.measurementBasis,'flat');assert.equal(c.calculationVersion,'video-v1');assert.equal(c.ownerId,String(users[0].id));}});
 const legacy=await call('/api/crafts',{token});check('legacy no-query caller retains bounded first page and explicit continuation',()=>{assert.equal(legacy.data.crafts.length,500);assert.equal(legacy.data.total,501);assert.equal(legacy.data.hasMore,true);});
 const smaller=[];for(let pageNum=1;pageNum<=3;pageNum++){const page=await call('/api/crafts?pageNum='+pageNum+'&pageSize=200',{token});assert.equal(page.status,200);smaller.push(...page.data.crafts);assert.equal(page.data.hasMore,pageNum<3);}
 check('custom page size returns the same complete ordered set',()=>assert.deepEqual(smaller.map(c=>c.id),expected));
 const beyond=await call('/api/crafts?pageNum=2147483647&pageSize=500',{token});check('large valid page does not overflow or leak rows',()=>{assert.equal(beyond.status,200);assert.deepEqual(beyond.data.crafts,[]);assert.equal(beyond.data.hasMore,false);assert.equal(beyond.data.total,501);});
 const peer=await call('/api/crafts?pageNum=1&pageSize=500',{token:tokens[1]});check('second account sees only its single owned craft',()=>{assert.equal(peer.data.total,1);assert.deepEqual(peer.data.crafts.map(c=>c.id),[records[501].id]);assert.equal(peer.data.hasMore,false);});
 for(const query of ['pageNum=0','pageNum=-1','pageNum=1.5','pageNum=abc','pageNum=2147483648','pageSize=0','pageSize=-1','pageSize=501','pageSize=abc']){const r=await call('/api/crafts?'+query,{token});check('invalid '+query+' rejected',()=>assert.equal(r.status,400));}
}catch(error){failure={name:error.name,message:error.message};}
finally{
 for(const token of tokens)try{await call('/api/auth/logout',{token,method:'POST',body:{}})}catch{}
 for(const user of users){assert.equal(sql(`SELECT user_name FROM sys_user WHERE user_id=${user.id}`),user.account);sql(`DELETE FROM maoyi_craft WHERE owner_id=${user.id};DELETE FROM sys_user_role WHERE user_id=${user.id};DELETE FROM sys_user_post WHERE user_id=${user.id};DELETE FROM sys_oper_log WHERE oper_name=${q(user.account)};DELETE FROM sys_logininfor WHERE user_name=${q(user.account)};DELETE FROM sys_user WHERE user_id=${user.id}`);}
 const ids=users.map(u=>u.id).join(',');const cleanup={users:users.map(({id})=>id),seededCrafts:records.length,remainingUsers:ids?Number(sql(`SELECT COUNT(*) FROM sys_user WHERE user_id IN (${ids})`)):0,remainingCrafts:ids?Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id IN (${ids})`)):0};const file='.data/qa/current-review/backend-pagination-review.json';writeFileSync(file,JSON.stringify({at:new Date().toISOString(),origin,database,release,kind:'actual local HTTP and SQL; 501+1 owned isolated fixtures; no UI claim',passed:!failure,assertions:checks.length,checks,requests,failure,cleanup},null,2)+'\n');console.log(JSON.stringify({file,passed:!failure,assertions:checks.length,failure,cleanup}));
}
if(failure)process.exitCode=1;
