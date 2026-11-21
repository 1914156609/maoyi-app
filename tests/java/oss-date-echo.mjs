// Read-only date contract checks against exact QA user 114 after a framework upgrade.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const origin=process.env.MAOYI_TEST_ORIGIN;
if(!/^http:\/\/127\.0\.0\.1:808[12]$/.test(origin||''))throw Error('Explicit local QA origin required');
const jar=process.env.QA_CONTRACT_JAR;
if(!jar)throw Error('Pin the actual running QA Jar');
const account=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.systemAdmin;
assert.equal(account.id,114);
const checks=[],requests=[];
let token,failure,dateFixture;
const sql=input=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','--raw','-N','maoyi_ruoyi'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
async function call(path,body){
 const r=await fetch(origin+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 const data=await r.json();
 requests.push({path,httpStatus:r.status,applicationCode:typeof data.code==='number'?data.code:null});
 assert.equal(r.status,200);assert.ok(data.code===undefined||data.code===200);
 return data;
}
try{
 const login=await call('/api/auth/login',{type:'employee',account:account.account,password:account.password});
 token=login.token;assert.equal(typeof token,'string');
 const original=JSON.parse(sql("SELECT JSON_OBJECT('date',DATE_FORMAT(pwd_update_date,'%Y-%m-%d %H:%i:%s')) FROM sys_user WHERE user_id=114"));
 if(original.date===null){
  dateFixture={userId:114,original:null,value:'2026-11-20 12:34:56',restored:false};
  mkdirSync('.data/qa/current-review/round30',{recursive:true});
  writeFileSync('.data/qa/current-review/round30/date-fixture.json',JSON.stringify(dateFixture,null,2)+'\n');
  sql("UPDATE sys_user SET pwd_update_date='2026-11-20 12:34:56' WHERE user_id=114 AND pwd_update_date IS NULL");
 }
 const paths=[['/getInfo','user'],['/system/user/profile','data'],['/system/user/114','data']];
 for(const [path,key] of paths){
  const data=await call(path),user=data[key];assert.equal(Number(user.userId),114);assert.equal(user.password,undefined);
  const expected=JSON.parse(sql("SELECT JSON_OBJECT('createTime',DATE_FORMAT(create_time,'%Y-%m-%d %H:%i:%s'),'updateTime',DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s'),'loginDate',DATE_FORMAT(login_date,'%Y-%m-%d %H:%i:%s'),'pwdUpdateEpoch',UNIX_TIMESTAMP(pwd_update_date)*1000) FROM sys_user WHERE user_id=114"));
  for(const field of ['createTime','updateTime','loginDate']){
   assert.equal(user[field]??null,expected[field],path+' '+field+' must match persisted wall time');
   checks.push({path,field,passed:true,format:'yyyy-MM-dd HH:mm:ss or null',value:user[field]??null});
  }
  if(expected.pwdUpdateEpoch!==null){
   assert.equal(typeof user.pwdUpdateDate,'string');
   assert.equal(Date.parse(user.pwdUpdateDate),Number(expected.pwdUpdateEpoch),path+' password update timestamp must preserve the DB instant');
   checks.push({path,field:'pwdUpdateDate',passed:true,format:'ISO string preserves DB epoch',value:user.pwdUpdateDate});
  }
 }
}catch(error){
 failure={name:error.name,message:error.message};
}finally{
 if(dateFixture)try{
  assert.equal(sql("SELECT DATE_FORMAT(pwd_update_date,'%Y-%m-%d %H:%i:%s') FROM sys_user WHERE user_id=114"),dateFixture.value,'Owned date fixture changed externally; abort restoration');
  sql("UPDATE sys_user SET pwd_update_date=NULL WHERE user_id=114 AND pwd_update_date='2026-11-20 12:34:56'");
  dateFixture.restored=sql('SELECT pwd_update_date IS NULL FROM sys_user WHERE user_id=114')==='1';
  assert.ok(dateFixture.restored);writeFileSync('.data/qa/current-review/round30/date-fixture.json',JSON.stringify(dateFixture,null,2)+'\n');
 }catch(error){failure??={name:error.name,message:error.message};}
 if(token)try{await call('/api/auth/logout',{});}catch(error){failure??={name:error.name,message:'QA session logout failed'};}
 mkdirSync('.data/qa/current-review/round30',{recursive:true});
 writeFileSync('.data/qa/current-review/round30/date-echo.json',JSON.stringify({at:new Date().toISOString(),origin,jarSha256:createHash('sha256').update(readFileSync(jar)).digest('hex'),kind:'actual local HTTP plus MySQL date comparison; exact QA fixture only',passed:!failure,failure,checks,requests,dateFixture,databaseWrites:'Normal QA login date; a null password-date field receives a tracked timestamp fixture and is restored exactly',credentialsStored:false},null,2)+'\n');
}
console.log(JSON.stringify({checks:checks.length,passed:!failure,requests:requests.length,failure}));
if(failure)process.exitCode=1;
