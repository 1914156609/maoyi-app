import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {accounts,runId}=JSON.parse(readFileSync('.secrets/qa-accounts.json')),a=accounts.api,origin='http://127.0.0.1:8081',ids=[],evidence=[];
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'}).trim();
async function req(path,token,body){const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {httpStatus:r.status,response:await r.json()}}
const login=await req('/api/auth/login',null,{type:'employee',account:a.account,password:a.password});if(!login.response.token)throw Error('QA login failed');const token=login.response.token;
try{
 for(const [field,value]of [['density',1001],['rowDensity',1001],['chest',501]]){
  const body={name:'QA上界缺陷复现-'+field,measurementBasis:'flat',calculationVersion:'video-v1',density:30,rowDensity:40,sizes:{chest:50}};if(field==='chest')body.sizes.chest=value;else body[field]=value;
  const r=await req('/api/crafts',token,body),id=r.response.craft?.id;if(id){if(!/^GY-\d{8}-[A-F0-9]{16}$/.test(id))throw Error('Invalid id');ids.push(id)}
  const persisted=id?JSON.parse(sql(`SELECT payload FROM maoyi_craft WHERE id='${id}' AND owner_id=${a.id}`)):null;
  evidence.push({request:body,...r,id,persisted,expectedStatus:400,defectConfirmed:r.httpStatus===200&&persisted!==null});
 }
}finally{
 for(const id of ids)sql(`DELETE FROM maoyi_craft WHERE id='${id}' AND owner_id=${a.id}`);await req('/api/auth/logout',token,{});
 writeFileSync('.data/qa/api-evidence/r5-bounds-repro.json',JSON.stringify({runId,release:'qa-20261118-r5',javaInheritedFrom:'qa-20261118-r1',at:new Date().toISOString(),evidence,cleanup:{ids,remaining:Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${a.id}`))}},null,2)+'\n');
}
console.log('Recorded three real HTTP/SQL upper-bound defects; only owned reproduction rows removed.');
