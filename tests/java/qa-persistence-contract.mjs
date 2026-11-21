import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {runId,accounts}=JSON.parse(readFileSync('.secrets/qa-accounts.json')),a=accounts.api;
const origin='http://127.0.0.1:8081',evidence=[],ids=[],release='qa-20261118-r5';
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'}).trim();
async function req(path,token,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),data=await r.json();return {status:typeof data.code==='number'&&data.code>=400?data.code:r.status,data}}
const login=await req('/api/auth/login',null,{type:'employee',account:a.account,password:a.password});assert.equal(login.status,200);const token=login.data.token;
const base={name:'QA persistence boundary',measurementBasis:'flat',calculationVersion:'video-v1',density:30,rowDensity:40,sizes:{chest:50}};
try{
 const before=Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${a.id}`));
 for(const variation of [{density:0},{sizes:{chest:-1}},{sizes:{chest:10001}},{rowDensity:true}]){
  const r=await req('/api/crafts',token,{...base,...variation}),after=Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${a.id}`));assert.equal(r.status,400);assert.equal(after,before);evidence.push({kind:'invalid numeric write',request:variation,httpStatus:r.status,response:r.data,ownerId:a.id,dbCraftCountBefore:before,dbCraftCountAfter:after});
 }
 for(const [scenario,body]of [['emptyDraft',{...base,name:'QA不完整草稿持久化',density:'',rowDensity:'',sizes:{}}],['geometryDraft',{...base,name:'QA几何参数草稿策略',sizes:{chest:50,shoulder:100}}]]){
  const r=await req('/api/crafts',token,body);assert.equal(r.status,200);const id=r.data.craft.id;ids.push(id);assert.match(id,/^GY-\d{8}-[A-F0-9]{16}$/);
  const actual=await req('/api/crafts/'+id,token),stored=JSON.parse(sql(`SELECT payload FROM maoyi_craft WHERE id='${id}' AND owner_id=${a.id}`));assert.equal(actual.data.craft.status,'draft');assert.equal(stored.name,body.name);
  if(scenario==='emptyDraft'){assert.equal(stored.density,'');assert.equal(stored.sizes.chest,'')}else{assert.equal(stored.sizes.chest,50);assert.equal(stored.sizes.shoulder,100)}
  evidence.push({kind:scenario,request:body,httpStatus:r.status,id,readback:actual.data.craft,databasePayload:stored});
 }
}finally{
 for(const id of ids)sql(`DELETE FROM maoyi_craft WHERE id='${id}' AND owner_id=${a.id}`);
 await req('/api/auth/logout',token,{});
 const remaining=ids.length?Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE id IN (${ids.map(id=>"'"+id+"'").join(',')})`)):0;assert.equal(remaining,0);
 writeFileSync('.data/qa/api-evidence/persistence-contract.json',JSON.stringify({runId,release,backendEvidenceInheritedFrom:'qa-20261118-r1',at:new Date().toISOString(),origin,result:'仅自动化通过',requests:evidence,policy:'服务端允许不完整/几何尚未合法的草稿；非法数值不会写入。几何校验在计算入口执行，本记录不替代真实UI保存。',cleanup:{ids,remaining}},null,2)+'\n');
}
console.log('Invalid numeric requests made no rows; empty/geometric drafts persisted as drafts and were read back then precisely removed.');
