import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const file='.secrets/qa-system-data.json';if(!existsSync(file)){console.log('No system fixtures to clean');process.exit(0)}
const state=JSON.parse(readFileSync(file)),config=JSON.parse(readFileSync('.secrets/qa-accounts.json'));
if(state.runId!==config.runId)throw Error('QA run ownership mismatch');
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'}).trim();
const quote=x=>"'"+String(x).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const userIds=Object.values(config.accounts).map(a=>a.id),roleIds=[...(config.roles||[]).map(r=>r.id),...state.objects.filter(o=>o.type==='emptyRole').map(o=>o.id)];
for(const object of state.objects){
 if(object.type==='emptyRole'&&Number(sql(`SELECT COUNT(*) FROM sys_user_role WHERE role_id=${object.id} AND user_id NOT IN (${userIds.join(',')})`)))throw Error('QA role is linked to a non-QA user; stop for review');
 if(object.type==='menu'){
  if(Number(sql(`SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=${object.id} AND role_id NOT IN (${roleIds.join(',')})`)))throw Error('QA menu linked to a non-QA role; stop for review');
  const currentPath=sql(`SELECT path FROM sys_menu WHERE menu_id=${object.id}`);
  if(currentPath&&currentPath!==object.fields?.path)throw Error('QA menu ownership path changed; stop for review');
  const trackedMenus=state.objects.filter(o=>o.type==='menu').map(o=>o.id);
  if(Number(sql(`SELECT COUNT(*) FROM sys_menu WHERE parent_id=${object.id} AND menu_id NOT IN (${trackedMenus.join(',')})`)))throw Error('QA menu has untracked children; stop for review');
 }
 if(object.type.startsWith('department')&&Number(sql(`SELECT COUNT(*) FROM sys_user WHERE dept_id=${object.id} AND user_id NOT IN (${userIds.join(',')})`)))throw Error('QA department has non-QA users; stop for review');
 if(['post','postCreatedByUi'].includes(object.type)&&Number(sql(`SELECT COUNT(*) FROM sys_user_post WHERE post_id=${object.id} AND user_id NOT IN (${userIds.join(',')})`)))throw Error('QA post is linked to a non-QA user; stop for review');
 if(['parameter','parameterCreatedByUi'].includes(object.type)){
  const currentKey=sql(`SELECT config_key FROM sys_config WHERE config_id=${object.id}`);
  if(currentKey&&currentKey!==object.fields?.configKey)throw Error('QA parameter ownership key changed; stop for review');
 }
 if(['dictionaryType','dictionaryTypeCreatedByUi'].includes(object.type)){
  const currentType=sql(`SELECT dict_type FROM sys_dict_type WHERE dict_id=${object.id}`);
  if(currentType&&currentType!==object.fields?.dictType)throw Error('QA dictionary type ownership changed; stop for review');
  const dataIds=state.objects.filter(o=>['dictionaryData','dictionaryDataCreatedByUi'].includes(o.type)&&o.fields?.dictType===object.fields.dictType).map(o=>o.id);
  if(Number(sql(`SELECT COUNT(*) FROM sys_dict_data WHERE dict_type=${quote(object.fields.dictType)}${dataIds.length?' AND dict_code NOT IN ('+dataIds.join(',')+')':''}`)))throw Error('QA dictionary has untracked data rows; stop for review');
 }
 if(['dictionaryData','dictionaryDataCreatedByUi'].includes(object.type)){
  const currentType=sql(`SELECT dict_type FROM sys_dict_data WHERE dict_code=${object.id}`);
  if(currentType&&currentType!==object.fields?.dictType)throw Error('QA dictionary data ownership changed; stop for review');
 }
 if(object.type==='noticeCreatedByUi'){
  const raw=sql(`SELECT JSON_OBJECT('title',notice_title,'status',status) FROM sys_notice WHERE notice_id=${object.id}`);
  if(raw){const current=JSON.parse(raw);if(current.title!==object.fields?.title||current.status!=='1')throw Error('UI-created QA notice ownership or closed status changed; stop for review');}
  const tracked=object.readRecords||[];
  if(tracked.some(r=>!Number.isSafeInteger(r.readId)||r.noticeId!==object.id||!(r.userId===1||userIds.includes(r.userId))))throw Error('Invalid exact QA notice reader tracking');
  const existing=sql(`SELECT JSON_OBJECT('readId',read_id,'userId',user_id) FROM sys_notice_read WHERE notice_id=${object.id}`);
  if(existing&&existing.split('\n').map(JSON.parse).some(r=>!tracked.some(t=>t.readId===r.readId&&t.userId===r.userId)))throw Error('QA notice has untracked read records; re-inventory before cleanup');
 }
}
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081';
async function req(path,method,token,body){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),b=await r.json();if(!r.ok||typeof b.code==='number'&&b.code>=400)throw Error(b.msg||b.message);return b}
const jobs=state.objects.filter(o=>o.type==='disabledNoopJob');
if(jobs.some(j=>Number(sql(`SELECT COUNT(*) FROM sys_job WHERE job_id=${j.id}`)))){
 const a=config.accounts.systemAdmin,login=await req('/api/auth/login','POST',null,{type:'employee',account:a.account,password:a.password});
 try{for(const job of jobs){const current=sql(`SELECT job_name FROM sys_job WHERE job_id=${job.id}`);if(current){await req('/monitor/job/'+job.id,'DELETE',login.token);sql(`DELETE FROM sys_job_log WHERE job_name IN (${quote(current)},${quote(job.fields.name)});`)}}}finally{await req('/api/auth/logout','POST',login.token,{})}
}
const queries=jobs.map(job=>`DELETE FROM sys_job_log WHERE job_name=${quote(job.fields.name)};`);
for(const object of [...state.objects].reverse()){
 const {type,id,fields={}}=object;if(type==='disabledNoopJob')continue;
 if(type==='noticeReaderBatch'){
  const ownedNotice=state.objects.find(o=>o.type==='notice'&&o.id===object.noticeId);
  if(!ownedNotice||!object.readIds?.length||object.readIds.some(n=>!Number.isSafeInteger(n))||object.userIds.some(n=>!userIds.includes(n)))throw Error('Invalid QA reader tracking');
  const ids=object.readIds.join(','),users=object.userIds.join(',');
  if(Number(sql(`SELECT COUNT(*) FROM sys_notice_read WHERE read_id IN (${ids}) AND (notice_id<>${object.noticeId} OR user_id NOT IN (${users}))`)))throw Error('QA reader ownership changed');
  queries.push(`DELETE FROM sys_notice_read WHERE read_id IN (${ids}) AND notice_id=${object.noticeId} AND user_id IN (${users});`);continue;
 }
 if(type==='redisKey'){if(!String(id).startsWith('qa:'+state.runId+':'))throw Error('Invalid QA Redis key');execFileSync('redis-cli',['-p','6388','DEL',id],{stdio:'ignore'});continue}
 if(type==='generatorPhysicalTable'){
  if(!/^qa_fixture_[a-f0-9]{6}$/.test(object.table)||!state.runId.endsWith(object.table.slice(-6)))throw Error('Invalid QA physical table');
  queries.push(`DELETE FROM gen_table_column WHERE table_id IN (SELECT table_id FROM gen_table WHERE table_name=${quote(object.table)});DELETE FROM gen_table WHERE table_name=${quote(object.table)};DROP TABLE IF EXISTS ${object.table};`);continue;
 }
 if(!Number.isSafeInteger(id))throw Error('Invalid QA primary key');
 const allowed={departmentCreatedByUi:['sys_dept','dept_id'],departmentParent:['sys_dept','dept_id'],departmentChild:['sys_dept','dept_id'],post:['sys_post','post_id'],postCreatedByUi:['sys_post','post_id'],dictionaryType:['sys_dict_type','dict_id'],dictionaryTypeCreatedByUi:['sys_dict_type','dict_id'],dictionaryData:['sys_dict_data','dict_code'],dictionaryDataCreatedByUi:['sys_dict_data','dict_code'],parameter:['sys_config','config_id'],parameterCreatedByUi:['sys_config','config_id'],notice:['sys_notice','notice_id'],noticeCreatedByUi:['sys_notice','notice_id'],menu:['sys_menu','menu_id'],emptyRole:['sys_role','role_id']};
 if(!allowed[type]||allowed[type][0]!==object.table||allowed[type][1]!==object.key)throw Error('Unknown QA fixture table');
 if(type==='emptyRole')queries.push(`DELETE FROM sys_user_role WHERE role_id=${id};DELETE FROM sys_role_menu WHERE role_id=${id};DELETE FROM sys_role_dept WHERE role_id=${id};`);
 if(type==='menu')queries.push(`DELETE FROM sys_role_menu WHERE menu_id=${id};`);
 if(['post','postCreatedByUi'].includes(type))queries.push(`DELETE FROM sys_user_post WHERE post_id=${id} AND user_id IN (${userIds.join(',')});`);
 if(type==='noticeCreatedByUi'&&object.readRecords?.length)queries.push(`DELETE FROM sys_notice_read WHERE notice_id=${id} AND read_id IN (${object.readRecords.map(r=>r.readId).join(',')});`);
 if(['dictionaryType','dictionaryTypeCreatedByUi'].includes(type)){
  const dataIds=state.objects.filter(o=>['dictionaryData','dictionaryDataCreatedByUi'].includes(o.type)&&o.fields?.dictType===fields.dictType).map(o=>o.id);
  if(dataIds.length)queries.push(`DELETE FROM sys_dict_data WHERE dict_type=${quote(fields.dictType)} AND dict_code IN (${dataIds.join(',')});`);
  execFileSync('redis-cli',['-p','6388','DEL','sys_dict:'+fields.dictType],{stdio:'ignore'});
 }
 if(['parameter','parameterCreatedByUi'].includes(type))execFileSync('redis-cli',['-p','6388','DEL','sys_config:'+fields.configKey],{stdio:'ignore'});
 queries.push(`DELETE FROM ${object.table} WHERE ${object.key}=${id};`);
}
sql(queries.join('\n'));
writeFileSync('.data/qa/api-evidence/system-cleanup.json',JSON.stringify({runId:state.runId,release:state.release,at:new Date().toISOString(),cleanedObjects:state.objects,queries,scope:'仅本轮系统模块沙盒对象，禁用任务经官方接口从调度器移除；未清空全局日志或Redis'},null,2)+'\n');
if(existsSync('.secrets/qa-notice-readers.json')&&JSON.parse(readFileSync('.secrets/qa-notice-readers.json')).runId===state.runId)unlinkSync('.secrets/qa-notice-readers.json');
unlinkSync(file);console.log('Cleaned only tracked system-module QA fixtures.');
