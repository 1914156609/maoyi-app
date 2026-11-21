// Explicit QA-only CRUD field probe, outside node:test glob. No shared seed,
// global cache refresh, role/password changes, or direct SQL writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';

const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081',release=process.env.QA_RELEASE_ID||'qa-20261121-r31';
if(!/^http:\/\/127\.0\.0\.1:808[12]$/.test(origin)||!/^qa-[a-zA-Z0-9-]+$/.test(release))throw Error('Explicit local QA origin/release required');
const expectedJar=process.env.QA_SYSTEM_EXPECTED_SHA||'b4ce91d6442db7ff9dc419ed56ae2668b23a6cab8e19285cb7361f98e1b1f062';
const jar=process.env.QA_SYSTEM_JAR||'.data/qa/releases/'+release+'/ruoyi-admin.jar';
const previewRelease=process.env.QA_PREVIEW_EXPECTED_RELEASE||release;
const runDirectory=process.env.QA_SYSTEM_CRUD_RUN||'';if(runDirectory&&!/^[a-zA-Z0-9_-]+$/.test(runDirectory))throw Error('Use a unique child evidence directory name');
const out=resolve('.data/qa/current-review/round30/system-crud',runDirectory);mkdirSync(out,{recursive:true});
if(existsSync(resolve(out,'report.json')))throw Error('Preserve completed CRUD evidence before another explicit run');
const suffix=randomBytes(4).toString('hex'),prefix='QA_R31_'+suffix;
const own={prefix,postIds:[],configIds:[],dictIds:[],dataIds:[],configKeys:['qa.r31.'+suffix+'.a','qa.r31.'+suffix+'.b'],dictTypes:['qa_r31_'+suffix+'_a','qa_r31_'+suffix+'_b'],intents:[]};
const persist=()=>writeFileSync(resolve(out,'ownership.json'),JSON.stringify(own,null,2)+'\n',{mode:0o600});persist();
const requests=[],database=[],checks=[],failures=[],cleanup={};let token;
const operator=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.systemAdmin;
if(operator.id!==114||!/^qa_/.test(operator.account))throw Error('Only independent QA114 is permitted');
const q=value=>value===null?'NULL':`CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
function sql(query,label){
 if(!/^SELECT\b/i.test(query.trim()))throw Error('Read-only SQL only');
 const value=execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','--raw','-N','maoyi_ruoyi'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 database.push({at:new Date().toISOString(),label,query,result:value});return value;
}
const sources=[
 'ruoyi-system/src/main/java/com/ruoyi/system/domain/SysPost.java','ruoyi-system/src/main/java/com/ruoyi/system/domain/SysConfig.java',
 'ruoyi-common/src/main/java/com/ruoyi/common/core/domain/entity/SysDictType.java','ruoyi-common/src/main/java/com/ruoyi/common/core/domain/entity/SysDictData.java',
 ...['SysPost','SysConfig','SysDictType','SysDictData'].flatMap(name=>['ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/'+name+'Controller.java','ruoyi-system/src/main/resources/mapper/system/'+name+'Mapper.xml','ruoyi-system/src/main/java/com/ruoyi/system/service/impl/'+name+'ServiceImpl.java'])
].map(path=>'../maoyi-backend/'+path);
const contracts={sources:sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),rules:{post:{required:['postCode','postName','postSort'],max:{postCode:64,postName:50},unique:['postCode','postName']},config:{required:['configName','configKey','configValue'],max:{configName:100,configKey:100,configValue:500},unique:['configKey']},dictType:{required:['dictName','dictType'],max:{dictName:100,dictType:100},pattern:'^[a-z][a-z0-9_]*$',unique:['dictType']},dictData:{required:['dictLabel','dictValue','dictType'],max:{dictLabel:100,dictValue:100,dictType:100,cssClass:100},unique:['dictType+dictValue'],derived:'default === (isDefault === Y)'}},notes:['Duplicate/business guards use existing AjaxResult code500, not rawHTTP500.','No invented enum/remark/listClass/sort constraints beyond existing annotations. Valid UI enums only.','Post/dictType/dictData selectVo omits update_by/update_time; verify form fields and create audit inHTTP, update audit separately inSQL.']};
writeFileSync(resolve(out,'source-contracts.json'),JSON.stringify(contracts,null,2)+'\n');
function check(name,ok,details){checks.push({name,passed:Boolean(ok),...(details?{details}:{})});return Boolean(ok);}
async function scenario(name,fn){try{await fn();}catch(error){failures.push({name,message:error.message.slice(0,300)});}}
function intent(entity,body,label){own.intents.push({entity,body,label,at:new Date().toISOString()});persist();}
function safe(value,key=''){
 if(/token|password|cookie/i.test(key))return '[redacted]';
 if(Array.isArray(value))return value.map(v=>safe(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,safe(v,k)]));
 return value;
}
async function call(label,path,{method='GET',body,anonymous=false}={}){
 const r=await fetch(origin+path,{method,signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...(!anonymous&&token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json(),code=typeof data.code==='number'?data.code:null;
 requests.push({at:new Date().toISOString(),label,path,method,request:safe(body),httpStatus:r.status,contentType:r.headers.get('content-type'),applicationCode:code,response:safe(data)});
 writeFileSync(resolve(out,'requests.partial.json'),JSON.stringify(requests,null,2)+'\n');return {httpStatus:r.status,code,data};
}
const spec={
 post:{path:'/system/post',table:'sys_post',id:'postId',column:'post_id',owned:'postIds',fields:{postCode:'post_code',postName:'post_name',postSort:'post_sort',status:'status',remark:'remark'}},
 config:{path:'/system/config',table:'sys_config',id:'configId',column:'config_id',owned:'configIds',fields:{configName:'config_name',configKey:'config_key',configValue:'config_value',configType:'config_type',remark:'remark'}},
 type:{path:'/system/dict/type',table:'sys_dict_type',id:'dictId',column:'dict_id',owned:'dictIds',fields:{dictName:'dict_name',dictType:'dict_type',status:'status',remark:'remark'}},
 data:{path:'/system/dict/data',table:'sys_dict_data',id:'dictCode',column:'dict_code',owned:'dataIds',fields:{dictSort:'dict_sort',dictLabel:'dict_label',dictValue:'dict_value',dictType:'dict_type',cssClass:'css_class',listClass:'list_class',isDefault:'is_default',status:'status',remark:'remark'}}
};
function scopedWhere(entity){
 if(entity==='data')return 'dict_type IN ('+own.dictTypes.map(q).join(',')+')';
 if(entity==='config')return 'config_key IN ('+own.configKeys.map(q).join(',')+')';
 if(entity==='type')return 'dict_type IN ('+own.dictTypes.map(q).join(',')+')';
 return `LEFT(post_code,${prefix.length})=${q(prefix)} OR LEFT(post_name,${prefix.length})=${q(prefix)}`;
}
function recover(entity){
 const s=spec[entity],ids=sql(`SELECT ${s.column} FROM ${s.table} WHERE ${scopedWhere(entity)} ORDER BY ${s.column}`,'recover owned '+entity).split('\n').filter(Boolean).map(Number);
 for(const id of ids){if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid owned ID');if(!own[s.owned].includes(id))own[s.owned].push(id);}persist();return ids;
}
function row(entity,id){
 const s=spec[entity];if(!own[s.owned].includes(id))throw Error('Untracked SQL row');
 const columns={[s.id]:s.column,...s.fields,createBy:'create_by',createTime:'create_time',updateBy:'update_by',updateTime:'update_time'};
 const fields=Object.entries(columns).map(([key,column])=>`${q(key)},${/Time$/.test(key)?`DATE_FORMAT(${column},'%Y-%m-%d %H:%i:%s')`:column}`).join(',');
 const value=sql(`SELECT JSON_OBJECT(${fields}) FROM ${s.table} WHERE ${s.column}=${id}`,'row '+entity+' '+id);return value?JSON.parse(value):null;
}
function snapshot(entity){return sql(`SELECT COALESCE(JSON_ARRAYAGG(t.row_data),JSON_ARRAY()) FROM (SELECT JSON_OBJECT('id',${spec[entity].column},'row',JSON_OBJECT(${Object.entries(spec[entity].fields).map(([k,v])=>q(k)+','+v).join(',')})) row_data FROM ${spec[entity].table} WHERE ${scopedWhere(entity)} ORDER BY ${spec[entity].column}) t`,'before/after scoped '+entity);}
async function create(entity,body,label){
 intent(entity,body,label);const before=recover(entity),r=await call(label,spec[entity].path,{method:'POST',body}),after=recover(entity),added=after.filter(id=>!before.includes(id));
 if(!check(label+' success one row',r.code===200&&added.length===1))throw Error('Create did not produce one owned '+entity+' row');return added[0];
}
async function verify(entity,id,expected,label){
 const r=await call(label+' detail',spec[entity].path+'/'+id),stored=row(entity,id),value=r.data.data;
 check(label+' detail success',r.code===200&&value&&stored);
 if(!value||!stored)return;
 check(label+' numeric ID',typeof value[spec[entity].id]==='number'&&value[spec[entity].id]===id);
 for(const key of Object.keys(spec[entity].fields)){check(label+' '+key+' SQL echo',Object.is(value[key],stored[key]),{http:value[key],sql:stored[key]});if(Object.hasOwn(expected,key))check(label+' '+key+' requested value',Object.is(value[key],expected[key]),{expected:expected[key],actual:value[key]});}
 if(entity==='data')check(label+' derived default boolean',value.default===(value.isDefault==='Y'));
 if(entity==='post')check(label+' derived flag false',value.flag===false);
 check(label+' create audit',value.createBy===operator.account&&typeof value.createTime==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.createTime));
 if(stored.updateBy)check(label+' SQL update audit',stored.updateBy===operator.account&&typeof stored.updateTime==='string');
 const query=entity==='post'?{postCode:expected.postCode}:entity==='config'?{configKey:expected.configKey}:entity==='type'?{dictType:expected.dictType}:{dictType:expected.dictType};
 const list=await call(label+' list',spec[entity].path+'/list?'+new URLSearchParams({...query,pageNum:'1',pageSize:'10'}));
 const matched=list.data.rows?.find(v=>v[spec[entity].id]===id);check(label+' list total/row',list.code===200&&typeof list.data.total==='number'&&Boolean(matched));
 if(matched)for(const key of Object.keys(spec[entity].fields))check(label+' list '+key,Object.is(matched[key],value[key]));
}
async function update(entity,id,body,label){intent(entity,body,label);const r=await call(label,spec[entity].path,{method:'PUT',body:{...body,[spec[entity].id]:id}});check(label+' accepted',r.code===200);return r;}
async function rejectedUpdate(entity,id,current,patch,label){
 const before=snapshot(entity);intent(entity,{...current,...patch},label);const r=await call(label,spec[entity].path,{method:'PUT',body:{...current,...patch,[spec[entity].id]:id}}),after=snapshot(entity);
 check(label+' Bean400 preserved raw envelope',r.code===400&&[200,400].includes(r.httpStatus),{rawHTTP:r.httpStatus,code:r.code});check(label+' no SQL mutation',before===after);
 if(before!==after)await update(entity,id,current,label+' restore owned valid row');
}
async function rejectedCreate(entity,body,label){
 const before=snapshot(entity);intent(entity,body,label);const r=await call(label,spec[entity].path,{method:'POST',body});recover(entity);const after=snapshot(entity);
 check(label+' existing duplicate business error',r.code===500&&r.httpStatus===200,{rawHTTP:r.httpStatus,code:r.code});check(label+' no row persisted',before===after);
}
let running;
try{
 const version=await fetch('http://127.0.0.1:5186/__version').then(r=>r.json());writeFileSync(resolve(out,'actual-version.json'),JSON.stringify(version,null,2)+'\n');
 if(version.id!==previewRelease)throw Error('Unexpected actual frontend release');
 const sha=createHash('sha256').update(readFileSync(jar)).digest('hex');if(sha!==expectedJar)throw Error('Unexpected expected Jar SHA');
 const port=new URL(origin).port;
 const portOwners=[...new Set([...execFileSync('lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-Fp'],{encoding:'utf8'}).matchAll(/^p(\d+)$/gm)].map(match=>Number(match[1])))];
 if(portOwners.length!==1)throw Error('Expected one Java listener on declared port');const pid=portOwners[0];
 const command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).trim();if(!command.includes('-jar '+jar)&&!command.includes('-jar '+resolve(jar)))throw Error('Declared-port process is not the expected Jar');
 running={release,origin,pid,jarPath:jar,jarSha256:sha,actualPreviewRelease:version.id,verifiedAt:new Date().toISOString(),scriptSha256:createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex')};
 const logged=await call('QA114 employee login','/api/auth/login',{anonymous:true,method:'POST',body:{type:'employee',account:operator.account,password:operator.password}});
 if(logged.httpStatus!==200||typeof logged.data.token!=='string')throw Error('QA114 login failed');token=logged.data.token;
 await scenario('post',async()=>{
  const initial={postCode:(prefix+'_P').padEnd(64,'p'),postName:(prefix+'岗位').padEnd(50,'衣'),postSort:0,status:'0',remark:'中文备注 & 引号"🧶'};
  const id=await create('post',initial,'post create at length maxima');await verify('post',id,initial,'post initial');
  for(const [label,patch]of [['blank code',{postCode:' '}],['blank name',{postName:''}],['missing sort',{postSort:null}],['code65',{postCode:'p'.repeat(65)}],['name51',{postName:'衣'.repeat(51)}]])await rejectedUpdate('post',id,initial,patch,'post '+label);
  await rejectedCreate('post',{...initial,postName:prefix+'_duplicate_name'},'post duplicate code');await rejectedCreate('post',{...initial,postCode:prefix+'_duplicate_code'},'post duplicate name');
  const edited={postCode:prefix+'_P_edit',postName:prefix+'岗位改中文',postSort:7,status:'1',remark:''};await update('post',id,edited,'post edit all');await verify('post',id,edited,'post edited');
 });
 await scenario('config',async()=>{
  const initial={configName:(prefix+'参数').padEnd(100,'衣'),configKey:own.configKeys[0],configValue:'值'.repeat(500),configType:'N',remark:'参数中文备注 & "'};
  const id=await create('config',initial,'config create maxima');await verify('config',id,initial,'config initial');
  for(const [label,patch]of [['blank name',{configName:' '}],['blank key',{configKey:''}],['blank value',{configValue:''}],['name101',{configName:'衣'.repeat(101)}],['key101',{configKey:'k'.repeat(101)}],['value501',{configValue:'值'.repeat(501)}]])await rejectedUpdate('config',id,initial,patch,'config '+label);
  await rejectedCreate('config',{...initial,configName:prefix+'_duplicate'},'config duplicate key');
  const value=await call('config cached initial','/system/config/configKey/'+initial.configKey);check('config key lookup exact value',value.data.msg===initial.configValue);
  const edited={configName:prefix+'参数修改',configKey:own.configKeys[1],configValue:'0',configType:'Y',remark:''};await update('config',id,edited,'config edit key/type/zero/clear');await verify('config',id,edited,'config edited');
  const old=await call('config old key after rename','/system/config/configKey/'+initial.configKey),now=await call('config new key after rename','/system/config/configKey/'+edited.configKey);check('config rename old empty/new zero',old.data.msg===''&&now.data.msg==='0');
  const before=snapshot('config'),blocked=await call('config builtin delete is blocked',spec.config.path+'/'+id,{method:'DELETE'});check('builtin own parameter deletion rejects',blocked.code===500&&before===snapshot('config'));
  await update('config',id,{...edited,configType:'N'},'config restore own nonbuiltin');await verify('config',id,{...edited,configType:'N'},'config final nonbuiltin');
 });
 await scenario('dictionary',async()=>{
  const initial={dictName:(prefix+'字典').padEnd(100,'衣'),dictType:own.dictTypes[0],status:'0',remark:'字典备注" & 中文'};
  const typeId=await create('type',initial,'dict type create');await verify('type',typeId,initial,'dict type initial');
  for(const [label,patch]of [['blank name',{dictName:' '}],['blank type',{dictType:''}],['name101',{dictName:'衣'.repeat(101)}],['type101',{dictType:'a'.repeat(101)}],['bad pattern',{dictType:'1Bad-Type'}]])await rejectedUpdate('type',typeId,initial,patch,'dict type '+label);
  await rejectedCreate('type',{...initial,dictName:prefix+'_duplicate'},'dict type duplicate key');
  const a={dictSort:0,dictLabel:(prefix+'标签').padEnd(100,'衣'),dictValue:'0',dictType:own.dictTypes[0],cssClass:'qa-r31-class',listClass:'success',isDefault:'Y',status:'0',remark:'字典项A备注'};
  const b={dictSort:1,dictLabel:prefix+'标签B',dictValue:'1',dictType:own.dictTypes[0],cssClass:'',listClass:'',isDefault:'N',status:'1',remark:'字典项B备注'};
  const aid=await create('data',a,'dict data A create'),bid=await create('data',b,'dict data B create');await verify('data',aid,a,'dict A initial');
  // Insert skips optional empty strings; DB defaults are compared explicitly.
  await verify('data',bid,{...b,cssClass:row('data',bid).cssClass,listClass:row('data',bid).listClass},'dict B initial');
  for(const [label,patch]of [['blank label',{dictLabel:' '}],['blank value',{dictValue:''}],['blank type',{dictType:''}],['label101',{dictLabel:'衣'.repeat(101)}],['value101',{dictValue:'v'.repeat(101)}],['type101',{dictType:'a'.repeat(101)}],['css101',{cssClass:'c'.repeat(101)}]])await rejectedUpdate('data',aid,a,patch,'dict data '+label);
  await rejectedCreate('data',{...a,dictLabel:prefix+'_duplicate'},'dict data duplicate value');
  const selected=await call('dict cache initial active/default','/system/dict/data/type/'+initial.dictType);check('dict cache selects active A default',selected.data.data?.length===1&&selected.data.data[0].dictCode===aid&&selected.data.data[0].default===true);
  const ae={...a,dictSort:9,dictLabel:prefix+'标签A改',dictValue:'零',cssClass:'',listClass:'',isDefault:'N',status:'1',remark:''},be={...b,dictSort:0,dictLabel:prefix+'标签B改中文',dictValue:'一',cssClass:'qa-b',listClass:'warning',isDefault:'Y',status:'0',remark:''};
  await update('data',aid,ae,'dict A edit/clear');await update('data',bid,be,'dict B edit/default/active');await verify('data',aid,ae,'dict A edited');await verify('data',bid,be,'dict B edited');
  const edited={dictName:prefix+'字典改中文',dictType:own.dictTypes[1],status:'1',remark:''};await update('type',typeId,edited,'dict type rename/status/clear');await verify('type',typeId,edited,'dict type edited');await verify('data',aid,{...ae,dictType:edited.dictType},'dict A cascaded type');await verify('data',bid,{...be,dictType:edited.dictType},'dict B cascaded type');
  const old=await call('dict old cache after type rename','/system/dict/data/type/'+initial.dictType),now=await call('dict new cache after type rename','/system/dict/data/type/'+edited.dictType);check('dict rename old type no data',Array.isArray(old.data.data)&&old.data.data.length===0,{oldType:initial.dictType,oldReturnedIds:old.data.data?.map(v=>v.dictCode)});check('dict renamed active/default B',now.data.data?.length===1&&now.data.data[0].dictCode===bid&&now.data.data[0].default===true);
  const before=snapshot('type'),blocked=await call('dict parent deletion with data blocked',spec.type.path+'/'+typeId,{method:'DELETE'});check('dict parent not deleted with data',blocked.code===500&&before===snapshot('type'));
 });
}catch(error){failures.push({name:'setup',message:error.message.slice(0,300)});}
finally{
 if(token){
  for(const entity of ['data','type','config','post'])await scenario('cleanup '+entity,async()=>{
   recover(entity);for(const id of own[spec[entity].owned]){
    const current=row(entity,id);if(!current)continue;
    if(entity==='config'&&current.configType==='Y')await update('config',id,{...Object.fromEntries(Object.keys(spec.config.fields).map(k=>[k,current[k]])),configType:'N'},'cleanup own config nonbuiltin');
    const r=await call('cleanup delete '+entity+' '+id,spec[entity].path+'/'+id,{method:'DELETE'});check('cleanup interface '+entity+' '+id,r.code===200);
   }
  });
  await scenario('logout owned session',async()=>{const r=await call('logout owned QA114','/api/auth/logout',{method:'POST',body:{}});check('logout success',r.httpStatus===200);});token=null;
 }
 for(const [entity,s]of Object.entries(spec))cleanup[entity]=Number(sql(`SELECT COUNT(*) FROM ${s.table} WHERE ${scopedWhere(entity)}`,'cleanup remaining '+entity));
 cleanup.postAssignments=own.postIds.length?Number(sql(`SELECT COUNT(*) FROM sys_user_post WHERE post_id IN (${own.postIds.join(',')})`,'cleanup post associations')):0;
 const keys=[...own.configKeys.map(v=>'sys_config:'+v),...own.dictTypes.map(v=>'sys_dict:'+v)],cache=[];
 for(const key of keys){const before=Number(execFileSync('redis-cli',['-p','6388','--raw','EXISTS',key],{encoding:'utf8'}));if(before)execFileSync('redis-cli',['-p','6388','DEL',key],{stdio:'ignore'});cache.push({key,before,remaining:Number(execFileSync('redis-cli',['-p','6388','--raw','EXISTS',key],{encoding:'utf8'}))});}
 cleanup.cache=cache;own.completedAt=new Date().toISOString();persist();
 const result={kind:'actual declared-runtime HTTP CRUD and read-only exact SQL fields; no UI claim',running,prefix,at:new Date().toISOString(),requests,database,checks,failures,cleanup,actualIds:{post:own.postIds,config:own.configIds,dictType:own.dictIds,dictData:own.dataIds},sourceContracts:'source-contracts.json',limitations:contracts.notes};
 result.passed=checks.filter(c=>c.passed).length;result.failed=checks.filter(c=>!c.passed).length;result.success=result.failed===0&&failures.length===0&&Object.entries(cleanup).filter(([k])=>k!=='cache').every(([,v])=>v===0)&&cache.every(v=>v.remaining===0);
 writeFileSync(resolve(out,'report.json'),JSON.stringify(result,null,2)+'\n');
 const leaked=JSON.stringify(result).includes(operator.password);if(leaked)throw Error('Credential literal leaked into evidence');
 console.log(JSON.stringify({release,running,requests:requests.length,checks:checks.length,passed:result.passed,failed:result.failed,failedChecks:checks.filter(c=>!c.passed),failures,cleanup,actualIds:result.actualIds,success:result.success}));if(!result.success)process.exitCode=1;
}
