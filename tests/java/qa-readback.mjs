// Read-only evidence capture for a specific real-page action. Never changes the business object.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const id=process.argv[2],label=process.argv[3]||'readback',release=process.env.QA_RELEASE_ID;
if(!release||!id||!(/^(GY-\d{8}-[A-F0-9]{16}|[a-f0-9]{64})$/.test(id))||!/^[a-zA-Z0-9_-]{1,80}$/.test(label))throw Error('Expected QA_RELEASE_ID and tracked object ID plus safe evidence label');
const {runId,accounts}=JSON.parse(readFileSync('.secrets/qa-accounts.json','utf8'));
const allowed=Object.values(accounts).map(a=>a.id);
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','--raw'],{input:q,encoding:'utf8'}).trim();
const parse=q=>{const result=sql(q);return result?result.split('\n').map(line=>JSON.parse(line)):[]};
const isCraft=id.startsWith('GY-');
const primary=isCraft?parse(`SELECT JSON_OBJECT('id',id,'ownerId',owner_id,'name',name,'state',status,'version',version,'payload',JSON_EXTRACT(payload,'$'),'createdAt',created_at,'updatedAt',updated_at) FROM maoyi_craft WHERE id='${id}';`):parse(`SELECT JSON_OBJECT('id',token_hash,'ownerId',owner_id,'craftId',craft_id,'snapshot',JSON_EXTRACT(snapshot,'$'),'expiresAt',expires_at,'revoked',revoked,'createdAt',created_at) FROM maoyi_share WHERE token_hash='${id}';`);
if(primary.length!==1||!allowed.includes(Number(primary[0].ownerId)))throw Error('Object not owned by a tracked QA account');
const craftId=isCraft?id:primary[0].craftId;
const audit=parse(`SELECT JSON_OBJECT('id',id,'craftId',craft_id,'actorId',actor_id,'state',status,'note',note,'version',version,'at',at) FROM maoyi_audit WHERE craft_id='${craftId}' ORDER BY version;`);
const path=isCraft?'/maoyi/craft/'+id+'/review':'/maoyi/share/'+id+'/revoke';
const operationLogs=parse(`SELECT JSON_OBJECT('id',oper_id,'title',title,'method',request_method,'url',oper_url,'actor',oper_name,'status',status,'error',error_msg,'at',oper_time,'request',oper_param,'response',json_result) FROM sys_oper_log WHERE oper_url='${path}' ORDER BY oper_id;`);
const evidence={release,runId,capturedAt:new Date().toISOString(),kind:label.endsWith('-before')?'before action read-only database and management audit':'after action read-only database and management audit',objectType:isCraft?'craft':'share',objectId:id,record:primary[0],audit,operationLogs};
mkdirSync('.data/qa/api-evidence',{recursive:true});const file='.data/qa/api-evidence/'+label+'.json';writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({file,id,state:isCraft?primary[0].state:primary[0].revoked?'revoked':primary[0].expiresAt<=Date.now()?'expired':'active',version:isCraft?primary[0].version:undefined,auditCount:audit.length,operationLogCount:operationLogs.length}));
