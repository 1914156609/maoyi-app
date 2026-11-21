import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
const {runId,accounts}=JSON.parse(readFileSync(new URL('../../.secrets/qa-accounts.json',import.meta.url),'utf8'));
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8080';
const ids=[],charts=[],tokens=[],evidence=[],database=[];
const sql=q=>{const result=execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N'],{input:q,encoding:'utf8'});database.push({at:new Date().toISOString(),query:q,result});return result};
const safe=x=>Array.isArray(x)?x.map(safe):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,/password|token|openid|session_key/i.test(k)||k==='code'&&typeof v==='string'||k==='url'?'[redacted]':safe(v)])):x;
async function call(path,{token,method='GET',body,raw,type='application/json'}={}){
 const r=await fetch(origin+path,{method,headers:{...(type?{'content-type':type}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:raw!==undefined?raw:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={nonJson:text.slice(0,200)}};
 const status=typeof data.code==='number'&&data.code>=400?data.code:r.status;
 evidence.push({at:new Date().toISOString(),path:path.replace(/(\/shares\/)[A-Za-z0-9_-]{43}/,'$1[share-code]'),method,authenticated:!!token,request:raw!==undefined?{rawBytes:Buffer.byteLength(raw)}:safe(body),httpStatus:r.status,status,response:safe(data)});
 return {status,data,headers:r.headers};
}
async function login(lane){const a=accounts[lane];const r=await call('/api/auth/login',{method:'POST',body:{type:'employee',account:a.account,password:a.password}});assert.equal(r.status,200);tokens.push(r.data.token);return r.data.token;}
const input={name:'QA接口边界样单',style:'套头',neck:'圆领',sleeve:'长袖',length:'常规',measurementBasis:'flat',calculationVersion:'video-v1',density:'30',rowDensity:'40',sizes:{bodyLength:60,chest:50,shoulder:37,armhole:23,armholeDecrease:7.5,shoulderSlope:3,bodyRib:6,neckWidth:20,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:3,backNeckFlat:15,sleeveLength:55,sleeveCapHeight:15,sleeveCapWidth:8,sleeveWidth:17,sleeveCuffWidth:12,sleeveRib:5,underarmFlat:2,placketWidth:'',placketLength:''}};
async function create(body={},token=maker){const r=await call('/api/crafts',{token,method:'POST',body:{...input,...body}});assert.equal(r.status,200);ids.push(r.data.craft.id);return r.data.craft;}
const ownCount=()=>Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${accounts.api.id}`).trim());
let maker,peer,manager;
test.before(async()=>{assert.equal((await call('/api/health')).data.backend,'ruoyi-java');maker=await login('api');peer=await login('peer');manager=await login('admin');});
test.after(async()=>{
 for(const token of tokens)await call('/api/auth/logout',{token,method:'POST',body:{}});
 for(const id of charts){assert.match(id,/^qa-chart-[a-f0-9-]+$/);sql(`DELETE FROM maoyi_chart WHERE id='${id}'`)}
 for(const id of ids){assert.match(id,/^GY-[0-9]{8}-[A-F0-9]{16}$/);sql(`DELETE FROM maoyi_share WHERE craft_id='${id}'; DELETE FROM maoyi_audit WHERE craft_id='${id}'; DELETE FROM maoyi_chart WHERE craft_id='${id}'; DELETE FROM maoyi_craft WHERE id='${id}';`)}
 mkdirSync('.data/qa/api-evidence',{recursive:true});const captured=JSON.stringify({runId,release:process.env.QA_RELEASE_ID||'unfrozen',origin,at:new Date().toISOString(),requests:evidence,database,cleanup:{craftIds:ids,chartIds:charts}},null,2)+'\n';writeFileSync('.data/qa/api-evidence/http-gaps.json',captured);writeFileSync('.data/qa/api-evidence/http-gaps-'+(process.env.QA_RELEASE_ID||'unfrozen')+'.json',captured);
});
test('API-001 匿名不能读取私有工艺、图纸和管理数据',async()=>{for(const path of ['/api/crafts','/api/charts','/api/auth/me','/maoyi/craft/list','/maoyi/share/list'])assert.equal((await call(path)).status,401,path)});
test('API-003 登录字段拒绝空值、未知方式与过长账号',async()=>{
 const before=sql('SELECT COUNT(*) FROM sys_user; SELECT COUNT(*) FROM maoyi_member;');
 for(const body of [{type:'invalid'},{type:'employee',account:'x'.repeat(31),password:'testpass'},{type:'employee',account:accounts.api.account,password:'x'.repeat(31)}])assert.equal((await call('/api/auth/login',{method:'POST',body})).status,400);
 assert.equal((await call('/api/auth/login',{method:'POST',body:{type:'employee',account:'',password:''}})).status,401);assert.equal(sql('SELECT COUNT(*) FROM sys_user; SELECT COUNT(*) FROM maoyi_member;'),before);
});
test('API-008 名称类型、枚举与长度边界',async()=>{
 for(const name of ['', '   ', 'x'.repeat(61),true,123,{x:1},['a']])assert.equal((await call('/api/crafts',{token:maker,method:'POST',body:{...input,name}})).status,400,JSON.stringify(name));
 for(const name of ['衣','长'.repeat(60),'毛衣🧶<script>']){const c=await create({name});assert.equal(c.name,name)}
 for(const [field,value] of [['style','unknown'],['neck','高领'],['sleeve',null],['length',false],['measurementBasis','full'],['measurementBasis',null],['calculationVersion','video-v999']])assert.equal((await call('/api/crafts',{token:maker,method:'POST',body:{...input,[field]:value}})).status,400,field);
});
test('API-009 尺寸与密度有限数字及新字段清理',async()=>{
 for(const value of [-1,501,10001,'NaN','Infinity','1d','0x1.8p1',' ',true,{},[]])assert.equal((await call('/api/crafts',{token:maker,method:'POST',body:{...input,sizes:{chest:value}}})).status,400,JSON.stringify(value));
 for(const value of [0,-1,1001,10001,'NaN','Infinity',' ',true,{},[]])assert.equal((await call('/api/crafts',{token:maker,method:'POST',body:{...input,density:value}})).status,400,JSON.stringify(value));
 for(const sizes of [{chest:0},{chest:500},{chest:'0.25',sleeveCuffWidth:12,placketWidth:3,placketLength:60,unknownSize:999}]){const c=await create({sizes});assert.equal(c.sizes.chest,sizes.chest);assert.equal(c.sizes.unknownSize,undefined);if(sizes.sleeveCuffWidth)assert.equal(c.sizes.sleeveCuffWidth,12)}
 const c=await create({density:'',rowDensity:'',sizes:{}});assert.equal(c.density,'');assert.equal(c.sizes.chest,'');
});
test('API-010 请求内容类型、解析异常与大小限制均为明确4xx',async()=>{
 for(const raw of ['{','[]','null'])assert.equal((await call('/api/crafts',{token:maker,method:'POST',raw})).status,400,raw);
 assert.equal((await call('/api/crafts',{token:maker,method:'POST',raw:'x',type:'text/plain'})).status,415);
 const base={...input,padding:''},padding=65536-Buffer.byteLength(JSON.stringify(base)),raw=JSON.stringify({...base,padding:'x'.repeat(padding)});assert.equal(Buffer.byteLength(raw),65536);
 const boundary=await call('/api/crafts',{token:maker,method:'POST',raw});assert.equal(boundary.status,200);ids.push(boundary.data.craft.id);assert.equal(boundary.data.craft.padding,undefined);
 assert.equal((await call('/api/crafts',{token:maker,method:'POST',raw:raw+' '})).status,413);
});
test('API-011 跨主体修改、提交、分享和图纸关联无副作用',async()=>{
 const c=await create();
 for(const [path,method,body] of [['/api/crafts/'+c.id,'GET'],['/api/crafts/'+c.id,'PUT',{...input,version:c.version}],['/api/crafts/'+c.id+'/submit','POST',{version:c.version}],['/api/shares','POST',{craftId:c.id}],['/api/charts','POST',{craftId:c.id}]])assert.equal((await call(path,{token:peer,method,body})).status,404,path);
 const actual=(await call('/api/crafts/'+c.id,{token:maker})).data.craft;assert.equal(actual.version,1);assert.equal(actual.status,'draft');assert.equal(actual.history.length,0);
});
test('API-012 同版本并发编辑仅一次成功且不丢失版本',async()=>{
 const c=await create();for(const version of [undefined,0,1.5,'1',true])assert.equal((await call('/api/crafts/'+c.id,{token:maker,method:'PUT',body:{...input,version}})).status,409);const results=await Promise.all(['A','B'].map(name=>call('/api/crafts/'+c.id,{token:maker,method:'PUT',body:{...input,name,version:c.version}})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);const actual=(await call('/api/crafts/'+c.id,{token:maker})).data.craft;assert.equal(actual.version,2);assert.ok(['A','B'].includes(actual.name));assert.equal((await call('/api/crafts/'+c.id,{token:maker,method:'PUT',body:{...input,version:1}})).status,409);
});
test('API-013 同版本并发提交仅一条待审核记录',async()=>{
 const c=await create();const results=await Promise.all([1,2].map(()=>call('/api/crafts/'+c.id+'/submit',{token:maker,method:'POST',body:{version:c.version}})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);const actual=(await call('/api/crafts/'+c.id,{token:maker})).data.craft;assert.equal(actual.version,2);assert.equal(actual.history.length,1);
});
test('API-014/015 非法审批及驳回原因500字边界',async()=>{
 let c=await create();assert.equal((await call('/maoyi/craft/'+c.id+'/review',{token:manager,method:'POST',body:{version:1,decision:'approved'}})).status,409);
 c=(await call('/api/crafts/'+c.id+'/submit',{token:maker,method:'POST',body:{version:1}})).data.craft;
 for(const body of [{version:2,decision:'invalid'},{version:2,decision:'rejected',note:' '},{version:2,decision:'rejected',note:'字'.repeat(501)}])assert.equal((await call('/maoyi/craft/'+c.id+'/review',{token:manager,method:'POST',body})).status,400);
 for(const version of [undefined,0,1.5,'2',true])assert.equal((await call('/maoyi/craft/'+c.id+'/review',{token:manager,method:'POST',body:{version,decision:'approved'}})).status,409);
 const result=await call('/maoyi/craft/'+c.id+'/review',{token:manager,method:'POST',body:{version:2,decision:'rejected',note:'字'.repeat(500)}});assert.equal(result.status,200);
 const actual=(await call('/api/crafts/'+c.id,{token:maker})).data.craft;assert.equal(actual.history.at(-1).note.length,500);assert.equal(actual.version,3);assert.equal(Number(sql(`SELECT CHAR_LENGTH(note) FROM maoyi_audit WHERE craft_id='${c.id}' AND version=3`).trim()),500);
 let one=await create();one=(await call('/api/crafts/'+one.id+'/submit',{token:maker,method:'POST',body:{version:1}})).data.craft;assert.equal((await call('/maoyi/craft/'+one.id+'/review',{token:manager,method:'POST',body:{version:2,decision:'rejected',note:'改'}})).status,200);
});
test('API-018 管理分页参数返回400并按名称字面搜索',async()=>{
 for(const path of ['/maoyi/craft/list','/maoyi/share/list'])for(const query of ['pageNum=0','pageNum=-1','pageNum=abc','pageSize=0','pageSize=101','pageSize=abc','pageNum=9999999999999'])assert.equal((await call(path+'?'+query,{token:manager})).status,400,path+'?'+query);
 const c=await create({name:"QA百分号%_引号'验收"});const response=await call('/maoyi/craft/list?name='+encodeURIComponent('%_'),{token:manager});assert.equal(response.status,200);assert.ok(response.data.rows.some(x=>x.id===c.id));assert.ok(response.data.rows.every(x=>x.name.includes('%_')));
 assert.equal((await call('/maoyi/craft/list?status=invalid',{token:manager})).status,400);const quoteSearch=await call('/maoyi/craft/list?name='+encodeURIComponent("'验收"),{token:manager});assert.ok(quoteSearch.data.rows.some(x=>x.id===c.id));assert.equal(quoteSearch.data.total,Number(sql("SELECT COUNT(*) FROM maoyi_craft WHERE LOCATE(CONCAT(CHAR(39),'验收'),name)>0").trim()));
 const empty=await call('/maoyi/craft/list?pageNum=2147483647',{token:manager});assert.equal(empty.status,200);assert.equal(empty.data.rows.length,0);
});
test('API-019 分享管理名称与不可变快照相同',async()=>{
 const c=await create({name:'QA分享时名称'}),share=await call('/api/shares',{token:maker,method:'POST',body:{craftId:c.id}});assert.equal(share.status,200);
 await call('/api/crafts/'+c.id,{token:maker,method:'PUT',body:{...input,name:'QA修改后的名称',density:32,sizes:{...input.sizes,chest:51},version:1}});
 const items=(await call('/maoyi/share/list?pageSize=100',{token:manager})).data.rows;assert.equal(items.find(x=>x.craftId===c.id).name,c.name);
 const snapshot=(await call('/api/shares/'+share.data.code)).data.craft;assert.equal(snapshot.name,c.name);assert.equal(snapshot.measurementBasis,'flat');assert.equal(snapshot.calculationVersion,'video-v1');assert.deepEqual(snapshot.parts,[]);assert.equal(snapshot.density,'30');assert.equal(snapshot.sizes.chest,50);const live=(await call('/api/crafts/'+c.id,{token:maker})).data.craft;assert.equal(live.density,32);assert.equal(live.sizes.chest,51);
});
test('API-021/022 工艺图关联与开关保存后回读一致',async()=>{
 const a=await create(),b=await create(),id='qa-chart-'+randomUUID();charts.push(id);
 let r=await call('/api/charts',{token:maker,method:'POST',body:{id,craftId:a.id,showText:false,showDimensions:true,locked:true}});assert.equal(r.status,200);
 r=await call('/api/charts',{token:maker,method:'POST',body:{id,craftId:b.id,showText:true,showDimensions:false,locked:false}});assert.equal(r.status,200);assert.equal(r.data.chart.craftId,b.id);
 const chart=(await call('/api/charts',{token:maker})).data.charts.find(x=>x.id===id);assert.equal(chart.craftId,b.id);assert.equal(chart.showDimensions,false);assert.equal(chart.locked,false);assert.equal(sql(`SELECT craft_id FROM maoyi_chart WHERE id='${id}'`).trim(),b.id);
 assert.equal((await call('/api/charts',{token:maker,method:'POST',body:{id,craftId:b.id,locked:'false'}})).status,400);
});
test('API-023 他人图纸id不可更新或读取',async()=>{
 const c=await create(),id='qa-chart-'+randomUUID();charts.push(id);assert.equal((await call('/api/charts',{token:maker,method:'POST',body:{id,craftId:c.id,locked:true}})).status,200);
 assert.equal((await call('/api/charts',{token:peer,method:'POST',body:{id,locked:false}})).status,404);assert.ok(!(await call('/api/charts',{token:peer})).data.charts.some(x=>x.id===id));assert.equal((await call('/api/charts',{token:maker})).data.charts.find(x=>x.id===id).locked,true);
});
test('API-024 主管角色撤销后旧token不再有业务权限',async()=>{
 let c=await create();c=(await call('/api/crafts/'+c.id+'/submit',{token:maker,method:'POST',body:{version:1}})).data.craft;const token=await login('revoked');try{sql(`DELETE FROM sys_user_role WHERE user_id=${accounts.revoked.id} AND role_id=212`);assert.equal((await call('/maoyi/craft/list',{token})).status,403);assert.equal((await call('/maoyi/share/list',{token})).status,403);assert.equal((await call('/maoyi/craft/'+c.id+'/review',{token,method:'POST',body:{version:2,decision:'approved'}})).status,403)}finally{sql(`INSERT IGNORE INTO sys_user_role(user_id,role_id) VALUES(${accounts.revoked.id},212)`)}
});
test('API-025/027 新旧计算口径明确且客户端派生结果不可伪造',async()=>{
 const defaulted=await create({measurementBasis:undefined,calculationVersion:undefined});assert.equal(defaulted.measurementBasis,'circumference');assert.equal(defaulted.calculationVersion,'legacy-v0');
 const c=await create({parts:[['fake','999999','forged']],calculation:{castOn:999999},ownerId:'1',status:'approved',history:[{status:'approved'}]});assert.equal(c.measurementBasis,'flat');assert.equal(c.calculationVersion,'video-v1');assert.deepEqual(c.parts,[]);assert.equal(c.calculation,undefined);assert.equal(c.ownerId,String(accounts.api.id));assert.equal(c.status,'draft');assert.deepEqual(c.history,[]);const storedNew=JSON.parse(sql(`SELECT payload FROM maoyi_craft WHERE id='${c.id}'`).trim());assert.equal(storedNew.ownerId,undefined);assert.equal(storedNew.history,undefined);assert.deepEqual(storedNew.parts,[]);
 const old=await create({measurementBasis:'circumference',calculationVersion:'legacy-v0',sizes:{chest:100}});
 sql(`UPDATE maoyi_craft SET payload=JSON_REMOVE(payload,'$.measurementBasis','$.calculationVersion') WHERE id='${old.id}'`);
 const before=sql(`SELECT payload FROM maoyi_craft WHERE id='${old.id}'`).trim();const read=(await call('/api/crafts/'+old.id,{token:maker})).data.craft;assert.equal(read.measurementBasis,'circumference');assert.equal(read.calculationVersion,'legacy-v0');assert.equal(read.sizes.chest,100);assert.equal(sql(`SELECT payload FROM maoyi_craft WHERE id='${old.id}'`).trim(),before);
 const share=(await call('/api/shares',{token:maker,method:'POST',body:{craftId:old.id}})).data;const snap=(await call('/api/shares/'+share.code)).data.craft;assert.equal(snap.measurementBasis,'circumference');assert.equal(snap.calculationVersion,'legacy-v0');
 const shareId=createHash('sha256').update(share.code).digest('hex');sql(`UPDATE maoyi_share SET snapshot=JSON_REMOVE(snapshot,'$.measurementBasis','$.calculationVersion') WHERE token_hash='${shareId}' AND owner_id=${accounts.api.id}`);
 const stored=sql(`SELECT snapshot FROM maoyi_share WHERE token_hash='${shareId}'`).trim();const legacySnapshot=(await call('/api/shares/'+share.code)).data.craft;assert.equal(legacySnapshot.measurementBasis,'circumference');assert.equal(legacySnapshot.calculationVersion,'legacy-v0');assert.equal(sql(`SELECT snapshot FROM maoyi_share WHERE token_hash='${shareId}'`).trim(),stored);
});
test('API-026 不存在对象与协议异常返回明确4xx',async()=>{
 for(const path of ['/api/crafts/GY-19000101-0000000000000000','/api/crafts/'+'A'.repeat(200),'/api/shares/invalid','/api/shares/'+'A'.repeat(43),'/api/no-such-qa-route'])assert.equal((await call(path,{token:maker})).status,404,path);
 const method=await call('/api/crafts',{token:maker,method:'DELETE'});assert.equal(method.status,405);assert.ok(method.headers.get('allow')?.includes('GET'));
});
test('API-004 专用账号登录限流不会影响其他会话',async()=>{
 const a=accounts.limit;let last;
 try{for(let i=0;i<13;i++)last=await call('/api/auth/login',{method:'POST',body:{type:'employee',account:a.account,password:'wrong-password'}});assert.equal(last.status,429);assert.equal((await call('/api/auth/me',{token:maker})).status,200)}
 finally{
  execFileSync('redis-cli',['-p','6388','DEL','pwd_err_cnt:'+a.account],{stdio:'ignore'});
  const slot='maoyi:rate:'+createHash('sha256').update('account:'+a.account.toLowerCase()+':'+Math.floor(Date.now()/900000)).digest('hex');execFileSync('redis-cli',['-p','6388','DEL',slot],{stdio:'ignore'});
 }
});
