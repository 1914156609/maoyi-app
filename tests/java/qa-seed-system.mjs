import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(readFileSync('.secrets/qa-accounts.json')),release=process.env.QA_RELEASE_ID,origin=process.env.MAOYI_TEST_ORIGIN;
if(!release||!origin)throw Error('Frozen origin/release required');
const file='.secrets/qa-system-data.json';if(existsSync(file))throw Error('Preserve existing system fixtures');
const suffix=config.runId.split('-').at(-1),tag='qa_'+suffix,actor=config.accounts.systemAdmin.account;
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'}).trim();
const state={runId:config.runId,release,lane:'system',ownerAccountId:config.accounts.systemAdmin.id,objects:[],restrictions:['仅这些QA对象可操作；全局日志/Redis清空等操作必须使用另建克隆环境。','菜单/角色权限变更由页面代理按已取得的授权操作；这些是空沙盒对象。']};
function save(){writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});const h=JSON.parse(readFileSync('.data/qa/handoff.json'));h.lanes=h.lanes.filter(s=>s.lane!=='system').concat(state);writeFileSync('.data/qa/handoff.json',JSON.stringify(h,null,2)+'\n')}
function insert(type,table,key,query,fields){const id=Number(sql(query+';SELECT LAST_INSERT_ID();'));const object={type,table,key,id,fields};state.objects.push(object);save();return id}save();
const parent=insert('departmentParent','sys_dept','dept_id',`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(0,'0','QA验收父部门${suffix}',99,'0','0','${actor}',NOW())`,{name:'QA验收父部门'+suffix});
insert('departmentChild','sys_dept','dept_id',`INSERT INTO sys_dept(parent_id,ancestors,dept_name,order_num,status,del_flag,create_by,create_time) VALUES(${parent},'0,${parent}','QA验收子部门${suffix}',1,'0','0','${actor}',NOW())`,{name:'QA验收子部门'+suffix,parentId:parent});
insert('post','sys_post','post_id',`INSERT INTO sys_post(post_code,post_name,post_sort,status,create_by,create_time) VALUES('${tag}','QA验收岗位${suffix}',99,'0','${actor}',NOW())`,{code:tag,name:'QA验收岗位'+suffix});
const dictType='qa_fixture_'+suffix;
insert('dictionaryType','sys_dict_type','dict_id',`INSERT INTO sys_dict_type(dict_name,dict_type,status,create_by,create_time) VALUES('QA验收字典${suffix}','${dictType}','0','${actor}',NOW())`,{dictType,name:'QA验收字典'+suffix});
insert('dictionaryData','sys_dict_data','dict_code',`INSERT INTO sys_dict_data(dict_sort,dict_label,dict_value,dict_type,list_class,is_default,status,create_by,create_time) VALUES(1,'QA沙盒值','qa_value','${dictType}','default','N','0','${actor}',NOW())`,{dictType,value:'qa_value',label:'QA沙盒值'});
const configKey='qa.fixture.'+suffix;
insert('parameter','sys_config','config_id',`INSERT INTO sys_config(config_name,config_key,config_value,config_type,create_by,create_time) VALUES('QA无业务参数${suffix}','${configKey}','qa-only','N','${actor}',NOW())`,{configKey,value:'qa-only'});
insert('notice','sys_notice','notice_id',`INSERT INTO sys_notice(notice_title,notice_type,notice_content,status,create_by,create_time) VALUES('QA未发布公告${suffix}','1','仅供本轮验收，未发布。','1','${actor}',NOW())`,{title:'QA未发布公告'+suffix,status:'1',published:false});
insert('menu','sys_menu','menu_id',`INSERT INTO sys_menu(menu_name,parent_id,order_num,path,menu_type,visible,status,perms,create_by,create_time) VALUES('QA空菜单${suffix}',0,99,'qa-sandbox-${suffix}','M','1','1','','${actor}',NOW())`,{name:'QA空菜单'+suffix,path:'qa-sandbox-'+suffix,assignedRoles:[],status:'1',visible:'1'});
insert('emptyRole','sys_role','role_id',`INSERT INTO sys_role(role_name,role_key,role_sort,data_scope,status,del_flag,create_by,create_time) VALUES('QA空权限角色${suffix}','qa_empty_${suffix}',99,'5','0','0','${actor}',NOW())`,{key:'qa_empty_'+suffix,menus:[],assignedUsers:[]});
const physical='qa_fixture_'+suffix;
sql(`CREATE TABLE ${physical} (id BIGINT NOT NULL AUTO_INCREMENT COMMENT '编号', label VARCHAR(60) NOT NULL COMMENT '测试名称', status CHAR(1) NOT NULL DEFAULT '0' COMMENT '测试状态', remark VARCHAR(255) DEFAULT '' COMMENT '备注', create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',PRIMARY KEY(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='QA独立生成器沙盒';INSERT INTO ${physical}(label) VALUES('QA生成器样本');`);
state.objects.push({type:'generatorPhysicalTable',table:physical,fields:{name:physical,rows:1,imported:false},cleanup:'仅此物理表和其gen_table/gen_table_column元数据可清理'});save();
const redisKey='qa:'+config.runId+':only';execFileSync('redis-cli',['-p','6388','SET',redisKey,'qa-only','EX','86400'],{stdio:'ignore'});state.objects.push({type:'redisKey',id:redisKey,fields:{value:'qa-only',ttl:86400},cleanup:'仅DEL这一key，禁止FLUSHALL/FLUSHDB'});save();
async function req(path,token,body){const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),b=await r.json();if(!r.ok||typeof b.code==='number'&&b.code>=400)throw Error(b.msg||b.message);return b}
const a=config.accounts.systemAdmin,login=await req('/api/auth/login',null,{type:'employee',account:a.account,password:a.password});
try{
 const jobName='QA无副作用任务'+suffix;await req('/monitor/job',login.token,{jobName,jobGroup:'DEFAULT',invokeTarget:'ryTask.ryNoParams',cronExpression:'0 0 0 1 1 ? 2099',misfirePolicy:'2',concurrent:'1',status:'1',remark:'只打印本地日志；禁用；仅QA手动验收'});
 const id=Number(sql(`SELECT job_id FROM sys_job WHERE job_name='${jobName}' AND create_by='${actor}' ORDER BY job_id DESC LIMIT 1`));if(!id)throw Error('QA job id not found');
 state.objects.push({type:'disabledNoopJob',table:'sys_job',key:'job_id',id,fields:{name:jobName,invokeTarget:'ryTask.ryNoParams',cron:'0 0 0 1 1 ? 2099',status:'1'},reviewedSource:'../maoyi-backend/ruoyi-quartz/src/main/java/com/ruoyi/quartz/task/RyTask.java:24',sideEffects:'仅System.out.println，无数据库/网络动作；未触发执行'});save();
}finally{await req('/api/auth/logout',login.token,{})}
console.log('Prepared isolated official-module prerequisites; exact IDs and restrictions saved under handoff system lane.');
