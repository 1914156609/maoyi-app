import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
process.chdir(resolve(import.meta.dirname,'../..'));
const file='.secrets/ui-fixtures.json',origin='http://127.0.0.1:8080';
const action=process.argv[2]||'seed';
const raw=async(path,method='GET',data,token='')=>{const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok||(typeof b.code==='number'&&b.code>=400))throw Error(b.message||b.msg||r.status);return b;};
if(action==='cleanup'){
 if(!existsSync(file))process.exit(0);
 const state=JSON.parse(readFileSync(file,'utf8'));
 for(const c of state.crafts){if(!/^GY-[0-9]{8}-[A-F0-9]{16}$/.test(c.id))throw Error('Unexpected fixture id');execFileSync('mysql',['--protocol=socket','-uroot','maoyi_ruoyi'],{input:`DELETE FROM maoyi_share WHERE craft_id='${c.id}'; DELETE FROM maoyi_audit WHERE craft_id='${c.id}'; DELETE FROM maoyi_chart WHERE craft_id='${c.id}'; DELETE FROM maoyi_craft WHERE id='${c.id}';`});}
 await raw('/api/auth/logout','POST',{},state.token);unlinkSync(file);console.log('Only UI test fixtures removed.');process.exit(0);
}
if(existsSync(file))throw Error('Existing UI fixture state: finish or clean it first.');
const account=JSON.parse(readFileSync('.secrets/java-local.json','utf8')).accounts.find(a=>a.account==='craftmaker');
const login=await raw('/api/auth/login','POST',{type:'employee',account:account.account,password:account.password});
const state={token:login.token,crafts:[],share:null};const save=()=>writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});save();
const sizes={bodyLength:62,chest:100,shoulder:40,armhole:22,armholeDecrease:12,shoulderSlope:4,bodyRib:6,neckWidth:18,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:2.5,backNeckFlat:8,sleeveLength:55,sleeveCapHeight:15,sleeveCapWidth:17,sleeveWidth:17,sleeveRib:5,underarmFlat:2};
for(const [name,style,neck,sleeve]of [['界面验收·圆领套头','套头','圆领','长袖'],['界面验收·V领背心','背心','V领','无袖']]){
 const b={name,style,neck,sleeve,length:'常规',density:68,rowDensity:46,sizes};
 let {craft}=await raw('/api/crafts','POST',b,state.token);state.crafts.push({id:craft.id,name,payload:b});save();
 await raw('/api/crafts/'+craft.id+'/submit','POST',{version:craft.version},state.token);
}
state.share=await raw('/api/shares','POST',{craftId:state.crafts[0].id},state.token);save();
console.log('Prepared two temporary pending crafts and one share for UI verification.');
