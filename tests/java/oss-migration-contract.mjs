// Explicit two-phase HTTP probe. Not part of the ordinary node:test glob.
// Only owned QA fixtures, exact SQL IDs and paths are changed/removed.
import {readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync,unlinkSync,statSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

const phase=process.argv[2],cleanupOnly=process.argv.includes('--cleanup-only'),origin=process.env.MAOYI_TEST_ORIGIN||`http://127.0.0.1:${phase==='baseline'?8081:8082}`;
if(!['baseline','candidate'].includes(phase)||!/^http:\/\/127\.0\.0\.1:808[12]$/.test(origin))throw Error('Use baseline/candidate with local 8081/8082');
const release=process.env.QA_RELEASE_ID;
if(!release||!/^qa-[a-zA-Z0-9-]+$/.test(release))throw Error('An explicit QA_RELEASE_ID is required');
const evidenceRun=process.env.QA_OSS_EVIDENCE_RUN||'';
if(evidenceRun&&!/^[a-zA-Z0-9_-]+$/.test(evidenceRun))throw Error('Use a unique child evidence directory name');
const out=resolve('.data/qa/current-review/round30/http-contract',evidenceRun),stateFile=resolve(process.env.QA_OSS_STATE_FILE||'.secrets/qa-r30-oss-http-contract.json');
if(!stateFile.startsWith(resolve('.secrets')+sep))throw Error('Private session state must remain inside .secrets');
mkdirSync(out,{recursive:true});
const declaredJar=process.env.QA_CONTRACT_JAR;
if(declaredJar){
 const jarSha256=createHash('sha256').update(readFileSync(declaredJar)).digest('hex');
 if(process.env.QA_CONTRACT_EXPECTED_SHA&&jarSha256!==process.env.QA_CONTRACT_EXPECTED_SHA)throw Error('Declared Jar SHA mismatch');
 const pids=[...new Set([...execFileSync('lsof',['-nP',`-iTCP:${new URL(origin).port}`,'-sTCP:LISTEN','-Fp'],{encoding:'utf8'}).matchAll(/^p(\d+)$/gm)].map(match=>Number(match[1])))];
 if(pids.length!==1)throw Error('Expected one Java listener at declared origin');
 const command=execFileSync('ps',['-p',String(pids[0]),'-o','command='],{encoding:'utf8'}).trim();
 if(!command.includes('-jar '+declaredJar)&&!command.includes('-jar '+resolve(declaredJar)))throw Error('Listener does not run declared Jar');
 writeFileSync(resolve(out,phase+'-running-fingerprint.json'),JSON.stringify({phase,release,origin,pid:pids[0],jarPath:declaredJar,jarSha256,verifiedAt:new Date().toISOString()},null,2)+'\n');
}
const resultFile=resolve(out,phase+'.json');
if(!cleanupOnly&&existsSync(resultFile)&&JSON.parse(readFileSync(resultFile)).complete)throw Error('Completed evidence exists; preserve it before an intentional rerun');
const accounts=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts;
if(accounts.api.id!==106||accounts.systemAdmin.id!==114)throw Error('Only the expected independent QA accounts are allowed');
const config=JSON.parse(readFileSync('.secrets/java-local.json')),uploadRoot=resolve(config.env.UPLOAD_PATH);
if(!uploadRoot.startsWith(resolve('.data')+sep))throw Error('Unexpected upload root');
let state;
if(existsSync(stateFile)){state=JSON.parse(readFileSync(stateFile));if(statSync(stateFile).mode&0o077)throw Error('Private state must be mode600');}
else{if(phase!=='baseline')throw Error('Baseline private state missing');state={runId:randomBytes(6).toString('hex'),createdAt:new Date().toISOString(),oldTokens:{},phases:{}};}
const save=()=>{writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});chmodSync(stateFile,0o600);};
save();
if(phase==='candidate'&&(!state.baselineComplete||!existsSync(resolve(out,'baseline.json'))))throw Error('Complete the baseline first');
const prefix='QA_R30_OSS_'+state.runId+'_'+phase;
if(!cleanupOnly&&state.phases[phase]?.cleaned){state.history||=[];state.history.push(state.phases[phase]);delete state.phases[phase];}
const own=state.phases[phase]||={prefix,craftIds:[],chartIds:[],files:[],tokens:[],generatorId:null,avatarBefore:null,avatarChanged:null,intents:[]};
save();
const requests=[],checks=[],failures=[],cleanup={};
const sql=query=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','--raw','-N','maoyi_ruoyi'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const q=value=>value===null?'NULL':`CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const numericId=id=>{if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid owned numeric ID');return id;};
const intent=(kind,details)=>{own.intents.push({kind,...details,at:new Date().toISOString()});save();};
function safeMessage(value){return String(value).replace(/Bearer\s+\S+/gi,'[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]').replace(/\/profile\/[^\s"'<>]+/g,'[file]').replace(/QA_R30_OSS_[a-zA-Z0-9_]+/g,'[fixture]').slice(0,300);}
function shape(value,depth=0){
 if(value===null)return 'null';if(Array.isArray(value))return {type:'array',elements:[...new Set(value.slice(0,8).map(v=>JSON.stringify(shape(v,depth+1))))].sort().map(v=>JSON.parse(v))};
 if(typeof value!=='object')return typeof value;
 if(depth>12)return 'object';return Object.fromEntries(Object.keys(value).sort().map(key=>[key,shape(value[key],depth+1)]));
}
function check(name,condition,details){const row={name,passed:Boolean(condition),...(details===undefined?{}:{details})};checks.push(row);return row.passed;}
function draft(){return {name:prefix,style:'套头',neck:'圆领',sleeve:'长袖',length:'常规',measurementBasis:'flat',calculationVersion:'video-v1',density:'30',rowDensity:40,sizes:{chest:50,bodyLength:0,sleeveCuffWidth:'12.5',placketWidth:'',placketLength:0}};}
async function call(label,path,{token,method='GET',body,raw,contentType='application/json',headers={},multipart,expectBinary=false}={}){
 const response=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{...(!multipart&&contentType?{'content-type':contentType}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:multipart||raw||(body===undefined?undefined:JSON.stringify(body))});
 const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{}
 const selected={};for(const key of ['cache-control','referrer-policy','x-content-type-options','allow','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','access-control-allow-credentials','access-control-max-age','vary','x-frame-options'])if(response.headers.has(key))selected[key]=response.headers.get(key);
 const setCookie=response.headers.get('set-cookie');
 const row={label,path:path.replace(/(\/api\/shares\/)[^/?]+/,'$1[redacted]').replace(/GY-\d{8}-[A-F0-9]{16}/g,'[craft-id]').replace(/\/tool\/gen\/(column\/|preview\/)?\d+/,'/tool/gen/$1[table-id]'),method,httpStatus:response.status,contentType:response.headers.get('content-type'),applicationCode:typeof data?.code==='number'?data.code:null,headers:selected,jsonParsed:data!==undefined,bodyShape:shape(data),bodyBytes:bytes.length,...(typeof raw==='string'?{requestBytes:Buffer.byteLength(raw),...(contentType==='application/x-www-form-urlencoded'?{formKeys:[...new URLSearchParams(raw).keys()].length}:{})}:{}),hasAttachment:Boolean(response.headers.get('content-disposition')),cookieAttributes:setCookie?setCookie.split(/;\s*/).slice(1).map(v=>v.replace(/expires=.*/i,'Expires=[date]')):[],...(data?.msg||data?.message?{message:safeMessage(data.message||data.msg)}:{})};
 requests.push(row);writeFileSync(resolve(out,phase+'-requests.partial.json'),JSON.stringify(requests,null,2)+'\n');
 return {response,bytes,data,row,status:typeof data?.code==='number'&&data.code>=400?data.code:response.status,setCookie};
}
async function scenario(name,run){try{await run();}catch(e){failures.push({name,message:safeMessage(e.message)});}}
async function login(lane,keepOld=false){
 const a=accounts[lane],r=await call((keepOld?'old-':'new-')+'login-'+lane,'/api/auth/login',{method:'POST',body:{type:'employee',account:a.account,password:a.password}});
 if(!check('login '+lane,r.status===200&&typeof r.data?.token==='string'))throw Error('QA login failed');
 if(keepOld)state.oldTokens[lane]={token:r.data.token,sourceOrigin:origin,sourceRelease:release,userId:a.id,createdAt:new Date().toISOString()};else own.tokens.push(r.data.token);
 save();check('login '+lane+' DTO types',typeof r.data.user.id==='string'&&typeof r.data.expiresAt==='number'&&Number.isSafeInteger(r.data.expiresAt));return r.data.token;
}
function ownedFile(profile){
 if(typeof profile!=='string'||!/^\/profile\/(upload|avatar)\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.[a-zA-Z0-9]+$/.test(profile))throw Error('Unexpected returned QA upload path');
 const file=resolve(uploadRoot,profile.replace(/^\/profile\//,''));if(!file.startsWith(uploadRoot+sep)||existsSync(file)&&statSync(file).size>100000)throw Error('Unsafe QA upload cleanup target');
 if(!own.files.includes(file)){own.files.push(file);save();}return file;
}
function png(){
 const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const tag=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(16,0);ihdr.writeUInt32BE(16,4);ihdr[8]=8;ihdr[9]=6;const raw=Buffer.alloc(16*(1+16*4));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=y*65+1+x*4;raw[n]=40;raw[n+1]=130;raw[n+2]=210;raw[n+3]=255;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const multipart=(field,bytes,name,type)=>{const form=new FormData();if(field)form.append(field,new Blob([bytes],{type}),name);return form;};
function findOwnedFixtureFiles(marker){
 const found=[];
 function visit(directory){if(!existsSync(directory))return;for(const entry of readdirSync(directory,{withFileTypes:true})){const file=resolve(directory,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile()&&entry.name.startsWith(marker))found.push(file);}}
 visit(uploadRoot);return found;
}
async function badMultipart(label,path,form,marker){
 const before=findOwnedFixtureFiles(marker),userCounts=path.includes('importData')?sql('SELECT COUNT(*) FROM sys_user;SELECT COUNT(*) FROM sys_user_role'):null;
 const avatarSnapshot=path.includes('/profile/avatar')?sql("SELECT CONCAT_WS('|',IFNULL(avatar,''),IFNULL(update_time,'')) FROM sys_user WHERE user_id=114"):null;
 intent('invalid-multipart-no-write',{label,path,filenameMarker:marker,ownedFilesBefore:before});
 const r=await call(label,path,{token:systemToken,method:'POST',multipart:form});
 const after=findOwnedFixtureFiles(marker),newFiles=after.filter(file=>!before.includes(file));
 // If pre-validation regresses, recover only uniquely named owned fixtures.
 for(const file of newFiles){ownedFile('/profile/'+file.slice(uploadRoot.length+1).split(sep).join('/'));}
 if(path.includes('/profile/avatar')){const current=sql('SELECT avatar FROM sys_user WHERE user_id=114');if(current&&current!==own.avatarBefore?.avatar){own.avatarChanged=current;save();ownedFile(current);}}
 const message=r.data?.message||r.data?.msg||'',serialized=JSON.stringify(r.data||{});
 check(label+' friendly Chinese400',r.data?.code===400&&[200,400].includes(r.response.status)&&/[\u3400-\u9fff]/.test(message)&&!/(?:NullPointerException|\bNPE\b|Cannot invoke|org\.springframework|com\.ruoyi|java\.[a-z]|getOriginalFilename|联系管理员)/i.test(serialized));
 check(label+' no owned file writes',newFiles.length===0);
 if(avatarSnapshot!==null)check(label+' no avatar/updatedTime writes',avatarSnapshot===sql("SELECT CONCAT_WS('|',IFNULL(avatar,''),IFNULL(update_time,'')) FROM sys_user WHERE user_id=114"));
 if(userCounts!==null)check(label+' no user/role row writes',userCounts===sql('SELECT COUNT(*) FROM sys_user;SELECT COUNT(*) FROM sys_user_role'));
 r.row.invalidMultipart={friendly400:r.data?.code===400,ownedFilesCreated:newFiles.length,...(userCounts===null?{}:{userAndRoleCountsUnchanged:userCounts===sql('SELECT COUNT(*) FROM sys_user;SELECT COUNT(*) FROM sys_user_role')})};
 return r;
}
let systemToken,makerToken;
try{
 if(cleanupOnly)throw Error('cleanup-only');
 await scenario('session setup',async()=>{
  for(const lane of ['systemAdmin','api']){
   if(phase==='baseline'&&!state.oldTokens[lane])await login(lane,true);
   const old=state.oldTokens[lane];if(!old)throw Error('Old QA token missing');
   const r=await call('preserved-old-session-'+lane,'/api/auth/me',{token:old.token});check('preserved old '+lane+' accepted',r.status===200&&r.data?.user?.id===String(accounts[lane].id));
   if(lane==='systemAdmin'){for(const path of ['/getInfo','/system/user/profile']){const detail=await call('preserved-old-'+path,path,{token:old.token});check('preserved old114 '+path,detail.status===200);}}
  }
  systemToken=await login('systemAdmin');makerToken=await login('api');
 });
 if(!systemToken||!makerToken)throw Error('Authenticated probe setup failed');
 await scenario('anonymous, auth and protocol',async()=>{
  const health=await call('health','/api/health');check('health JSON',health.response.status===200&&health.data?.backend==='ruoyi-java');
  const captcha=await call('captcha-shape-only','/captchaImage');check('captcha envelope',captcha.status===200&&typeof captcha.data?.captchaEnabled==='boolean');
  if(captcha.data?.captchaEnabled)check('captcha string/image types',typeof captcha.data.img==='string'&&typeof captcha.data.uuid==='string'&&Buffer.from(captcha.data.img,'base64').length>40);
  for(const path of ['/api/crafts','/api/auth/me','/system/user/list','/maoyi/craft/list']){const r=await call('anonymous-'+path,path);check('anonymous is denied '+path,r.status===401&&r.data!==undefined);}
  const forbidden=await call('maker-management-forbidden','/maoyi/craft/list',{token:makerToken});check('maker management403',forbidden.status===403);
  for(const [label,path,options]of [
   ['wrong-password','/api/auth/login',{method:'POST',body:{type:'employee',account:accounts.api.account,password:randomBytes(12).toString('hex')}}],
   ['invalid-login-type','/api/auth/login',{method:'POST',body:{type:'invalid'}}],
   ['unconfigured-wechat','/api/auth/login',{method:'POST',body:{type:'wechat',code:'QA_R30_not_a_wechat_code'}}],
   ['missing-route','/api/no-such-qa-r30-route',{token:makerToken}],
   ['wrong-method','/api/crafts',{token:makerToken,method:'DELETE'}],
   ['json-malformed','/api/crafts',{token:makerToken,method:'POST',raw:'{'}],
   ['json-array','/api/crafts',{token:makerToken,method:'POST',raw:'[]'}],
   ['json-null','/api/crafts',{token:makerToken,method:'POST',raw:'null'}],
   ['json-trailing','/api/crafts',{token:makerToken,method:'POST',raw:'{} junk'}],
   ['unsupported-media','/api/crafts',{token:makerToken,method:'POST',raw:'x',contentType:'text/plain'}],
   ['body-65537','/api/crafts',{token:makerToken,method:'POST',raw:' '.repeat(65537)}]
  ]){const r=await call(label,path,options);const expected={'wrong-password':401,'invalid-login-type':400,'unconfigured-wechat':503,'missing-route':404,'wrong-method':405,'json-malformed':400,'json-array':400,'json-null':400,'json-trailing':400,'unsupported-media':415,'body-65537':413}[label];check(label+' raw HTTP and numeric code',r.response.status===expected&&r.data?.code===expected);}
  for(const path of ['/api/crafts','/system/user/list']){
   await call('cors-preflight-'+path,path,{method:'OPTIONS',contentType:null,headers:{Origin:'http://127.0.0.1:5183','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}});
   await call('cors-denied-'+path,path,{contentType:null,headers:{Origin:'http://127.0.0.1:5183'}});
  }
  await call('cors-413','/api/crafts',{token:makerToken,method:'POST',raw:' '.repeat(65537),headers:{Origin:'http://127.0.0.1:5183'}});
 });
 await scenario('system DTO and dates',async()=>{
  for(const [label,path,token]of [['getInfo','/getInfo',systemToken],['getRouters','/getRouters',systemToken],['profile','/system/user/profile',systemToken],['user114','/system/user/114',systemToken],['maker-profile','/system/user/profile',makerToken]]){
   const r=await call(label,path,{token});check(label+' success',r.status===200);
   if(path!=='/getRouters'){
    const user=r.data?.user||r.data?.data;check(label+' password absent',!user||!Object.hasOwn(user,'password'));
    if(user?.createTime!==undefined&&user.createTime!==null)check(label+' createTime string',typeof user.createTime==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(user.createTime));
   }
  }
  const pages=[];
  for(const pageNum of [1,2]){const r=await call('user-pagination-'+pageNum,`/system/user/list?pageNum=${pageNum}&pageSize=1`,{token:systemToken});pages.push(r.data);check('user page '+pageNum+' bounded',r.status===200&&Array.isArray(r.data?.rows)&&r.data.rows.length===1);}
  check('user pagination has stable total and distinct rows',pages[0]?.total===pages[1]?.total&&pages[0]?.total>1&&pages[0]?.rows?.[0]?.userId!==pages[1]?.rows?.[0]?.userId);
 });
 await scenario('owned business DTO',async()=>{
  intent('craft-create',{ownerId:106,name:prefix});const r=await call('craft-create','/api/crafts',{token:makerToken,method:'POST',body:draft()});
  if(!r.data?.craft?.id)throw Error('Owned craft not created');const id=r.data.craft.id;if(!/^GY-\d{8}-[A-F0-9]{16}$/.test(id))throw Error('Unexpected craft ID');own.craftIds.push(id);save();
  const craft=r.data.craft;check('craft types preserved',typeof craft.ownerId==='string'&&Number.isInteger(craft.version)&&typeof craft.createdAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(craft.createdAt)&&craft.density==='30'&&craft.rowDensity===40&&craft.sizes.sleeveCuffWidth==='12.5'&&craft.sizes.bodyLength===0&&Array.isArray(craft.parts));
  await call('craft-detail','/api/crafts/'+id,{token:makerToken});await call('craft-list','/api/crafts?pageNum=1&pageSize=1',{token:makerToken});
  await call('managed-list','/maoyi/craft/list?name='+encodeURIComponent(prefix),{token:systemToken});
  await call('managed-detail','/maoyi/craft/'+id,{token:systemToken});
  const invalid=await call('version-string-rejected','/api/crafts/'+id,{token:makerToken,method:'PUT',body:{...draft(),version:'1'}});check('version remains numeric',invalid.status===409);
  const chartId='qa-r30-oss-'+state.runId+'-'+phase;intent('chart-create',{id:chartId,ownerId:106});own.chartIds.push(chartId);save();
  const chart=await call('chart-create','/api/charts',{token:makerToken,method:'POST',body:{id:chartId,craftId:id,showText:false,showDimensions:true,locked:false}});check('chart booleans',chart.data?.chart?.showText===false&&chart.data?.chart?.locked===false);
  intent('share-create',{craftId:id,ownerId:106});const share=await call('share-create','/api/shares',{token:makerToken,method:'POST',body:{craftId:id}});
  if(typeof share.data?.code!=='string')throw Error('Owned share not created');check('share expires epoch',Number.isSafeInteger(share.data.expiresAt));
  const snap=await call('share-anonymous','/api/shares/'+share.data.code);check('share omits identity',snap.status===200&&!Object.hasOwn(snap.data.craft,'ownerId')&&!Object.hasOwn(snap.data.craft,'history'));
 });
 await scenario('urlencoded XLSX exports',async()=>{
  const exports=[['post','/system/post/export',{postName:prefix}],['user','/system/user/export',{userName:prefix}],['dict','/system/dict/data/export',{dictType:'qa_r30_oss_'+state.runId}],['template','/system/user/importTemplate',{}]];
  for(const [label,path,params]of exports){
   const r=await call('xlsx-'+label,path,{token:systemToken,method:'POST',raw:new URLSearchParams(params).toString(),contentType:'application/x-www-form-urlencoded'});
   const file=resolve(out,phase+'-'+label+'.xlsx');writeFileSync(file,r.bytes);
   try{const parsed=JSON.parse(execFileSync('python3',['tests/java/oss-migration-xlsx.py',file],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));r.row.xlsx=parsed;check(label+' valid empty XLSX',r.response.status===200&&parsed.zipValid&&parsed.dataRows===0&&!parsed.sensitiveHeader);}
   catch{check(label+' valid empty XLSX',false);}
  }
  for(const [label,params]of [['form-210kb',{postName:prefix,padding:'x'.repeat(210*1024)}],['form-1001keys',{postName:prefix,...Object.fromEntries(Array.from({length:1000},(_,index)=>['qaIgnored'+index,'x']))}]]){
   const raw=new URLSearchParams(params).toString(),r=await call(label,'/system/post/export',{token:systemToken,method:'POST',raw,contentType:'application/x-www-form-urlencoded'});
   const file=resolve(out,phase+'-'+label+'.xlsx');writeFileSync(file,r.bytes);
   try{r.row.xlsx=JSON.parse(execFileSync('python3',['tests/java/oss-migration-xlsx.py',file],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));check(label+' safe read-only form accepted',r.response.status===200&&r.row.xlsx.dataRows===0);}catch{check(label+' safe read-only form accepted',false);}
  }
 });
 await scenario('multipart common + exact cleanup',async()=>{
  intent('common-upload',{filename:prefix+'.png'});const uploaded=await call('common-upload-valid','/common/upload',{token:systemToken,method:'POST',multipart:multipart('file',png(),prefix+'.png','image/png')});
  if(uploaded.data?.fileName){const file=ownedFile(uploaded.data.fileName);check('common upload physical file',existsSync(file));const image=await call('common-upload-readback',uploaded.data.fileName,{contentType:null});check('common upload image readable',image.response.status===200&&image.bytes.subarray(1,4).toString()==='PNG');}else check('common upload succeeded',false);
  await badMultipart('common-upload-missing-part','/common/upload',multipart(null),prefix+'_single_missing');
  await badMultipart('common-upload-empty-part','/common/upload',multipart('file',Buffer.alloc(0),prefix+'_single_empty.png','image/png'),prefix+'_single_empty');
  await badMultipart('common-upload-wrong-extension','/common/upload',multipart('file',Buffer.from('synthetic QA'),prefix+'_wrong_extension.exe','application/octet-stream'),prefix+'_wrong_extension');
 });
 await scenario('multipart multiple files and import no-write guards',async()=>{
  const bytes=png(),expectedHash=createHash('sha256').update(bytes).digest('hex'),form=new FormData();
  for(const suffix of ['a','b'])form.append('files',new Blob([bytes],{type:'image/png'}),prefix+'_multi_'+suffix+'.png');
  intent('multi-upload',{filenameMarker:prefix+'_multi_'});
  const r=await call('common-multi-valid','/common/uploads',{token:systemToken,method:'POST',multipart:form});
  const names=typeof r.data?.fileNames==='string'?r.data.fileNames.split(','):[],urls=typeof r.data?.urls==='string'?r.data.urls.split(','):[];
  for(const file of findOwnedFixtureFiles(prefix+'_multi_'))ownedFile('/profile/'+file.slice(uploadRoot.length+1).split(sep).join('/'));
  check('multi upload returns two names and URLs',r.status===200&&names.length===2&&urls.length===2);
  for(let index=0;index<Math.min(names.length,2);index++){
   ownedFile(names[index]);const url=new URL(urls[index],origin);if(!check('multi URL maps to owned file '+index,url.origin===origin&&url.pathname===names[index]))continue;
   for(const [kind,path]of [['file',names[index]],['url',url.pathname]]){const image=await call('common-multi-'+kind+'-'+index,path,{contentType:null});check('multi '+kind+' SHA '+index,image.response.status===200&&createHash('sha256').update(image.bytes).digest('hex')===expectedHash);}
  }
  await badMultipart('common-multi-missing-part','/common/uploads',multipart(null),prefix+'_multi_missing');
  await badMultipart('common-multi-empty-part','/common/uploads',multipart('files',Buffer.alloc(0),prefix+'_multi_empty.png','image/png'),prefix+'_multi_empty');
  const mixed=new FormData();mixed.append('files',new Blob([bytes],{type:'image/png'}),prefix+'_mixed_valid.png');mixed.append('files',new Blob([],{type:'image/png'}),prefix+'_mixed_empty.png');
  await badMultipart('common-multi-valid-plus-empty','/common/uploads',mixed,prefix+'_mixed_');
  const mixedExtension=new FormData();mixedExtension.append('files',new Blob([bytes],{type:'image/png'}),prefix+'_mixed_extension_valid.png');mixedExtension.append('files',new Blob([Buffer.from('synthetic QA extension boundary')],{type:'application/octet-stream'}),prefix+'_mixed_extension_invalid.exe');
  await badMultipart('common-multi-valid-plus-disallowed-extension','/common/uploads',mixedExtension,prefix+'_mixed_extension_');
  await badMultipart('user-import-missing-part','/system/user/importData?updateSupport=false',multipart(null),prefix+'_import_missing');
  await badMultipart('user-import-empty-part','/system/user/importData?updateSupport=false',multipart('file',Buffer.alloc(0),prefix+'_import_empty.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),prefix+'_import_empty');
 });
 await scenario('avatar isolated session',async()=>{
  const before=JSON.parse(sql("SELECT JSON_OBJECT('avatar',avatar,'updateTime',DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s')) FROM sys_user WHERE user_id=114"));
  own.avatarBefore??=before;save();if(before.avatar!==''&&before.avatar!==null){check('avatar safe prerequisite',false,{skipped:'Existing avatar is not empty; no upload performed'});return;}
  intent('avatar-upload',{userId:114,before});
  const avatarToken=await login('systemAdmin');const r=await call('avatar-valid','/system/user/profile/avatar',{token:avatarToken,method:'POST',multipart:multipart('avatarfile',png(),prefix+'.png','image/png')});
  // Recover exact ownership from the QA user's DB even if a changed converter
  // unexpectedly omits imgUrl after the upload has already committed.
  const persistedAvatar=sql('SELECT avatar FROM sys_user WHERE user_id=114');
  if(persistedAvatar&&persistedAvatar!==before.avatar){own.avatarChanged=persistedAvatar;save();ownedFile(persistedAvatar);}
  if(r.data?.imgUrl){check('avatar DB exact match',persistedAvatar===r.data.imgUrl);await call('avatar-readback',r.data.imgUrl,{contentType:null});}else check('avatar upload succeeded',false);
  // The separately logged-in main QA session is also owned and is logged out
  // in finally; negatives must not mutate the persisted valid avatar.
  await badMultipart('avatar-missing-part','/system/user/profile/avatar',multipart(null),prefix+'_avatar_missing');
  await badMultipart('avatar-empty-part','/system/user/profile/avatar',multipart('avatarfile',Buffer.alloc(0),prefix+'_avatar_empty.png','image/png'),prefix+'_avatar_empty');
 });
 await scenario('Swagger groups',async()=>{
  let configData;
  for(const path of ['/swagger-ui/index.html','/swagger-ui/swagger-initializer.js','/v3/api-docs/swagger-config']){
   const r=await call('swagger-'+path,path,{contentType:null});
   if(path==='/swagger-ui/index.html')check('Swagger loader retains no-store',r.response.headers.get('cache-control')?.includes('no-store'));
   if(path==='/v3/api-docs/swagger-config')configData=r.data;
  }
  const cfg=requests.find(r=>r.label==='swagger-/v3/api-docs/swagger-config');check('swagger config JSON',cfg?.httpStatus===200&&cfg.jsonParsed);
  check('Swagger five local read-only group URLs',configData?.urls?.length===5&&configData.urls.every(group=>group.url.startsWith('/prod-api/v3/api-docs/'))&&Array.isArray(configData.supportedSubmitMethods)&&configData.supportedSubmitMethods.length===0&&configData.validatorUrl==='');
  for(const group of ['maoyi','system','monitor','tool','demo']){const r=await call('openapi-'+group,'/v3/api-docs/'+group,{contentType:null});check('OpenAPI '+group,r.response.status===200&&typeof r.data?.openapi==='string'&&Object.keys(r.data.paths||{}).length>0);r.row.openApi={version:r.data?.openapi,paths:Object.keys(r.data?.paths||{}).sort()};}
 });
 await scenario('Druid independent Session',async()=>{
  const creds=JSON.parse(readFileSync('.secrets/java-local-tools.json')).druid;
  const loginPage=await call('druid-login-page','/druid/login.html',{contentType:null});check('Druid HTML',loginPage.response.status===200&&loginPage.bytes.toString().includes('<html'));
  const denied=await call('druid-unauthenticated','/druid/index.html',{contentType:null});check('Druid requires session',denied.response.status>=300&&denied.response.status<400);
  const logged=await call('druid-session-login','/druid/submitLogin',{method:'POST',raw:new URLSearchParams({loginUsername:creds.username,loginPassword:creds.password}).toString(),contentType:'application/x-www-form-urlencoded'});
  const cookie=logged.setCookie?.split(';')[0];if(!cookie)throw Error('Druid session cookie not received');check('Druid independent login',logged.bytes.toString()==='success');
  check('Druid session retains HttpOnly',/(?:^|;)\s*HttpOnly(?:;|$)/i.test(logged.setCookie));
  for(const path of ['/druid/basic.json','/druid/datasource.json']){const r=await call('authenticated-'+path,path,{contentType:null,headers:{Cookie:cookie}});check('Druid statistics '+path,r.data?.ResultCode===1);if(path.includes('basic'))check('Druid reset remains disabled',r.data?.Content?.ResetEnable===false);}
  await call('druid-session-logout','/druid/logout',{contentType:null,headers:{Cookie:cookie}});
 });
 await scenario('owned generator metadata read-only HTTP',async()=>{
  const tableName='qa_oss_r30_'+state.runId+'_'+phase;intent('generator-metadata',{tableName});
  if(!own.generatorId){own.generatorId=Number(sql(`INSERT INTO gen_table(table_name,table_comment,class_name,tpl_category,tpl_web_type,package_name,module_name,business_name,function_name,function_author,options,create_by,create_time) VALUES(${q(tableName)},'QA迁移专有元数据','QaOssR30','crud','element-plus','com.ruoyi.qa','qa','ossr30','QA迁移','QA','{"parentMenuId":"3"}',${q(prefix)},NOW());SELECT LAST_INSERT_ID();`));save();
   sql(`INSERT INTO gen_table_column(table_id,column_name,column_comment,column_type,java_type,java_field,is_pk,is_increment,is_required,is_insert,is_edit,is_list,is_query,html_type,sort) VALUES(${numericId(own.generatorId)},'qa_id','QA编号','bigint','Long','qaId','1','1','1','1','0','1','0','input',1),(${own.generatorId},'qa_name','QA名称','varchar(60)','String','qaName','0','0','1','1','1','1','1','input',2);`);
  }
  const before=sql(`SELECT CONCAT_WS('|',table_name,IFNULL(options,''),IFNULL(update_time,'')) FROM gen_table WHERE table_id=${numericId(own.generatorId)}`);
  for(const [label,path]of [['generator-list','/tool/gen/list?tableName='+tableName],['generator-detail','/tool/gen/'+own.generatorId],['generator-columns','/tool/gen/column/'+own.generatorId],['generator-preview','/tool/gen/preview/'+own.generatorId]]){const r=await call(label,path,{token:systemToken});check(label+' loads',r.status===200);}
  check('generator metadata unchanged by HTTP reads',before===sql(`SELECT CONCAT_WS('|',table_name,IFNULL(options,''),IFNULL(update_time,'')) FROM gen_table WHERE table_id=${own.generatorId}`));
 });
}catch(e){if(!cleanupOnly)failures.push({name:'setup or top-level',message:safeMessage(e.message)});}
finally{
 await scenario('cleanup',async()=>{
  if(own.avatarChanged){
   const current=sql('SELECT avatar FROM sys_user WHERE user_id=114');if(current!==own.avatarChanged)throw Error('Avatar changed externally; abort restoration and file deletion');
   sql(`UPDATE sys_user SET avatar=${q(own.avatarBefore.avatar)},update_time=${q(own.avatarBefore.updateTime)} WHERE user_id=114 AND avatar=${q(own.avatarChanged)}`);
   const restored=JSON.parse(sql("SELECT JSON_OBJECT('avatar',avatar,'updateTime',DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s')) FROM sys_user WHERE user_id=114"));
   cleanup.avatarRestored=JSON.stringify(restored)===JSON.stringify(own.avatarBefore);if(!cleanup.avatarRestored)throw Error('Avatar exact restoration failed');own.avatarChanged=null;save();
  }
  for(const id of own.chartIds){if(!/^qa-r30-oss-[a-f0-9]{12}-(baseline|candidate)$/.test(id))throw Error('Unowned chart cleanup refused');sql(`DELETE FROM maoyi_chart WHERE id=${q(id)} AND owner_id=106`);}
  for(const id of own.craftIds){if(!/^GY-\d{8}-[A-F0-9]{16}$/.test(id)||sql(`SELECT name FROM maoyi_craft WHERE id=${q(id)} AND owner_id=106`)!==prefix)throw Error('Unowned craft cleanup refused');sql(`DELETE FROM maoyi_share WHERE craft_id=${q(id)} AND owner_id=106;DELETE FROM maoyi_audit WHERE craft_id=${q(id)};DELETE FROM maoyi_chart WHERE craft_id=${q(id)} AND owner_id=106;DELETE FROM maoyi_craft WHERE id=${q(id)} AND owner_id=106`);}
  if(own.generatorId){const id=numericId(own.generatorId);if(sql(`SELECT create_by FROM gen_table WHERE table_id=${id}`)!==prefix)throw Error('Unowned generator metadata cleanup refused');sql(`DELETE FROM gen_table_column WHERE table_id=${id};DELETE FROM gen_table WHERE table_id=${id} AND create_by=${q(prefix)}`);}
  for(const file of own.files){if(!file.startsWith(uploadRoot+sep)||!/(?:upload|avatar)\/\d{4}\/\d{2}\/\d{2}\//.test(file))throw Error('Unowned physical path cleanup refused');if(existsSync(file))unlinkSync(file);}
  cleanup.remainingCrafts=Number(sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=106 AND name=${q(prefix)}`));
  cleanup.remainingCharts=own.chartIds.length?Number(sql(`SELECT COUNT(*) FROM maoyi_chart WHERE owner_id=106 AND id IN (${own.chartIds.map(q).join(',')})`)):0;
  cleanup.remainingGenerator=Number(sql(`SELECT COUNT(*) FROM gen_table WHERE create_by=${q(prefix)}`));cleanup.remainingFiles=own.files.filter(existsSync).length;
  if(own.craftIds.length){const ids=own.craftIds.map(q).join(',');cleanup.remainingShares=Number(sql(`SELECT COUNT(*) FROM maoyi_share WHERE craft_id IN (${ids})`));cleanup.remainingAudits=Number(sql(`SELECT COUNT(*) FROM maoyi_audit WHERE craft_id IN (${ids})`));}
  if(own.generatorId)cleanup.remainingGeneratorColumns=Number(sql(`SELECT COUNT(*) FROM gen_table_column WHERE table_id=${numericId(own.generatorId)}`));
  cleanup.exactIds={crafts:own.craftIds,charts:own.chartIds,generator:own.generatorId};
  own.cleaned=true;save();
 });
 for(const token of own.tokens)await call('owned-session-logout','/api/auth/logout',{token,method:'POST',body:{}}).catch(()=>{check('owned session logout',false);});
 if(phase==='candidate')for(const saved of Object.values(state.oldTokens))await call('old-session-logout-after-candidate','/api/auth/logout',{token:saved.token,method:'POST',body:{}}).catch(()=>{check('old token logout',false);});
 const jarFile=process.env.QA_CONTRACT_JAR||(phase==='baseline'?'.data/qa/releases/qa-20261121-r29/ruoyi-admin.jar':null);
 const summary={phase,release,origin,at:new Date().toISOString(),kind:'actual raw local HTTP + exact owned QA SQL/file cleanup; no UI or new-stack approval claim',complete:true,provenance:{scriptSha256:createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),xlsxHelperSha256:createHash('sha256').update(readFileSync('tests/java/oss-migration-xlsx.py')).digest('hex'),jarSha256:jarFile&&existsSync(jarFile)?createHash('sha256').update(readFileSync(jarFile)).digest('hex'):null},requests,checks,failures,cleanup,knownLimits:['No deployed field currently uses @Sensitive, so password absence is exercised but runtime masking cannot be claimed.','No password/role changes, notification writes, large multipart payloads, pressure or exploit requests.','Baseline tokens intentionally remain private and valid until the candidate phase, which logs them out after checks.','Generated OpenAPI shape/path differences must be reviewed separately from preserved business DTO contracts.'],oldTokensStoredPrivate:true,privateStateMode:(statSync(stateFile).mode&0o777).toString(8)};
 summary.passedChecks=checks.filter(c=>c.passed).length;summary.failedChecks=checks.filter(c=>!c.passed).length;
 if(phase==='candidate'){
  const base=JSON.parse(readFileSync(resolve(out,'baseline.json'))),pairs=[];
  for(const now of requests){if(/login-|logout/.test(now.label))continue;const prior=base.requests.find(row=>row.label===now.label);if(!prior)continue;
   const project=r=>({httpStatus:r.httpStatus,contentType:r.contentType,applicationCode:r.applicationCode,headers:r.headers,jsonParsed:r.jsonParsed,bodyShape:r.bodyShape,hasAttachment:r.hasAttachment,cookieAttributes:r.cookieAttributes,xlsx:r.xlsx});
   if(JSON.stringify(project(prior))!==JSON.stringify(project(now)))pairs.push({label:now.label,baseline:project(prior),candidate:project(now)});
  }
  summary.contractDifferences=pairs;writeFileSync(resolve(out,'comparison.json'),JSON.stringify({baselineRelease:base.release,candidateRelease:release,kind:'observed differences requiring human review; not automatic rejection or approval',differences:pairs},null,2)+'\n');
 }
 const writtenFile=cleanupOnly?resolve(out,phase+'-cleanup.json'):resultFile;
 writeFileSync(writtenFile,JSON.stringify(summary,null,2)+'\n');
 if(phase==='baseline'&&!cleanupOnly){state.baselineComplete=failures.length===0&&summary.failedChecks===0;state.baselineRelease=release;state.baselineOrigin=origin;}
 state.phases[phase].finishedAt=new Date().toISOString();save();
 console.log(JSON.stringify({phase,release,file:writtenFile,requests:requests.length,checks:checks.length,passed:summary.passedChecks,failed:summary.failedChecks,failures,cleanup,contractDifferences:summary.contractDifferences?.map(row=>row.label),oldTokensStoredPrivate:true,privateMode:summary.privateStateMode}));
 if(failures.length||summary.failedChecks||Object.entries(cleanup).some(([key,value])=>key.startsWith('remaining')&&value!==0))process.exitCode=1;
}
