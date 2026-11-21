import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const {accounts,runId}=JSON.parse(readFileSync('.secrets/qa-accounts.json'));
const origin=process.env.MAOYI_TEST_ORIGIN,release=process.env.QA_RELEASE_ID;
if(!origin||!release)throw Error('Fixed runtime origin and release required');
const evidence=[];
async function request(lane,path,token,method='GET',body){
 const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),b=await r.json();const status=typeof b.code==='number'&&b.code>=400?b.code:r.status;
 evidence.push({at:new Date().toISOString(),lane,path,method,status,response:path==='/api/auth/login'?{user:b.user,token:'[redacted]'}:b});return {status,data:b};
}
for(const lane of ['craftRead','shareRead','noManagement']){
 const a=accounts[lane],logged=await request(lane,'/api/auth/login',null,'POST',{type:'employee',account:a.account,password:a.password});assert.equal(logged.status,200);const token=logged.data.token;
 try{
  const crafts=await request(lane,'/maoyi/craft/list',token),shares=await request(lane,'/maoyi/share/list',token);
  assert.equal(crafts.status,lane==='craftRead'?200:403);assert.equal(shares.status,lane==='shareRead'?200:403);
  assert.equal((await request(lane,'/maoyi/craft/GY-19000101-0000000000000000/review',token,'POST',{version:1,decision:'approved'})).status,403);
  assert.equal((await request(lane,'/maoyi/share/'+'0'.repeat(64)+'/revoke',token,'PUT',{})).status,403);
  const router=await request(lane,'/getRouters',token);assert.equal(router.status,200);const routes=JSON.stringify(router.data.data);assert.equal(routes.includes('maoyi/craft/index'),lane==='craftRead');assert.equal(routes.includes('maoyi/share/index'),lane==='shareRead');assert.equal(routes.includes('maoyi/approval/index'),false);
 }finally{await request(lane,'/api/auth/logout',token,'POST',{})}
}
writeFileSync('.data/qa/api-evidence/permission-matrix.json',JSON.stringify({release,origin,runId,at:new Date().toISOString(),result:'仅自动化通过',matrixCases:15,assertions:27,requests:evidence,cleanup:'只读数据，写请求均403且对象为不存在ID；已退出3个临时会话'},null,2)+'\n');
console.log('15 restricted-role endpoint scenarios / 27 assertions passed; no business objects mutated.');
