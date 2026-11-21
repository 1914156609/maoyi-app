// Additional independent share rows for management pagination/long-name UI tests.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const credentials=JSON.parse(readFileSync('.secrets/qa-accounts.json')),file='.secrets/qa-admin-data.json',state=JSON.parse(readFileSync(file)),release=process.env.QA_RELEASE_ID,origin=process.env.MAOYI_TEST_ORIGIN;
if(!release||!origin)throw Error('Set release and origin');
const scenarios=[...Array.from({length:7},(_,i)=>'pagination'+(i+1)),'longName'];
if(state.shares.some(s=>s.scenario?.startsWith('table-')))throw Error('Preserve prior pagination share fixtures');
async function req(path,token,body){const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),data=await r.json();if(!r.ok||typeof data.code==='number'&&data.code>=400)throw Error(data.msg||data.message);return data}
const a=credentials.accounts.adminOwner,login=await req('/api/auth/login',null,{type:'employee',account:a.account,password:a.password});
function save(newShare){writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});const handoff=JSON.parse(readFileSync('.data/qa/handoff.json')),lane=handoff.lanes.find(l=>l.lane==='adminOwner');const {code,url,...publicShare}=newShare;lane.shares.push(publicShare);writeFileSync('.data/qa/handoff.json',JSON.stringify(handoff,null,2)+'\n')}
try{for(const scenario of scenarios){const craft=state.crafts.find(c=>c.scenario===scenario);if(!craft)throw Error('Missing tracked craft scenario');const share=await req('/api/shares',login.token,{craftId:craft.id});const entry={...share,id:createHash('sha256').update(share.code).digest('hex'),craftId:craft.id,lane:'adminOwner',release,objectType:'share',scenario:'table-'+scenario,name:craft.name,state:'active',version:craft.version};state.shares.push(entry);save(entry)}}finally{await req('/api/auth/logout',login.token,{})}
console.log('Added eight management-only share rows with distinct names; existing active target and craft untouched.');
