import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {selectOwnedSessionKeys} from './qa-session-metadata.mjs';
process.chdir(resolve(import.meta.dirname,'../..'));
const file='.secrets/qa-accounts.json';
const command=process.argv[2]||'setup';
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'});
const quote=s=>"'"+String(s).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const save=data=>writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
if(command==='setup'){
 if(existsSync(file)){console.log('QA accounts already tracked; credentials preserved.');process.exit(0)}
 const suffix=randomBytes(3).toString('hex'),runId='qa-'+new Date().toISOString().slice(0,10)+'-'+suffix;
 const state={runId,createdAt:new Date().toISOString(),accounts:{}};
 const repo=resolve(process.env.HOME,'.m2/repository');
 const cv=readdirSync(repo+'/org/springframework/security/spring-security-crypto').sort().at(-1),jv=readdirSync(repo+'/org/springframework/spring-jcl').sort().at(-1);
 const cp=`${repo}/org/springframework/security/spring-security-crypto/${cv}/spring-security-crypto-${cv}.jar:${repo}/org/springframework/spring-jcl/${jv}/spring-jcl-${jv}.jar`;
 mkdirSync('.secrets',{recursive:true,mode:0o700});save(state);
 for(const [lane,role,name] of [['user',211,'验收工艺员'],['adminOwner',211,'验收管理样单'],['admin',212,'验收主管'],['api',211,'验收接口员'],['peer',211,'验收隔离账号'],['disabled',211,'验收停用账号'],['limit',211,'验收限流账号'],['revoked',212,'验收权限账号']]){
  const account='qa_'+({noManagement:'nomgr',systemAdmin:'sysadmin'}[lane]||lane.toLowerCase())+'_'+suffix,password=randomBytes(15).toString('base64url');
  const hash=execFileSync('java',['--class-path',cp,'scripts/java/HashPassword.java'],{input:password,encoding:'utf8'}).trim();
  const id=Number(sql(`INSERT INTO sys_user(dept_id,user_name,nick_name,password,status,del_flag,create_by,create_time) VALUES(103,${quote(account)},${quote(name)},${quote(hash)},'0','0','qa',NOW());SELECT LAST_INSERT_ID();`).trim());
  state.accounts[lane]={id,account,name,password,role};save(state);
  sql(`INSERT INTO sys_user_role(user_id,role_id) VALUES(${id},${role});`);
 }
 mkdirSync('.data/qa',{recursive:true});
 writeFileSync('.data/qa/accounts-public.json',JSON.stringify({runId,accounts:Object.fromEntries(Object.entries(state.accounts).map(([k,{password,...a}])=>[k,a]))},null,2)+'\n');
 console.log('Created eight isolated QA accounts. Secrets: .secrets/qa-accounts.json; public role/id manifest: .data/qa/accounts-public.json.');
}else if(command==='extend-admin'){
 if(!existsSync(file))throw Error('Set up QA run first');
 const state=JSON.parse(readFileSync(file,'utf8')),suffix=state.runId.split('-').at(-1);
 const repo=resolve(process.env.HOME,'.m2/repository');
 const cv=readdirSync(repo+'/org/springframework/security/spring-security-crypto').sort().at(-1),jv=readdirSync(repo+'/org/springframework/spring-jcl').sort().at(-1);
 const cp=`${repo}/org/springframework/security/spring-security-crypto/${cv}/spring-security-crypto-${cv}.jar:${repo}/org/springframework/spring-jcl/${jv}/spring-jcl-${jv}.jar`;
 state.roles ||= [];
 for(const [lane,name,menus] of [['craftRead','验收工艺只读',[5000,5001]],['shareRead','验收分享只读',[5000,5003]],['noManagement','验收无管理权限',null],['systemAdmin','验收系统管理','all']]){
  if(state.accounts[lane])continue;
  let role=211;
  if(menus){
   const roleKey='qa_'+lane.toLowerCase()+'_'+suffix;
   role=Number(sql(`INSERT INTO sys_role(role_name,role_key,role_sort,data_scope,status,del_flag,create_by,create_time) VALUES(${quote(name)},${quote(roleKey)},90,'1','0','0','qa',NOW());SELECT LAST_INSERT_ID();`).trim());
   state.roles.push({id:role,key:roleKey});save(state);
   for(const menu of menus==='all'?sql('SELECT menu_id FROM sys_menu').trim().split('\n').map(Number):menus)sql(`INSERT INTO sys_role_menu(role_id,menu_id) VALUES(${role},${menu});`);
  }
  const account='qa_'+({noManagement:'nomgr',systemAdmin:'sysadmin'}[lane]||lane.toLowerCase())+'_'+suffix,password=randomBytes(15).toString('base64url');
  const hash=execFileSync('java',['--class-path',cp,'scripts/java/HashPassword.java'],{input:password,encoding:'utf8'}).trim();
  const id=Number(sql(`INSERT INTO sys_user(dept_id,user_name,nick_name,password,status,del_flag,create_by,create_time) VALUES(103,${quote(account)},${quote(name)},${quote(hash)},'0','0','qa',NOW());SELECT LAST_INSERT_ID();`).trim());
  state.accounts[lane]={id,account,name,password,role};save(state);sql(`INSERT INTO sys_user_role(user_id,role_id) VALUES(${id},${role});`);
 }
 writeFileSync('.data/qa/accounts-public.json',JSON.stringify({runId:state.runId,accounts:Object.fromEntries(Object.entries(state.accounts).map(([k,{password,...a}])=>[k,a]))},null,2)+'\n');
 console.log('Prepared isolated management-permission QA accounts; secrets preserved in the QA credentials file.');
}else if(command==='inspect'){
 if(!existsSync(file))throw Error('No tracked QA run');
 const state=JSON.parse(readFileSync(file,'utf8'));
 const ids=Object.values(state.accounts).map(a=>a.id).join(',');
 console.log(sql(`SELECT u.user_id,u.user_name,c.id,c.name,c.status,c.version FROM sys_user u LEFT JOIN maoyi_craft c ON c.owner_id=u.user_id WHERE u.user_id IN (${ids}) ORDER BY u.user_id,c.created_at;`));
}else if(command==='cleanup'){
 if(!existsSync(file)){
  if(existsSync('.secrets/qa-system-data.json'))throw Error('System fixtures exist without QA account ownership manifest; stop for review');
  console.log('No QA run to clean.');process.exit(0);
 }
 const state=JSON.parse(readFileSync(file,'utf8'));
 for(const a of Object.values(state.accounts)){
  if(!Number.isSafeInteger(a.id)||!/^qa_[a-z]+_[0-9a-f]{6}$/.test(a.account))throw Error('Invalid QA tracking data');
  const name=sql(`SELECT user_name FROM sys_user WHERE user_id=${a.id}`).trim();
  if(name&&name!==a.account)throw Error('QA account ownership changed');
 }
 for(const role of state.roles||[]){
  const key=sql(`SELECT role_key FROM sys_role WHERE role_id=${Number(role.id)}`).trim();
  if(key&&key!==role.key)throw Error('QA role ownership changed');
  const trackedIds=Object.values(state.accounts).map(a=>a.id).join(',');
  if(Number(sql(`SELECT COUNT(*) FROM sys_user_role WHERE role_id=${Number(role.id)} AND user_id NOT IN (${trackedIds})`).trim()))throw Error('QA role is linked to a non-QA user; stop before any cleanup');
 }
 // Fail closed before the first mutation if any live session owner cannot be parsed.
 const trackedIds=new Set(Object.values(state.accounts).map(a=>a.id));
 const sessionKeys=execFileSync('redis-cli',['-p','6388','--raw','--scan','--pattern','login_tokens:*'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const records=sessionKeys.map(key=>({key,raw:execFileSync('redis-cli',['-p','6388','--raw','GET',key],{encoding:'utf8'}).trim()})).filter(r=>r.raw);
 const ownedSessionKeys=selectOwnedSessionKeys(records,trackedIds);
 if(existsSync('.secrets/qa-system-data.json'))execFileSync('node',['tests/java/qa-cleanup-system.mjs'],{stdio:'inherit',env:process.env});
 const ids=Object.values(state.accounts).map(a=>a.id).join(',');
 const names=[...Object.values(state.accounts).map(a=>a.account),...(state.previousAccountNames||[])].map(quote).join(',');
 sql(`START TRANSACTION;
 DELETE FROM maoyi_share WHERE craft_id IN (SELECT id FROM maoyi_craft WHERE owner_id IN (${ids}));
 DELETE FROM maoyi_audit WHERE craft_id IN (SELECT id FROM maoyi_craft WHERE owner_id IN (${ids}));
 DELETE FROM maoyi_chart WHERE owner_id IN (${ids});
 DELETE FROM maoyi_craft WHERE owner_id IN (${ids});
 DELETE FROM maoyi_member WHERE user_id IN (${ids});
 DELETE FROM sys_user_role WHERE user_id IN (${ids});DELETE FROM sys_user_post WHERE user_id IN (${ids});
 DELETE FROM sys_oper_log WHERE oper_name IN (${names});DELETE FROM sys_logininfor WHERE user_name IN (${names});
 DELETE FROM sys_user WHERE user_id IN (${ids});
 ${(state.roles||[]).map(r=>`DELETE FROM sys_role_menu WHERE role_id=${r.id};DELETE FROM sys_role_dept WHERE role_id=${r.id};DELETE FROM sys_role WHERE role_id=${r.id};`).join('\n')}
 COMMIT;`);
 for(const key of ownedSessionKeys)execFileSync('redis-cli',['-p','6388','DEL',key],{stdio:'ignore'});
 for(const a of Object.values(state.accounts)){
  for(let window=Math.floor(Date.now()/900000)-1;window<=Math.floor(Date.now()/900000);window++){
   for(const key of ['account:'+a.account.toLowerCase(),'share:'+a.id]){
    const slot='maoyi:rate:'+createHash('sha256').update(key+':'+window).digest('hex');execFileSync('redis-cli',['-p','6388','DEL',slot],{stdio:'ignore'});
   }
  }
  execFileSync('redis-cli',['-p','6388','DEL','pwd_err_cnt:'+a.account],{stdio:'ignore'});
 }
 writeFileSync('.data/qa/api-evidence/cleanup.json',JSON.stringify({runId:state.runId,at:new Date().toISOString(),accountIds:[...trackedIds],remainingCrafts:Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id IN (${ids})`).trim()),remainingAccounts:Number(sql(`SELECT COUNT(*) FROM sys_user WHERE user_id IN (${ids})`).trim())},null,2)+'\n');
 for(const fixtureFile of ['.secrets/qa-admin-data.json','.secrets/qa-user-data.json']){
  if(existsSync(fixtureFile)&&JSON.parse(readFileSync(fixtureFile,'utf8')).runId===state.runId)unlinkSync(fixtureFile);
 }
 unlinkSync(file);console.log('Removed only tracked QA accounts, their objects and sessions; cleanup evidence saved.');
}else throw Error('Expected setup, extend-admin, inspect or cleanup');
