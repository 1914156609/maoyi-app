// Isolated, tracked HTTP + SQL regression. No production URL is accepted.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081';
if(!/^http:\/\/127\.0\.0\.1:808[124]$/.test(origin))throw Error('Review regression accepts local QA ports only');
const database=process.env.MAOYI_REVIEW_DATABASE||'maoyi_ruoyi';
if(!/^(maoyi_ruoyi|maoyi_qa_clone_[a-f0-9]{6})$/.test(database))throw Error('Unexpected local QA database');
const release=process.env.QA_RELEASE_ID||'current-review',suffix=randomBytes(3).toString('hex');
const account='qa_rev_'+suffix,password=randomBytes(12).toString('base64url'),adminResetPassword=randomBytes(12).toString('base64url'),newPassword=randomBytes(12).toString('base64url');
const out='.data/qa/current-review';mkdirSync(out,{recursive:true});
const ownership='.secrets/backend-live-review-'+suffix+'.json';
const q=s=>"'"+String(s).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const sql=s=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','-N',database],{input:s,encoding:'utf8'}).trim();
const repo=resolve(process.env.HOME,'.m2/repository');
const cv=readdirSync(repo+'/org/springframework/security/spring-security-crypto').sort().at(-1),jv=readdirSync(repo+'/org/springframework/spring-jcl').sort().at(-1);
const cp=`${repo}/org/springframework/security/spring-security-crypto/${cv}/spring-security-crypto-${cv}.jar:${repo}/org/springframework/spring-jcl/${jv}/spring-jcl-${jv}.jar`;
const hash=raw=>execFileSync('java',['--class-path',cp,'scripts/java/HashPassword.java'],{input:raw,encoding:'utf8'}).trim();
const checks=[],requests=[],timings=[],tokens=[];let userId,roleId,tableId,cleaned=false;const deptIds=[];
const save=()=>writeFileSync(ownership,JSON.stringify({database,account,userId,roleId,tableId,deptIds,createdAt:new Date().toISOString(),cleaned},null,2)+'\n',{mode:0o600});
async function call(path,{token,method='GET',body}={}){
 const started=performance.now();const r=await fetch(origin+path,{method,signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();const ms=performance.now()-started;
 const status=typeof data.code==='number'&&data.code>=400?data.code:r.status;
 requests.push({path,method,authenticated:!!token,httpStatus:r.status,status,ms:Number(ms.toFixed(2)),message:data.msg||data.message});return {status,data};
}
async function login(raw=password){const result=await call('/api/auth/login',{method:'POST',body:{type:'employee',account,password:raw}});assert.equal(result.status,200);tokens.push(result.data.token);return result.data.token;}
function check(name,fn){fn();checks.push({name,passed:true});}
function snapshot(){return sql(`SELECT CONCAT_WS('|',password,status,del_flag,IFNULL(dept_id,''),avatar,remark,nick_name,email,phonenumber,sex) FROM sys_user WHERE user_id=${userId}`);}
let failure;
try{
 check('health remains anonymous',(await call('/api/health')).status===200?()=>{}:()=>assert.fail('health'));
 check('captcha remains anonymous',(await call('/captchaImage')).status===200?()=>{}:()=>assert.fail('captcha'));
 const initialHash=hash(password),resetHash=hash(adminResetPassword);
 roleId=Number(sql(`INSERT INTO sys_role(role_name,role_key,role_sort,data_scope,status,del_flag,create_by,create_time) VALUES(${q('回归审查'+suffix)},${q('qa_review_'+suffix)},99,'1','0','0','qa_review',NOW());SELECT LAST_INSERT_ID();`));save();
 sql(`INSERT INTO sys_role_menu(role_id,menu_id) VALUES(${roleId},5001),(${roleId},116),(${roleId},103),(${roleId},1018);`);
 userId=Number(sql(`INSERT INTO sys_user(dept_id,user_name,nick_name,password,status,del_flag,email,phonenumber,sex,create_by,create_time) VALUES(103,${q(account)},'审查原昵称',${q(initialHash)},'0','0',${q(suffix+'@example.com')},'', '0','qa_review',NOW());SELECT LAST_INSERT_ID();`));save();
 sql(`INSERT INTO sys_user_role(user_id,role_id) VALUES(${userId},${roleId});`);
 tableId=Number(sql(`INSERT INTO gen_table(table_name,table_comment,class_name,create_by,create_time) VALUES(${q('qa_review_'+suffix)},'审查临时表','QaReview','qa_review',NOW());SELECT LAST_INSERT_ID();`));save();
 sql(`INSERT INTO gen_table_column(table_id,column_name,column_comment,column_type,java_type,java_field,is_pk,sort) VALUES(${tableId},'review_id','审查字段','bigint','Long','reviewId','1',1);`);
 let token=await login();
 check('authorized role initially accepted',(await call('/maoyi/craft/list',{token})).status===200?()=>{}:()=>assert.fail('initial permission'));
 const columns=await call('/tool/gen/column/'+tableId,{token});check('generator binds path tableId and returns matching field',()=>{assert.equal(columns.status,200);assert.equal(columns.data.total,1);assert.equal(columns.data.rows[0].columnName,'review_id');assert.equal(Number(columns.data.rows[0].tableId),tableId);});
 sql(`UPDATE sys_user SET password=${q(resetHash)},dept_id=104,avatar='/profile/review-protected.png',remark='管理员更新应保留' WHERE user_id=${userId}`);
 const profile={nickName:'审查新昵称',email:suffix+'-profile@example.com',phonenumber:'139'+String(userId).padStart(8,'0').slice(-8),sex:'1',userId:1,deptId:200,status:'1',password:'injected',avatar:'/profile/injected.png',remark:'injected'};
 const valid=await call('/system/user/profile',{token,method:'PUT',body:profile});
 check('valid profile update accepted',()=>assert.equal(valid.status,200));
 const protectedFields=sql(`SELECT password,dept_id,status,avatar,remark FROM sys_user WHERE user_id=${userId}`).split('\t');
 check('SQL readback preserves administrator password, department, status, avatar and remark',()=>assert.deepEqual(protectedFields,[resetHash,'104','0','/profile/review-protected.png','管理员更新应保留']));
 const stored=await call('/system/user/profile',{token});check('profile fields echo persisted values without password',()=>{assert.equal(stored.data.data.nickName,profile.nickName);assert.equal(stored.data.data.email,profile.email);assert.equal(stored.data.data.phonenumber,profile.phonenumber);assert.equal(stored.data.data.sex,profile.sex);assert.equal(stored.data.data.password,undefined);});
 const originalParent=sql('SELECT ancestors FROM sys_dept WHERE dept_id=103'),targetParent=sql('SELECT ancestors FROM sys_dept WHERE dept_id=104');
 const parentDept=Number(sql(`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(103,${q(originalParent+',103')},${q('审查部门'+suffix)},1,'0','0','qa_review',NOW());SELECT LAST_INSERT_ID();`));deptIds.push(parentDept);save();
 const childDept=Number(sql(`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(${parentDept},${q(originalParent+',103,'+parentDept)},${q('审查子部门'+suffix)},1,'0','0','qa_review',NOW());SELECT LAST_INSERT_ID();`));deptIds.push(childDept);save();
 const deletedParent=Number(sql(`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(103,${q(originalParent+',103')},${q('审查已删部门'+suffix)},1,'0','2','qa_review',NOW());SELECT LAST_INSERT_ID();`));deptIds.push(deletedParent);save();
 const hierarchy=()=>sql(`SELECT dept_id,parent_id,ancestors,status FROM sys_dept WHERE dept_id IN (${deptIds.join(',')}) ORDER BY dept_id`);
 const initialHierarchy=hierarchy(),deptInput={deptId:parentDept,parentId:104,deptName:'审查部门'+suffix,orderNum:1,status:'0',ancestors:'injected'};
 for(const [label,parentId]of [['self',parentDept],['descendant',childDept],['missing',999999999],['deleted',deletedParent]]){const changed=await call('/system/dept',{token,method:'PUT',body:{...deptInput,parentId}});check('department '+label+' parent is rejected without hierarchy mutation',()=>{assert.ok(changed.status>=400);assert.equal(hierarchy(),initialHierarchy);});}
 const moved=await call('/system/dept',{token,method:'PUT',body:deptInput});check('valid department move updates both canonical root and descendant ancestors',()=>{assert.equal(moved.status,200);assert.equal(sql(`SELECT ancestors FROM sys_dept WHERE dept_id=${parentDept}`),targetParent+',104');assert.equal(sql(`SELECT ancestors FROM sys_dept WHERE dept_id=${childDept}`),targetParent+',104,'+parentDept);});
 const movedHierarchy=hierarchy(),failedMove=await call('/system/dept',{token,method:'PUT',body:{...deptInput,parentId:105,status:'xx'}});check('failed multi-step department update rolls all ancestor changes back',()=>{assert.ok(failedMove.status>=400);assert.equal(hierarchy(),movedHierarchy);});
 const before=snapshot();
 for(const [label,patch]of [['empty nickname',{nickName:' '}],['nickname31',{nickName:'x'.repeat(31)}],['bad email',{email:'bad'}],['bad phone',{phonenumber:'1|123456789'}],['bad sex',{sex:'9'}]]){
  const invalid=await call('/system/user/profile',{token,method:'PUT',body:{...profile,...patch}});check('reject '+label+' with no database mutation',()=>{assert.ok(invalid.status>=400);assert.equal(snapshot(),before);});
 }
 for(const invalid of ['x','x'.repeat(21),'Valid<123']){const result=await call('/system/user/profile/updatePwd',{token,method:'PUT',body:{oldPassword:adminResetPassword,newPassword:invalid}});check('reject new password length '+invalid.length+' before persistence',()=>{assert.ok(result.status>=400);assert.equal(snapshot(),before);});}
 const absent=await call('/system/user/profile/updatePwd',{token,method:'PUT',body:{newPassword}});check('missing old password rejected without mutation',()=>{assert.ok(absent.status>=400);assert.equal(snapshot(),before);});
 const changed=await call('/system/user/profile/updatePwd',{token,method:'PUT',body:{oldPassword:adminResetPassword,newPassword}});check('change password uses current administrator reset hash',()=>assert.equal(changed.status,200));
 token=await login(newPassword);check('new password can authenticate',()=>assert.ok(token));
 sql(`DELETE FROM sys_user_role WHERE user_id=${userId} AND role_id=${roleId}`);
 check('role revocation denies old token immediately without getInfo',(await call('/maoyi/craft/list',{token})).status===403?()=>{}:()=>assert.fail('revoked role still allowed'));
 sql(`INSERT INTO sys_user_role(user_id,role_id) VALUES(${userId},${roleId});UPDATE sys_role SET status='1' WHERE role_id=${roleId};`);
 check('disabled role denies old token immediately',(await call('/maoyi/craft/list',{token})).status===403?()=>{}:()=>assert.fail('disabled role still allowed'));
 sql(`UPDATE sys_role SET status='0' WHERE role_id=${roleId}`);
 for(let i=0;i<20;i++){const started=performance.now();assert.equal((await call('/maoyi/craft/list',{token})).status,200);timings.push(performance.now()-started);}
 check('20 sequential permission-protected requests succeed',()=>assert.equal(timings.length,20));
 sql(`UPDATE sys_user SET status='1' WHERE user_id=${userId}`);
 check('disabled account cannot use system endpoint',(await call('/system/user/profile',{token})).status===401?()=>{}:()=>assert.fail('disabled session'));
 const disabledSnapshot=snapshot(),disabledWrite=await call('/system/user/profile',{token,method:'PUT',body:profile});check('disabled old token cannot restore own status through profile',()=>{assert.equal(disabledWrite.status,401);assert.equal(snapshot(),disabledSnapshot);});
 sql(`UPDATE sys_user SET status='0' WHERE user_id=${userId}`);
 check('re-enable does not resurrect revoked token',(await call('/maoyi/craft/list',{token})).status===401?()=>{}:()=>assert.fail('revoked token resurrected'));
 token=await login(newPassword);sql(`UPDATE sys_user SET del_flag='2' WHERE user_id=${userId}`);
 check('deleted account immediately loses old token',(await call('/maoyi/craft/list',{token})).status===401?()=>{}:()=>assert.fail('deleted session'));
}catch(error){failure={name:error.name,message:error.message};}
finally{
 for(const token of tokens)try{await call('/api/auth/logout',{token,method:'POST',body:{}})}catch{}
 if(userId){assert.equal(sql(`SELECT user_name FROM sys_user WHERE user_id=${userId}`),account);sql(`DELETE FROM sys_user_role WHERE user_id=${userId};DELETE FROM sys_user_post WHERE user_id=${userId};DELETE FROM sys_oper_log WHERE oper_name=${q(account)};DELETE FROM sys_logininfor WHERE user_name=${q(account)};DELETE FROM sys_user WHERE user_id=${userId}`);}
 if(roleId)sql(`DELETE FROM sys_role_menu WHERE role_id=${roleId};DELETE FROM sys_role_dept WHERE role_id=${roleId};DELETE FROM sys_role WHERE role_id=${roleId}`);
 if(deptIds.length)sql(`DELETE FROM sys_dept WHERE dept_id IN (${deptIds.join(',')}) AND create_by='qa_review'`);
 if(tableId)sql(`DELETE FROM gen_table_column WHERE table_id=${tableId};DELETE FROM gen_table WHERE table_id=${tableId}`);
 cleaned=true;save();
 const sorted=[...timings].sort((a,b)=>a-b),perf=timings.length?{samples:timings.length,meanMs:Number((timings.reduce((a,b)=>a+b)/timings.length).toFixed(2)),p95Ms:Number(sorted[Math.ceil(sorted.length*.95)-1].toFixed(2)),maxMs:Number(sorted.at(-1).toFixed(2)),scope:'local sequential HTTP after warm-up; includes SQL, Redis and handler work; not load testing'}:undefined;
 const result={at:new Date().toISOString(),release,origin,database,kind:'actual local HTTP requests and SQL readback; no UI claim',passed:!failure,assertions:checks.length,checks,requests,performance:perf,failure,cleanup:{cleaned,userId,roleId,tableId,deptIds,remainingDepartments:deptIds.length?Number(sql(`SELECT COUNT(*) FROM sys_dept WHERE dept_id IN (${deptIds.join(',')})`)):0,remainingUsers:userId?Number(sql(`SELECT COUNT(*) FROM sys_user WHERE user_id=${userId}`)):0,remainingRoles:roleId?Number(sql(`SELECT COUNT(*) FROM sys_role WHERE role_id=${roleId}`)):0,remainingGeneratorTables:tableId?Number(sql(`SELECT COUNT(*) FROM gen_table WHERE table_id=${tableId}`)):0}};
 writeFileSync(out+'/backend-live-review.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file:out+'/backend-live-review.json',passed:result.passed,assertions:checks.length,performance:perf,failure,cleanup:result.cleanup}));
}
if(failure)process.exitCode=1;
