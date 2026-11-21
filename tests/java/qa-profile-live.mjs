// Run only after coordinated publication; uses the dedicated API QA account, never admin1.
import {retentionSnapshot,compareRetention} from './qa-retention-snapshot.mjs';
import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const release=process.env.QA_RELEASE_ID;if(!['qa-20261118-r16','qa-20261118-r18'].includes(release))throw Error('Explicit authorized frozen release required');
const suffix=release.split('-').at(-1);
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081';
const account=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.api;if(account.id!==106||!/^qa_api_[a-f0-9]{6}$/.test(account.account))throw Error('Unexpected dedicated API account');
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','--raw'],{input:q,encoding:'utf8'}).trim();
const quote=s=>"'"+s.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const readUser=()=>JSON.parse(sql("SELECT JSON_OBJECT('id',user_id,'name',user_name,'nickname',nick_name,'status',status,'delFlag',del_flag,'createTime',DATE_FORMAT(create_time,'%Y-%m-%d %H:%i:%s'),'createTimeEpoch',UNIX_TIMESTAMP(create_time)*1000) FROM sys_user WHERE user_id=106"));
const before=readUser();const beforeRoles=sql('SELECT role_id FROM sys_user_role WHERE user_id=106 ORDER BY role_id');
const retentionBefore=retentionSnapshot();
const requests=[],checks=[];let token,mutated=false;
const check=(label,value)=>{checks.push({label,passed:!!value});assert.ok(value,label)};
async function request(path,{method='GET',body,authenticated=true}={}){
 const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(authenticated&&token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),b=await r.json();
 requests.push({at:new Date().toISOString(),path,method,authenticated:!!(authenticated&&token),httpStatus:r.status,code:b.code??r.status,response:path==='/system/user/profile'?{code:b.code,msg:b.msg,data:b.data?{userId:b.data.userId,nickName:b.data.nickName,createTime:b.data.createTime,status:b.data.status,delFlag:b.data.delFlag,hasDepartment:!!b.data.dept,hasPassword:Object.hasOwn(b.data,'password')}:undefined,roleGroup:b.roleGroup,postGroup:b.postGroup}:undefined});return b;
}
let failure;
try{
 for(const port of [5183,5186])check('fixed preview '+port,(await fetch('http://127.0.0.1:'+port+'/__version').then(r=>r.json())).id===release);
 check('real Java health',(await request('/api/health',{authenticated:false})).backend==='ruoyi-java');
 check('anonymous profile rejected',(await request('/system/user/profile',{authenticated:false})).code===401);
 const logged=await request('/api/auth/login',{method:'POST',authenticated:false,body:{type:'employee',account:account.account,password:account.password}});token=logged.token;check('dedicated API QA login',typeof token==='string');
 let profile=await request('/system/user/profile');check('current DB date',profile.code===200&&profile.data.createTime===before.createTime);check('only authenticated identity',profile.data.userId===106);check('complete department present',!!profile.data.dept);check('password omitted',!Object.hasOwn(profile.data,'password'));
 mutated=true;sql("UPDATE sys_user SET nick_name='QA最新个人资料106' WHERE user_id=106");profile=await request('/system/user/profile');check('fresh persisted nickname despite pre-change session',profile.data.nickName==='QA最新个人资料106');
 sql("UPDATE sys_user SET status='1' WHERE user_id=106");profile=await request('/system/user/profile');check('disabled profile rejected without cached data',profile.code===401&&!profile.data);
 sql("UPDATE sys_user SET status='0',del_flag='2' WHERE user_id=106");profile=await request('/system/user/profile');check('deleted profile rejected without cached data',profile.code===401&&!profile.data);
} catch(e){failure=e;}
finally{
 if(mutated)sql(`UPDATE sys_user SET nick_name=${quote(before.nickname)},status=${quote(before.status)},del_flag=${quote(before.delFlag)} WHERE user_id=106`);
 const finalCheck=(label,value)=>checks.push({label,passed:!!value});
 const restored=readUser();finalCheck('original ordinary fields restored exactly',JSON.stringify(restored)===JSON.stringify(before));finalCheck('role associations unchanged',sql('SELECT role_id FROM sys_user_role WHERE user_id=106 ORDER BY role_id')===beforeRoles);
 if(token){const r=await request('/system/user/profile');finalCheck('restored profile displays correctly',r.code===200&&r.data.nickName===before.nickname);await request('/api/auth/logout',{method:'POST',body:{}});finalCheck('only own test token invalidated',(await request('/system/user/profile')).code===401);}
 const retentionAfter=retentionSnapshot(),retentionChecks=compareRetention(retentionBefore,retentionAfter);for(const [label,passed]of Object.entries(retentionChecks))finalCheck(label,passed);
 const file='.data/qa/api-evidence/'+suffix+'-profile-live.json';writeFileSync(file,JSON.stringify({release,at:new Date().toISOString(),kind:'Actual HTTP and SQL on isolated existing QA106; not UI',origin,checks,requests,before,after:restored,retention:{before:retentionBefore,after:retentionAfter,checks:retentionChecks},scope:'Nickname/status/delFlag temporary SQL test states restored; own login/logout only. No admin1, UI business objects, roles or historical datetimes modified.',limitation:'Missing-user branch additionally covered by compiled isolated controller test; never deleting an existing account for this check',failure:failure?.message},null,2)+'\n');console.log(JSON.stringify({file,checks:checks.length,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,httpRequests:requests.length}));
}
if(failure)throw failure;
if(checks.some(c=>!c.passed))throw Error('Final restoration or retention check failed; inspect captured evidence');
