import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081';
const label=process.env.QA_EVIDENCE_LABEL||'r13-generator-parent-menu-repro';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid label');
const account=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.systemAdmin;
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','--raw'],{input:q,encoding:'utf8'}).trim();
const query="SELECT JSON_OBJECT('tableId',table_id,'tableName',table_name,'options',options,'genType',gen_type,'genPath',gen_path,'moduleName',module_name,'businessName',business_name,'updateTime',update_time) FROM gen_table WHERE table_id=1";
const before=JSON.parse(sql(query));assert.equal(before.tableName,'qa_fixture_7b073a');
async function call(path,token,body){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
const login=await call('/api/auth/login',null,{type:'employee',account:account.account,password:account.password});assert.ok(login.data.token);let api,preview;
try{api=await call('/tool/gen/1',login.data.token);assert.equal(api.status,200);assert.equal(api.data.code,200);preview=await call('/tool/gen/preview/1',login.data.token);assert.equal(preview.status,200);assert.equal(preview.data.code,200);}finally{await call('/api/auth/logout',login.data.token,{});}
const after=JSON.parse(sql(query));assert.deepEqual(after,before);
const info=api.data.data.info,options=JSON.parse(before.options||'null');
const defaultParent=options&&options.parentMenuId!=null&&String(options.parentMenuId)!==''?String(options.parentMenuId):'3';
const archive=JSON.parse(readFileSync('.data/qa/api-evidence/r13-ui-generator-batch-download.json'));
const sqlText=Object.values(archive.sqlFiles).join('\n');
const previewSql=Object.fromEntries(Object.entries(preview.data.data).filter(([key])=>key.includes('/sql/')));
const previewSqlText=Object.values(previewSql).join('\n');
const previewParent=/values\s*\(\s*'[^']*'\s*,\s*'([^']+)'/i.exec(previewSqlText)?.[1];
if(process.env.QA_EXPECT_PARENT_CONSISTENT==='1'){assert.equal(String(info.parentMenuId),defaultParent);assert.equal(previewParent,defaultParent);}
const operationLogs=sql("SELECT JSON_OBJECT('id',oper_id,'path',oper_url,'method',request_method,'actor',oper_name,'status',status,'time',oper_time,'request',oper_param,'response',json_result) FROM sys_oper_log WHERE oper_url LIKE '/tool/gen%' ORDER BY oper_id").split('\n').filter(Boolean).map(JSON.parse);
const result={at:new Date().toISOString(),origin,kind:'Actual authenticated GET plus read-only SQL/source/download evidence; no generator metadata writes',database:before,api:{httpStatus:api.status,code:api.data.code,parentMenuId:info.parentMenuId,parentMenuName:info.parentMenuName,options:info.options,genType:info.genType,genPath:info.genPath},preview:{httpStatus:preview.status,code:preview.data.code,templateCount:Object.keys(preview.data.data).length,sql:previewSql,parentMenuId:previewParent},optionsContainParentMenuId:!!options&&Object.hasOwn(options,'parentMenuId'),templateEffectiveParentMenuId:defaultParent,apiAndTemplateAgree:String(info.parentMenuId)===defaultParent,downloadedSqlParent3:sqlText.includes("values ('QA生成器沙盒', '3'")||/values\s*\([^\n]*['"]3['"]/.test(sqlText),databaseBeforeAfterUnchanged:true,physicalTableRows:Number(sql('SELECT COUNT(*) FROM qa_fixture_7b073a')),physicalTableDdl:sql('SHOW CREATE TABLE qa_fixture_7b073a'),operationLogs,authentication:'Only independent QA114 login/logout; its normal lastLogin metadata may update. Root administrator session untouched.'};
const file='.data/qa/api-evidence/'+label+'.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,options:before.options,apiParent:info.parentMenuId,templateParent:defaultParent,agree:result.apiAndTemplateAgree,databaseUnchanged:true,generatorLogIds:operationLogs.map(x=>x.id)}));
