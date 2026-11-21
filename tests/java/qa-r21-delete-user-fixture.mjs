// Exact local QA fixture preparation. No UI action, login, or deletion is performed.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {retentionSnapshot,compareRetention} from './qa-retention-snapshot.mjs';
const release='qa-20261121-r21',account='qa_delete_211121',nickname='QA独立删除20261121';
const credentialFile='.secrets/qa-delete-user-211121.json';
const evidenceFile='.data/qa/api-evidence/r21-resume-delete-user-fixture.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v,secret=false)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{mode:secret?0o600:0o644});
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','-r'],{input:q,encoding:'utf8'}).trim();
const quote=s=>"'"+String(s).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const hash=v=>createHash('sha256').update(v).digest('hex');
const redis=(...args)=>execFileSync('redis-cli',['-p','6388','--raw',...args],{encoding:'utf8'}).trim();
const currentSessions=()=>Object.fromEntries(redis('--scan','--pattern','login_tokens:*').split('\n').filter(Boolean).map(k=>[k,hash(redis('GET',k))]));
const before=retentionSnapshot(),sessionsBefore=currentSessions();
const protectedUsersBefore=hash(sql('SELECT * FROM sys_user WHERE user_id IN(103,107,113,114) ORDER BY user_id'));
const original=read('.secrets/qa-r21-suite-before.json').snapshot;
const versions={};for(const port of[5183,5186]){const v=await fetch('http://127.0.0.1:'+port+'/__version').then(r=>r.json());assert.equal(v.id,release);versions[port]=v.id;}
const healthResponse=await fetch('http://127.0.0.1:8081/api/health');const health=await healthResponse.json();assert.equal(healthResponse.status,200);assert.equal(health.ok,true);
const javaPid=Number(execFileSync('lsof',['-tiTCP:8081','-sTCP:LISTEN'],{encoding:'utf8'}).trim());
const javaCommand=execFileSync('ps',['-p',String(javaPid),'-o','command='],{encoding:'utf8'});
const jarPath='.data/qa/releases/'+release+'/ruoyi-admin.jar';assert.ok(javaCommand.includes(resolve(jarPath))||javaCommand.includes(jarPath));
const jarSha=hash(fs.readFileSync(jarPath));assert.equal(jarSha,'ba39a78c04377d5b68efa8b21d427c9a3b9d73e2436103109b6cb5a459719bc5');
const user113=JSON.parse(sql("SELECT JSON_OBJECT('id',user_id,'status',status,'deleted',del_flag,'roles',(SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE user_id=113)) FROM sys_user WHERE user_id=113"));
assert.equal(user113.status,'0');assert.equal(user113.roles,'211');
const lifecycleCount=Number(sql("SELECT COUNT(*) FROM sys_user WHERE user_name='qa_lifecycle_211121'"));assert.equal(lifecycleCount,0);
assert.equal(before.craftCount,24);assert.equal(before.shareCount,17);const chartCount=Number(sql('SELECT COUNT(*) FROM maoyi_chart WHERE owner_id IN(103,104)'));assert.equal(chartCount,1);
assert.ok(Object.values(compareRetention(original,before)).every(Boolean));
const existing=sql('SELECT user_id FROM sys_user WHERE user_name='+quote(account));
let state,created=false;
if(existing){
  assert.ok(fs.existsSync(credentialFile),'Existing same-name account is not owned by this fixture; refuse mutation');state=read(credentialFile);assert.equal(String(state.id),existing);assert.equal(state.account,account);
}else{
  assert.equal(fs.existsSync(credentialFile),false,'Private manifest already exists; review before any recreation');
  const password=randomBytes(15).toString('base64url');
  const repo=resolve(process.env.HOME,'.m2/repository');
  const cv=fs.readdirSync(repo+'/org/springframework/security/spring-security-crypto').sort().at(-1),jv=fs.readdirSync(repo+'/org/springframework/spring-jcl').sort().at(-1);
  const cp=`${repo}/org/springframework/security/spring-security-crypto/${cv}/spring-security-crypto-${cv}.jar:${repo}/org/springframework/spring-jcl/${jv}/spring-jcl-${jv}.jar`;
  const passwordHash=execFileSync('java',['--class-path',cp,'scripts/java/HashPassword.java'],{input:password,encoding:'utf8'}).trim();
  state={release,createdAt:new Date().toISOString(),account,nickname,password,id:null,kind:'SQL fixture only; never a UI create/reset result',beforeAccountRows:0};write(credentialFile,state,true);
  const id=Number(sql(`INSERT INTO sys_user(dept_id,user_name,nick_name,password,status,del_flag,create_by,create_time,remark) VALUES(NULL,${quote(account)},${quote(nickname)},${quote(passwordHash)},'0','0','qa_fixture',NOW(),'R21 A-USER06 independent delete fixture; no roles or business data');SELECT LAST_INSERT_ID();`));
  assert.ok(Number.isSafeInteger(id)&&id>114);state.id=id;write(credentialFile,state,true);created=true;
}
const id=state.id;
const row=JSON.parse(sql(`SELECT JSON_OBJECT('id',user_id,'account',user_name,'nickname',nick_name,'status',status,'deleted',del_flag,'departmentId',dept_id,'createdAt',create_time) FROM sys_user WHERE user_id=${id}`));
const associations=JSON.parse(sql(`SELECT JSON_OBJECT('roles',(SELECT COUNT(*) FROM sys_user_role WHERE user_id=${id}),'posts',(SELECT COUNT(*) FROM sys_user_post WHERE user_id=${id}),'crafts',(SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${id}),'shares',(SELECT COUNT(*) FROM maoyi_share WHERE owner_id=${id}),'charts',(SELECT COUNT(*) FROM maoyi_chart WHERE owner_id=${id}),'members',(SELECT COUNT(*) FROM maoyi_member WHERE user_id=${id}))`));
assert.ok(Object.values(associations).every(n=>n===0));assert.equal(row.account,account);assert.equal(row.nickname,nickname);assert.equal(row.status,'0');assert.equal(row.deleted,'0');
const after=retentionSnapshot(),sessionsAfter=currentSessions();
const checks={...compareRetention(before,after),protected103107113114UsersUnchanged:protectedUsersBefore===hash(sql('SELECT * FROM sys_user WHERE user_id IN(103,107,113,114) ORDER BY user_id')),preexistingSessionKeysAndValuesUnchanged:Object.entries(sessionsBefore).every(([k,v])=>sessionsAfter[k]===v),noNewSession:Object.keys(sessionsBefore).length===Object.keys(sessionsAfter).length,noRoleOrBusinessAssociations:Object.values(associations).every(n=>n===0)};
assert.ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
const evidence={release,at:new Date().toISOString(),kind:'Readonly fixed-runtime/retention check plus exact SQL fixture preparation; no real UI result',runtime:{javaPid,jarPath,jarSha256:jarSha,frontendVersions:versions,health},retained:{crafts:24,shares:17,charts:chartCount,user113,unsubmittedLifecycleAccountRows:lifecycleCount},fixture:{...row,createdNow:created,associations,privateCredentialFile:credentialFile,privatePasswordKey:'password',loginPerformed:false,deletePerformed:false},checks,cleanup:{authorization:'No permanent delete authorization yet; root will request confirmation for this exact ID before actual UI delete',scope:{table:'sys_user',id,account},state:'retained for actual A-USER06 UI delete',method:'Official UI logical delete; verify del_flag2 and roles/posts/business remain0. Do not touch QA103/107/113/114.'}};
write(evidenceFile,evidence);
const patchPath='.data/qa/api-result-patch.json',patch=read(patchPath);patch.at=evidence.at;patch.incrementalReadbacks??=[];patch.incrementalReadbacks.push({at:evidence.at,release,evidence:evidenceFile,scope:'Fixed runtime and retained data recheck plus isolated deletion precondition; no repeated suite or new UI pass'});write(patchPath,patch);
const cleanupPath='.data/qa/api-cleanup-plan.json',cleanup=read(cleanupPath);cleanup.at=evidence.at;cleanup.exactDeleteUserFixture={id,account,state:'pending actual UI delete and user confirmation',evidence:evidenceFile};write(cleanupPath,cleanup);
console.log(JSON.stringify({evidence:evidenceFile,release,fixture:{id,account,nickname,status:row.status,associations,privateCredentialFile:credentialFile},checks}));
