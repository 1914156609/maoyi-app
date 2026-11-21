// Real HTTP + controlled MySQL row-lock scheduling; touches only newly tracked fixtures.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081',database=process.env.MAOYI_REVIEW_DATABASE||'maoyi_ruoyi';
if(!/^http:\/\/127\.0\.0\.1:808[124]$/.test(origin)||!/^(maoyi_ruoyi|maoyi_qa_clone_[a-f0-9]{6})$/.test(database))throw Error('Local tracked QA environment required');
const expectCycle=process.env.MAOYI_DEPT_EXPECT_CYCLE==='1',release=process.env.QA_RELEASE_ID||'current-review',suffix=randomBytes(3).toString('hex');
const q=s=>"'"+String(s).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const sql=s=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','-N',database],{input:s,encoding:'utf8'}).trim();
const account='qa_dc_'+suffix,password=randomBytes(12).toString('base64url'),repo=resolve(process.env.HOME,'.m2/repository');
const cv=readdirSync(repo+'/org/springframework/security/spring-security-crypto').sort().at(-1),jv=readdirSync(repo+'/org/springframework/spring-jcl').sort().at(-1),cp=`${repo}/org/springframework/security/spring-security-crypto/${cv}/spring-security-crypto-${cv}.jar:${repo}/org/springframework/spring-jcl/${jv}/spring-jcl-${jv}.jar`;
const hash=execFileSync('java',['--class-path',cp,'scripts/java/HashPassword.java'],{input:password,encoding:'utf8'}).trim();
mkdirSync('.data/qa/current-review',{recursive:true});let userId,roleId,token,gate,gateReleased=false;const deptIds=[],checks=[],requests=[],waitSamples=[],pending=[];let baselineParents,finalParents,concurrentResponses,detectedCycle,failure;
const ownership='.secrets/backend-dept-concurrency-'+suffix+'.json';const save=()=>writeFileSync(ownership,JSON.stringify({database,userId,roleId,account,deptIds},null,2)+'\n',{mode:0o600});
async function call(path,{method='GET',body,auth=token}={}){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const data=await r.json();const status=typeof data.code==='number'&&data.code>=400?data.code:r.status;requests.push({path,method,httpStatus:r.status,status,message:data.msg||data.message});return{status,data};}
const check=(name,fn)=>{fn();checks.push({name,passed:true});};const pause=ms=>new Promise(r=>setTimeout(r,ms));
function releaseGate(){if(gate&&!gateReleased){gate.stdin.write('COMMIT;\n');gateReleased=true;}}
try{
 roleId=Number(sql(`INSERT INTO sys_role(role_name,role_key,role_sort,data_scope,status,del_flag,create_by,create_time) VALUES(${q('并发部门审查'+suffix)},${q('qa_dept_concurrency_'+suffix)},99,'1','0','0','qa_dept_review',NOW());SELECT LAST_INSERT_ID();`));save();sql(`INSERT INTO sys_role_menu(role_id,menu_id) VALUES(${roleId},103),(${roleId},1018),(${roleId},1017),(${roleId},1019)`);
 userId=Number(sql(`INSERT INTO sys_user(dept_id,user_name,nick_name,password,status,del_flag,create_by,create_time) VALUES(103,${q(account)},'部门并发审查',${q(hash)},'0','0','qa_dept_review',NOW());SELECT LAST_INSERT_ID();`));save();sql(`INSERT INTO sys_user_role(user_id,role_id) VALUES(${userId},${roleId})`);
 const login=await call('/api/auth/login',{method:'POST',auth:'',body:{type:'employee',account,password}});assert.equal(login.status,200);token=login.data.token;
 const ancestors=sql('SELECT ancestors FROM sys_dept WHERE dept_id=103')+',103';
 for(const lane of ['A','B']){const id=Number(sql(`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(103,${q(ancestors)},${q('并发审查'+suffix+lane)},1,'1','0','qa_dept_review',NOW());SELECT LAST_INSERT_ID();`));deptIds.push(id);save();}
 const parents=()=>sql(`SELECT dept_id,parent_id,ancestors,status FROM sys_dept WHERE dept_id IN (${deptIds.join(',')}) ORDER BY dept_id`).split('\n').map(row=>{const [id,parentId,ancestors,status]=row.split('\t');return{id:Number(id),parentId:Number(parentId),ancestors,status};});baselineParents=parents();
 gate=spawn('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','--unbuffered','-N',database],{stdio:['pipe','pipe','pipe']});let output='',gateError='';gate.stdout.setEncoding('utf8');gate.stderr.setEncoding('utf8');gate.stdout.on('data',data=>{output+=data});gate.stderr.on('data',data=>{gateError+=data});
 gate.stdin.write(`START TRANSACTION;SELECT dept_id FROM sys_dept WHERE dept_id IN (${deptIds.join(',')}) ORDER BY dept_id FOR UPDATE;SELECT 'REVIEW_LOCKED';\n`);
 const gateDeadline=Date.now()+5000;while(!output.includes('REVIEW_LOCKED')&&Date.now()<gateDeadline)await pause(25);assert.ok(output.includes('REVIEW_LOCKED'),'SQL gate did not acquire fixture locks: '+gateError);
 const operations=deptIds.map((id,index)=>call('/system/dept',{method:'PUT',body:{deptId:id,parentId:deptIds[1-index],deptName:'并发审查'+suffix+(index===0?'A':'B'),orderNum:1,status:'1'}}));
 pending.push(...operations);
 const blockedDeadline=Date.now()+10000;let blocked=0;
 while(Date.now()<blockedDeadline){blocked=Number(sql("SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_state='LOCK WAIT' AND trx_query LIKE '%sys_dept%'"));waitSamples.push({at:new Date().toISOString(),blockedDepartmentWriters:blocked});if(blocked>=2)break;await pause(100);}
 check('both HTTP department writers reached controlled lock wait',()=>assert.ok(blocked>=2));releaseGate();concurrentResponses=await Promise.all(operations);finalParents=parents();detectedCycle=finalParents[0].parentId===deptIds[1]&&finalParents[1].parentId===deptIds[0];
 if(expectCycle){check('baseline permits both mutually conflicting reparent requests',()=>assert.deepEqual(concurrentResponses.map(r=>r.status),[200,200]));check('baseline cycle persisted in real MySQL',()=>assert.equal(detectedCycle,true));}
 else{check('serialized reparent accepts exactly one and rejects the stale parent chain',()=>{assert.equal(concurrentResponses.filter(r=>r.status===200).length,1);assert.equal(concurrentResponses.filter(r=>r.status>=400).length,1)});check('no two-node cycle persisted',()=>assert.equal(detectedCycle,false));check('surviving hierarchy has canonical ancestors',()=>{const moved=finalParents.find(d=>d.parentId!==103),root=finalParents.find(d=>d.parentId===103);assert.ok(moved&&root);assert.equal(root.ancestors,ancestors);assert.equal(moved.ancestors,ancestors+','+root.id);});}
 if(!expectCycle){
  const parentId=Number(sql(`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(103,${q(ancestors)},${q('插删审查'+suffix)},1,'0','0','qa_dept_review',NOW());SELECT LAST_INSERT_ID();`));deptIds.push(parentId);save();
  gateReleased=false;gate.stdin.write(`START TRANSACTION;SELECT dept_id FROM sys_dept WHERE dept_id=${parentId} FOR UPDATE;SELECT 'REVIEW_LOCKED_INSERT_DELETE';\n`);
  const readyUntil=Date.now()+5000;while(!output.includes('REVIEW_LOCKED_INSERT_DELETE')&&Date.now()<readyUntil)await pause(25);assert.ok(output.includes('REVIEW_LOCKED_INSERT_DELETE'));
  const childName='插删子审查'+suffix,createChild=call('/system/dept',{method:'POST',body:{parentId,deptName:childName,orderNum:1,status:'0'}}),deleteParent=call('/system/dept/'+parentId,{method:'DELETE'});
  pending.push(createChild,deleteParent);
  let waiting=0;const waitUntil=Date.now()+10000;while(Date.now()<waitUntil){waiting=Number(sql("SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_state='LOCK WAIT' AND trx_query LIKE '%sys_dept%'"));waitSamples.push({at:new Date().toISOString(),phase:'insert-delete',blockedDepartmentWriters:waiting});if(waiting>=2)break;await pause(100);}
  check('insert and delete participate in controlled tree-lock queue',()=>assert.ok(waiting>=2));releaseGate();const pair=await Promise.all([createChild,deleteParent]);
  const childIds=sql(`SELECT dept_id FROM sys_dept WHERE parent_id=${parentId} AND dept_name=${q(childName)} AND create_by=${q(account)}`).split('\n').filter(Boolean).map(Number);deptIds.push(...childIds);save();
  const deletionFlag=sql(`SELECT del_flag FROM sys_dept WHERE dept_id=${parentId}`),activeChildren=Number(sql(`SELECT COUNT(*) FROM sys_dept WHERE parent_id=${parentId} AND del_flag='0'`));
  check('concurrent insert/delete accepts exactly one without orphaning a child',()=>{assert.equal(pair.filter(r=>r.status===200).length,1);assert.equal(pair.filter(r=>r.status>=400).length,1);assert.ok(deletionFlag==='0'&&activeChildren===1||deletionFlag==='2'&&activeChildren===0);});
  const root=finalParents.find(d=>d.parentId===103),index=root.id===deptIds[0]?0:1;
  const subsequent=await call('/system/dept',{method:'PUT',body:{deptId:root.id,parentId:103,deptName:'并发审查'+suffix+(index===0?'A':'B'),orderNum:1,status:'1'}});
  check('tree lock is released for the next independent mutation',()=>assert.equal(subsequent.status,200));
 }
}catch(error){failure={name:error.name,message:error.message};}
finally{
 releaseGate();await Promise.allSettled(pending);if(gate){gate.stdin.end();await new Promise(resolve=>{if(gate.exitCode!==null)return resolve();gate.once('exit',resolve);setTimeout(()=>{gate.kill('SIGTERM');resolve()},2000)});}
 if(token)try{await call('/api/auth/logout',{method:'POST',body:{}})}catch{}
 if(userId){const created=sql(`SELECT dept_id FROM sys_dept WHERE create_by=${q(account)}`).split('\n').filter(Boolean).map(Number);for(const id of created)if(!deptIds.includes(id))deptIds.push(id);save();}
 if(deptIds.length)sql(`DELETE FROM sys_dept WHERE dept_id IN (${deptIds.join(',')}) AND create_by IN ('qa_dept_review',${q(account)})`);
 if(userId){assert.equal(sql(`SELECT user_name FROM sys_user WHERE user_id=${userId}`),account);sql(`DELETE FROM sys_user_role WHERE user_id=${userId};DELETE FROM sys_user_post WHERE user_id=${userId};DELETE FROM sys_oper_log WHERE oper_name=${q(account)};DELETE FROM sys_logininfor WHERE user_name=${q(account)};DELETE FROM sys_user WHERE user_id=${userId}`);}
 if(roleId)sql(`DELETE FROM sys_role_menu WHERE role_id=${roleId};DELETE FROM sys_role_dept WHERE role_id=${roleId};DELETE FROM sys_role WHERE role_id=${roleId}`);
 const cleanup={userId,roleId,deptIds,remainingUsers:userId?Number(sql(`SELECT COUNT(*) FROM sys_user WHERE user_id=${userId}`)):0,remainingRoles:roleId?Number(sql(`SELECT COUNT(*) FROM sys_role WHERE role_id=${roleId}`)):0,remainingDepartments:deptIds.length?Number(sql(`SELECT COUNT(*) FROM sys_dept WHERE dept_id IN (${deptIds.join(',')})`)):0};
 const file='.data/qa/current-review/backend-dept-concurrency-'+(expectCycle?'before':'after')+'.json';writeFileSync(file,JSON.stringify({at:new Date().toISOString(),release,origin,database,kind:'real local HTTP and controlled MySQL row-lock scheduling; only newly created tracked department/account/role fixtures',expectCycle,passed:!failure,assertions:checks.length,checks,baselineParents,finalParents,detectedCycle,responses:concurrentResponses?.map(({status,data})=>({status,message:data.msg||data.message})),requests,waitSamples,failure,cleanup},null,2)+'\n');console.log(JSON.stringify({file,passed:!failure,expectCycle,assertions:checks.length,detectedCycle,statuses:concurrentResponses?.map(r=>r.status),failure,cleanup}));
}
if(failure)process.exitCode=1;
