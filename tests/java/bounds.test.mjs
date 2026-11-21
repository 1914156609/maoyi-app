import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const {accounts,runId}=JSON.parse(readFileSync('.secrets/qa-accounts.json')),owner=accounts.api;
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081',release=process.env.QA_RELEASE_ID||'unfrozen',ids=new Set(),requests=[],database=[];
const fields=['bodyLength','chest','shoulder','armhole','armholeDecrease','shoulderSlope','bodyRib','neckWidth','frontNeckDepth','frontNeckFlat','backNeckDepth','backNeckFlat','sleeveLength','sleeveCapHeight','sleeveCapWidth','sleeveWidth','sleeveRib','underarmFlat','sleeveCuffWidth','placketWidth','placketLength'];
const batchName='QA上界合同-'+Date.now();
const base={name:batchName,style:'套头',neck:'圆领',sleeve:'长袖',length:'常规',measurementBasis:'flat',calculationVersion:'video-v1',density:30,rowDensity:40,sizes:{chest:50}};
const safe=x=>Array.isArray(x)?x.map(safe):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,/token|password/i.test(k)||k==='code'&&typeof v==='string'||k==='url'?'[redacted]':safe(v)])):x;
const sql=q=>{const result=execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'}).trim();database.push({query:q,result});return result};
let token;
async function call(path,{method='GET',body,anonymous=false}={}){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(!anonymous&&token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),data=await r.json(),status=typeof data.code==='number'&&data.code>=400?data.code:r.status;
 if(path==='/api/crafts'&&method==='POST'&&data.craft?.id)ids.add(data.craft.id);
 requests.push({at:new Date().toISOString(),path:path.replace(/(\/shares\/)[A-Za-z0-9_-]{43}/,'$1[redacted]'),method,request:safe(body),httpStatus:r.status,status,response:safe(data)});return {status,data};}
async function create(body){const r=await call('/api/crafts',{method:'POST',body:{...base,...body}});assert.equal(r.status,200);return r.data.craft}
function count(){return Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${owner.id} AND name='${batchName}'`))}
test.before(async()=>{const r=await call('/api/auth/login',{anonymous:true,method:'POST',body:{type:'employee',account:owner.account,password:owner.password}});assert.equal(r.status,200);token=r.data.token});
test.after(async()=>{if(token)await call('/api/auth/logout',{method:'POST',body:{}});for(const id of ids){assert.match(id,/^GY-\d{8}-[A-F0-9]{16}$/);sql(`DELETE FROM maoyi_share WHERE craft_id='${id}';DELETE FROM maoyi_craft WHERE id='${id}' AND owner_id=${owner.id};`)}const captured=JSON.stringify({runId,release,origin,at:new Date().toISOString(),requests,database,cleanup:{ids:[...ids],remaining:ids.size?Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE id IN (${[...ids].map(id=>"'"+id+"'").join(',')})`)):0}},null,2)+'\n';writeFileSync('.data/qa/api-evidence/bounds-contract.json',captured);writeFileSync('.data/qa/api-evidence/bounds-contract-'+release+'.json',captured)});
test('BOUND-01 两种胸围口径的21尺寸统一0..500cm，超界不能新增',async()=>{
 for(const measurementBasis of ['flat','circumference']){
  for(const value of [0,500]){const c=await create({measurementBasis,calculationVersion:measurementBasis==='flat'?'video-v1':'legacy-v0',sizes:Object.fromEntries(fields.map(k=>[k,value]))});for(const field of fields)assert.equal(c.sizes[field],value);assert.equal(c.measurementBasis,measurementBasis)}
  for(const field of fields){const before=count(),r=await call('/api/crafts',{method:'POST',body:{...base,measurementBasis,sizes:{[field]:501}}});assert.equal(r.status,400,measurementBasis+'/'+field);assert.equal(count(),before)}
 }
 const r=await call('/api/crafts',{method:'POST',body:{...base,sizes:{chest:'500.0001'}}});assert.equal(r.status,400);
});
test('BOUND-02 两密度上限1000、零拒绝、空草稿仍允许',async()=>{
 for(const field of ['density','rowDensity'])for(const value of [0,1001,'1000.0001']){const before=count(),r=await call('/api/crafts',{method:'POST',body:{...base,[field]:value}});assert.equal(r.status,400,field+'/'+value);assert.equal(count(),before)}
 const maximum=await create({density:1000,rowDensity:'1000',sizes:{chest:500}});assert.equal(maximum.density,1000);assert.equal(maximum.rowDensity,'1000');
 const empty=await create({density:'',rowDensity:'',sizes:{chest:0}});assert.equal(empty.density,'');assert.equal(empty.rowDensity,'');assert.equal(empty.sizes.chest,0);
});
test('BOUND-03 非法修改保留原payload与version；合法上界修改可回读',async()=>{
 const c=await create({measurementBasis:'circumference',calculationVersion:'legacy-v0',sizes:{chest:100}}),before=sql(`SELECT payload,version FROM maoyi_craft WHERE id='${c.id}'`);
 for(const patch of [{density:1001},{rowDensity:1001},{sizes:{chest:501}},{sizes:{sleeveCuffWidth:501}},{sizes:{placketLength:501}}]){const r=await call('/api/crafts/'+c.id,{method:'PUT',body:{...base,measurementBasis:'circumference',calculationVersion:'legacy-v0',version:1,...patch}});assert.equal(r.status,400);assert.equal(sql(`SELECT payload,version FROM maoyi_craft WHERE id='${c.id}'`),before)}
 const r=await call('/api/crafts/'+c.id,{method:'PUT',body:{...base,measurementBasis:'circumference',calculationVersion:'legacy-v0',version:1,density:1000,rowDensity:1000,sizes:{chest:500}}});assert.equal(r.status,200);assert.equal(r.data.craft.version,2);const reread=(await call('/api/crafts/'+c.id)).data.craft;assert.equal(reread.sizes.chest,500);assert.equal(reread.measurementBasis,'circumference');
});
test('BOUND-04 分享端不接收客户端伪造的超界尺寸与密度',async()=>{
 const c=await create(),r=await call('/api/shares',{method:'POST',body:{craftId:c.id,density:1001,rowDensity:1001,sizes:{chest:501},snapshot:{density:1001,sizes:{chest:501}}}});assert.equal(r.status,200);
 const code=r.data.code,id=createHash('sha256').update(code).digest('hex'),snapshot=(await call('/api/shares/'+code,{anonymous:true})).data.craft;assert.equal(snapshot.density,30);assert.equal(snapshot.rowDensity,40);assert.equal(snapshot.sizes.chest,50);
 const stored=JSON.parse(sql(`SELECT snapshot FROM maoyi_share WHERE token_hash='${id}'`));assert.equal(stored.density,30);assert.equal(stored.sizes.chest,50);
});
