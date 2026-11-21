import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const origin = process.env.MAOYI_TEST_ORIGIN || 'http://127.0.0.1:8081';
assert.match(origin, /^http:\/\/127\.0\.0\.1:808[124]$/);
const out = '.data/qa/current-review/round25/backend'; mkdirSync(out, {recursive:true});
const config = JSON.parse(readFileSync('.secrets/java-local.json'));
const admin = config.accounts.find(account => account.account === 'admin');
const suffix = randomUUID().slice(0, 8), menus = [], jobs = [], requests = [], checks = [];
const sql = query => execFileSync('mysql', ['--protocol=socket', '-uroot', '--default-character-set=utf8mb4', '--raw', '-N', 'maoyi_ruoyi'], {input:query, encoding:'utf8'}).trim();
let token, failure;
async function call(path, {method='GET', body}={}) {
  const r = await fetch(origin+path, {method, headers:{'content-type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})}, body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(15000)});
  const data=await r.json(), status=typeof data.code==='number'&&data.code>=400?data.code:r.status;
  requests.push({path,method,status,httpStatus:r.status,message:data.msg||data.message}); return {status,data};
}
function check(label, assertion) {try{assertion();checks.push({label,passed:true});}catch(e){checks.push({label,passed:false,message:e.message});}}
try {
  const logged=await call('/api/auth/login',{method:'POST',body:{type:'employee',account:admin.account,password:admin.password}});
  assert.equal(logged.status,200,logged.data.msg||logged.data.message);token=logged.data.token;
  const menu={menuName:'QA25路由'+suffix,parentId:0,orderNum:99,path:'qa25_'+suffix,component:'index',isFrame:'1',isCache:'1',menuType:'C',visible:'1',status:'1',perms:'qa25:test',icon:'#'};
  const invalid=['abc','[]','null','42','"abc"','{"a":1} junk',JSON.stringify({q:'x'.repeat(248)})];
  for(let i=0;i<invalid.length;i++) {
    const name=menu.menuName+'-'+i;
    const result=await call('/system/menu',{method:'POST',body:{...menu,menuName:name,path:menu.path+'_'+i,query:invalid[i]}});
    const id=sql(`SELECT menu_id FROM sys_menu WHERE menu_name='${name}'`);if(id)menus.push(Number(id));
    check('invalid route query rejected without persistence '+i,()=>{assert.ok(result.status>=400&&result.status<500,'status '+result.status);assert.equal(id,'');});
  }
  const valid=JSON.stringify({q:'引号"、中文、&','page':'1'});
  const created=await call('/system/menu',{method:'POST',body:{...menu,query:valid}});assert.equal(created.status,200);
  const id=Number(sql(`SELECT menu_id FROM sys_menu WHERE menu_name='${menu.menuName}'`));menus.push(id);
  const echoed=await call('/system/menu/'+id);
  check('valid JSON query echoes and no validator property leaks',()=>{assert.equal(echoed.data.data.query,valid);assert.equal(echoed.data.data.queryValid,undefined);});
  const rejected=await call('/system/menu',{method:'PUT',body:{...menu,menuId:id,query:'[]'}});
  check('invalid update preserves old route query',()=>{assert.ok(rejected.status>=400&&rejected.status<500);assert.equal(sql(`SELECT query FROM sys_menu WHERE menu_id=${id}`),valid);});

  const job={jobName:'QA25任务'+suffix,jobGroup:'DEFAULT',invokeTarget:'ryTask.ryNoParams()',cronExpression:'0 0 0 1 1 ? 2099',misfirePolicy:'3',concurrent:'1',status:'1'};
  for(const [label,name] of [['blank',' '],['65chars','x'.repeat(65)]]) {
    const result=await call('/monitor/job',{method:'POST',body:{...job,jobName:name}});
    const inserted=sql(`SELECT job_id FROM sys_job WHERE invoke_target='ryTask.ryNoParams()' AND cron_expression='0 0 0 1 1 ? 2099' AND job_name='${name}'`);
    if(inserted)jobs.push(...inserted.split('\n').map(Number));
    check('invalid job name '+label+' rejected before persistence',()=>{assert.ok(result.status>=400&&result.status<500,'status '+result.status);assert.equal(inserted,'');});
  }
} catch(e){failure={name:e.name,message:e.message};}
finally {
  for(const id of menus){assert.ok(Number.isSafeInteger(id)&&id>5004);await call('/system/menu/'+id,{method:'DELETE'});}
  for(const id of jobs){assert.ok(Number.isSafeInteger(id)&&id>3);await call('/monitor/job/'+id,{method:'DELETE'});}
  if(token)await call('/api/auth/logout',{method:'POST',body:{}}).catch(()=>{});
  const cleanup={menuIds:menus,jobIds:jobs,remainingMenus:menus.length?Number(sql(`SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (${menus.join(',')})`)):0,remainingJobs:jobs.length?Number(sql(`SELECT COUNT(*) FROM sys_job WHERE job_id IN (${jobs.join(',')})`)):0};
  const result={at:new Date().toISOString(),release:process.env.QA_RELEASE_ID||'unfrozen',origin,kind:'actual HTTP + SQL; temporary hidden disabled menus and jobs; no UI claim',passed:!failure&&checks.every(x=>x.passed)&&cleanup.remainingMenus===0&&cleanup.remainingJobs===0,checks,requests,failure,cleanup};
  const file=out+'/management-contract-'+(process.env.QA_RELEASE_ID||'unfrozen')+'.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({file,passed:result.passed,checks:checks.length,failed:checks.filter(x=>!x.passed),failure,cleanup}));if(!result.passed)process.exitCode=1;
}
