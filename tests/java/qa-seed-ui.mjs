// Isolated, version-labelled fixtures. This is test-data preparation, not UI evidence.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const config=JSON.parse(readFileSync('.secrets/qa-accounts.json','utf8'));
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8080';
const release=process.env.QA_RELEASE_ID;
if(!release)throw Error('Set QA_RELEASE_ID to the frozen release');
const privateFiles={adminOwner:'.secrets/qa-admin-data.json',user:'.secrets/qa-user-data.json'};
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'});
function save(state){
 writeFileSync(privateFiles[state.lane],JSON.stringify(state,null,2)+'\n',{mode:0o600});mkdirSync('.data/qa',{recursive:true});
 const current=existsSync('.data/qa/handoff.json')?JSON.parse(readFileSync('.data/qa/handoff.json','utf8')):{runId:config.runId,release,lanes:[]};
 if(current.runId!==config.runId)throw Error('Public handoff run mismatch');
 const publicLane={...state,shares:state.shares.map(({code,url,...share})=>share)};
 current.lanes=current.lanes.filter(l=>l.lane!==state.lane).concat(publicLane);current.lastPreparedRelease=release;current.preparedAt=new Date().toISOString();
 writeFileSync('.data/qa/handoff.json',JSON.stringify(current,null,2)+'\n');
}
if(process.argv[2]==='arm-expiry'){
 const state=JSON.parse(readFileSync(privateFiles.adminOwner,'utf8'));
 if(state.runId!==config.runId)throw Error('Run mismatch');
 const target=state.shares.find(s=>s.scenario==='shortExpiry'),seconds=Number(process.argv[3]||90);
 if(!target||!/^([a-f0-9]{64})$/.test(target.id)||!Number.isInteger(seconds)||seconds<30||seconds>3600)throw Error('Invalid expiry fixture');
 const expires=Date.now()+seconds*1000;
 sql(`UPDATE maoyi_share SET expires_at=${expires} WHERE token_hash='${target.id}' AND owner_id=${state.ownerId} AND revoked=FALSE;`);
 target.expiresAt=expires;target.state='active';target.armedForRelease=release;save(state);
 console.log('Armed tracked QA short-expiry link; updated expiration is in .data/qa/handoff.json');process.exit(0);
}
for(const f of Object.values(privateFiles))if(existsSync(f))throw Error('Fixtures already tracked; preserve agents’ objects');
const request=async(path,{token,method='GET',body}={})=>{
 const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const b=await r.json();if(!r.ok||typeof b.code==='number'&&b.code>=400)throw Error((b.message||b.msg||r.status)+' at '+path);return b;
};
const tokens=[];async function login(lane){const a=config.accounts[lane];const b=await request('/api/auth/login',{method:'POST',body:{type:'employee',account:a.account,password:a.password}});tokens.push(b.token);return b.token}
const sizes={bodyLength:60,chest:50,shoulder:37,armhole:23,armholeDecrease:7.5,shoulderSlope:3,bodyRib:6,neckWidth:20,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:3,backNeckFlat:15,sleeveLength:55,sleeveCapHeight:15,sleeveCapWidth:8,sleeveWidth:17,sleeveCuffWidth:12,sleeveRib:5,underarmFlat:2,placketWidth:3,placketLength:54};
const adminSpecs=[
 {scenario:'approve',name:'QA管理-通过审批样单',status:'pending'},
 {scenario:'reject',name:'QA管理-驳回审批样单',status:'pending',style:'背心',neck:'V领'},
 {scenario:'concurrent',name:'QA管理-并发审批样单',status:'pending'},
 {scenario:'longName',name:'QA管理-长名称'.padEnd(60,'长'),status:'pending'},
 {scenario:'share',name:'QA管理-分享快照样单',status:'draft',style:'开衫',neck:'V领'},
 {scenario:'legacy',name:'QA管理-旧全围口径样单',status:'draft',legacy:true},
 {scenario:'approved',name:'QA管理-已通过样单',status:'approved'},
 {scenario:'rejected',name:'QA管理-已驳回样单',status:'rejected',style:'背心',neck:'V领'},
 ...Array.from({length:8},(_,i)=>({scenario:'pagination'+(i+1),name:'QA管理-分页样单'+(i+1),status:'draft'}))
];
const userSpecs=[{scenario:'editDraft',name:'QA用户-可编辑草稿',status:'draft'},{scenario:'editRejected',name:'QA用户-驳回后重提',status:'rejected',style:'开衫',neck:'V领'}];
try{
 const manager=await login('admin');
 for(const [lane,specs]of [['adminOwner',adminSpecs],['user',userSpecs]]){
  const maker=await login(lane),state={runId:config.runId,release,lane,ownerId:config.accounts[lane].id,crafts:[],shares:[]};save(state);
  for(const spec of specs){
   const {name,status,legacy}=spec,style=spec.style||'套头',neck=spec.neck||'圆领';
   const payload={name,style,neck,sleeve:style==='背心'?'无袖':'长袖',length:'常规',measurementBasis:legacy?'circumference':'flat',calculationVersion:legacy?'legacy-v0':'video-v1',density:30,rowDensity:40,sizes:{...sizes,chest:legacy?100:50}};
   let {craft}=await request('/api/crafts',{token:maker,method:'POST',body:payload});
   state.crafts.push({id:craft.id,state:craft.status,version:craft.version,lane,release,objectType:'craft',scenario:spec.scenario,name,measurementBasis:craft.measurementBasis,calculationVersion:craft.calculationVersion});save(state);
   if(craft.measurementBasis!==payload.measurementBasis||craft.calculationVersion!==payload.calculationVersion)throw Error('Runtime lacks canonical calculation contract; deploy the built release before seeding');
   if(status!=='draft')craft=(await request('/api/crafts/'+craft.id+'/submit',{token:maker,method:'POST',body:{version:craft.version}})).craft;
   if(['approved','rejected'].includes(status))craft=(await request('/maoyi/craft/'+craft.id+'/review',{token:manager,method:'POST',body:{version:craft.version,decision:status,note:status==='rejected'?'QA预置：请核对挂肩尺寸':''}})).data;
   if(legacy)sql(`UPDATE maoyi_craft SET payload=JSON_REMOVE(payload,'$.measurementBasis','$.calculationVersion') WHERE id='${craft.id}' AND owner_id=${state.ownerId};`);
   Object.assign(state.crafts.at(-1),{state:craft.status,version:craft.version});save(state);
  }
  if(lane==='adminOwner'){
   const target=state.crafts.find(c=>c.scenario==='share');
   for(const scenario of ['active','expired','revoked','shortExpiry']){
    const share=await request('/api/shares',{token:maker,method:'POST',body:{craftId:target.id}}),id=createHash('sha256').update(share.code).digest('hex');
    const record={...share,id,craftId:target.id,lane,release,objectType:'share',scenario,state:'active',version:target.version};state.shares.push(record);save(state);
    if(scenario==='expired'||scenario==='shortExpiry'){
     record.expiresAt=scenario==='expired'?0:Date.now()+120000;
     sql(`UPDATE maoyi_share SET expires_at=${record.expiresAt} WHERE token_hash='${id}' AND owner_id=${state.ownerId};`);record.state=scenario==='expired'?'expired':'active';
    }
    if(scenario==='revoked'){await request('/maoyi/share/'+id+'/revoke',{token:manager,method:'PUT',body:{}});record.state='revoked'}save(state);
   }
  }
 }
 console.log('Prepared independent management and user fixtures. Public IDs/state/version: .data/qa/handoff.json; access codes only in .secrets.');
}finally{for(const token of tokens)await request('/api/auth/logout',{token,method:'POST',body:{}}).catch(()=>{})}
