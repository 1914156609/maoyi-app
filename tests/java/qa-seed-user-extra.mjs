import {readFileSync,writeFileSync} from 'node:fs';
const release=process.env.QA_RELEASE_ID,origin=process.env.MAOYI_TEST_ORIGIN;
if(!origin||!release)throw Error('Set frozen origin/release');
const {accounts}=JSON.parse(readFileSync('.secrets/qa-accounts.json')),file='.secrets/qa-user-data.json',state=JSON.parse(readFileSync(file));
if(state.crafts.some(c=>c.scenario==='filterPending'))throw Error('Additional objects already seeded');
const tokens=[];
async function request(path,token,method='GET',body){const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),b=await r.json();if(!r.ok||typeof b.code==='number'&&b.code>=400)throw Error(b.msg||b.message);return b}
async function login(lane){const a=accounts[lane],b=await request('/api/auth/login',null,'POST',{type:'employee',account:a.account,password:a.password});tokens.push(b.token);return b.token}
function save(){writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});const handoff=JSON.parse(readFileSync('.data/qa/handoff.json'));handoff.lanes=handoff.lanes.map(s=>s.lane==='user'?state:s);writeFileSync('.data/qa/handoff.json',JSON.stringify(handoff,null,2)+'\n')}
try{
 const user=await login('user'),admin=await login('admin'),base=(await request('/api/crafts/'+state.crafts[0].id,user)).craft;
 const cases=[['filterPending','QA用户-筛选待审核','pending','套头','圆领'],['filterApproved','QA用户-筛选已通过','approved','背心','V领'],['longName','QA用户-长名称'.padEnd(60,'长'),'draft','套头','圆领'],['recentExtra','QA用户-最近浏览补充','draft','开衫','V领']];
 for(const [scenario,name,target,style,neck]of cases){
  const payload={name,style,neck,sleeve:style==='背心'?'无袖':'长袖',length:'常规',measurementBasis:'flat',calculationVersion:'video-v1',density:base.density,rowDensity:base.rowDensity,sizes:base.sizes};
  let {craft}=await request('/api/crafts',user,'POST',payload);
  state.crafts.push({id:craft.id,state:craft.status,version:craft.version,lane:'user',release,objectType:'craft',scenario,name,measurementBasis:craft.measurementBasis,calculationVersion:craft.calculationVersion});save();
  if(target!=='draft')craft=(await request('/api/crafts/'+craft.id+'/submit',user,'POST',{version:craft.version})).craft;
  if(target==='approved')craft=(await request('/maoyi/craft/'+craft.id+'/review',admin,'POST',{version:craft.version,decision:'approved',note:''})).data;
  Object.assign(state.crafts.at(-1),{state:craft.status,version:craft.version});save();
 }
 console.log('Added four independent user filter/recent fixtures; original two unchanged. No browser recent-history data written.');
}finally{for(const token of tokens)await request('/api/auth/logout',token,'POST',{}).catch(()=>{})}
