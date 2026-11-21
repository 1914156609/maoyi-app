import { digest, randomToken, passwordHash, verifyPassword } from './crypto.mjs';
import { allFields, validateCraft } from '../src/lib/domain.mjs';
const roles={customer:'顾客',employee:'员工',supervisor:'主管',admin:'超级管理员'};
const SESSION_MS=7*24*60*60*1000, SHARE_MS=7*24*60*60*1000;
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(s,m)=>{throw new HttpError(s,m)};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const statement=(db,sql,args=[])=>db.prepare(sql).bind(...args);
const first=(db,sql,args)=>statement(db,sql,args).first();
const rows=async(db,sql,args)=>(await statement(db,sql,args).all()).results;
const run=(db,sql,args)=>statement(db,sql,args).run();
const canApprove=u=>['admin','supervisor'].includes(u.role);
const profile=u=>({id:u.id,name:u.name,role:roles[u.role],roleCode:u.role,status:u.state==='active'?'正常':u.state==='pending'?'待审核':'已停用'});
async function body(req) {
 if(!req.headers.get('content-type')?.includes('application/json'))fail(415,'请使用 JSON 请求');
 const reader=req.body?.getReader(); let text='',size=0; const decoder=new TextDecoder();
 if(!reader) fail(400,'请求内容不能为空');
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();fail(413,'请求内容过大');}text+=decoder.decode(value,{stream:true});}
 try{const b=JSON.parse(text+decoder.decode());if(!b||Array.isArray(b)||typeof b!=='object')throw 0;return b;}catch{fail(400,'请求内容格式错误');}
}
async function limit(db,key,max,now) {
 const slot=Math.floor(now/900000); const k=await digest(`${slot}:${key}`);
 const r=await first(db,'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',[k,now+900000]);
 if(r.count>max)fail(429,'操作过于频繁，请稍后重试');
}
async function bootstrap(db,env,now) {
 if(!env.BOOTSTRAP_ADMIN_ACCOUNT||!env.BOOTSTRAP_ADMIN_PASSWORD_HASH)return;
 await run(db,"INSERT OR IGNORE INTO users (id,account,password_hash,name,role,state,created_at) VALUES (?,?,?,?,'admin','active',?)",['bootstrap-admin',env.BOOTSTRAP_ADMIN_ACCOUNT,env.BOOTSTRAP_ADMIN_PASSWORD_HASH,env.BOOTSTRAP_ADMIN_NAME||'管理员',new Date(now).toISOString()]);
}
async function authenticate(req,db,now) {
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]{40,80}$/.test(bearer))fail(401,'请先登录');
 const hash=await digest(bearer.slice(7));
 const u=await first(db,'SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',[hash,now]);
 if(!u||u.state!=='active')fail(401,'登录已失效，请重新登录');
 return {...u,sessionHash:hash};
}
function sanitizeCraft(input) {
 const data={name:String(input.name||'').trim(),style:input.style||'套头',neck:input.neck||'圆领',sleeve:input.sleeve||'长袖',length:input.length||'常规',density:input.density??'',rowDensity:input.rowDensity??'',sizes:{}};
 for(const [key] of allFields)data.sizes[key]=input.sizes?.[key]??'';
 for(const [key,choices] of Object.entries({style:['套头','开衫','背心'],neck:['圆领','V领'],sleeve:['长袖','短袖','无袖'],length:['短款','常规','加长']}))if(!choices.includes(data[key]))fail(400,'款式参数不正确');
 if(data.name.length>60)fail(400,'工艺单名称过长');
 for(const k of ['density','rowDensity']) if(typeof data[k]!=='string'&&typeof data[k]!=='number')fail(400,'密度格式不正确');
 for(const [k] of allFields)if(typeof data.sizes[k]!=='string'&&typeof data.sizes[k]!=='number')fail(400,'尺寸格式不正确');
 const errors=validateCraft(data);if(Object.keys(errors).length)fail(400,Object.values(errors)[0]);
 if(allFields.some(([k])=>Number(data.sizes[k])>10000)||Number(data.density)>10000||Number(data.rowDensity)>10000)fail(400,'尺寸或密度超出范围');
 data.parts=[];return data;
}
const encodeCraft=(c,u)=>({...JSON.parse(c.payload),id:c.id,code:c.id,ownerId:c.owner_id,owner:c.owner_id===u?.id?'我':c.owner_name||'工艺员',status:c.status,version:c.version,createdAt:c.created_at,updatedAt:c.updated_at});
async function getCraft(db,id,u){const c=await first(db,'SELECT c.*,u.name owner_name FROM crafts c JOIN users u ON c.owner_id=u.id WHERE c.id=?',[id]);if(!c||c.owner_id!==u.id&&!canApprove(u))fail(404,'工艺单不存在');return c;}
async function transition(db,c,u,status,note,version,now) {
 if(!Number.isInteger(version)||version!==c.version)fail(409,'工艺单已更新，请刷新后重试');
 const at=new Date(now).toISOString();
 const result=await db.batch([
  statement(db,'UPDATE crafts SET status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status=?',[status,at,c.id,version,c.status]),
  statement(db,'INSERT INTO audit (id,craft_id,actor_id,status,note,version,at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',[crypto.randomUUID(),c.id,u.id,status,note,version+1,at])
 ]);
 if(result[0].meta.changes!==1)fail(409,'其他人已处理此工艺单，请刷新');
 return encodeCraft(await getCraft(db,c.id,u),u);
}
export async function handleApi(req,env,options={}) {
 const db=env.DB, now=options.now??Date.now(), fetcher=options.fetcher||fetch;
 const url=new URL(req.url),path=url.pathname.replace(/^\/api/,'').replace(/\/$/,''),method=req.method;
 try {
  if(!db)fail(503,'数据库未配置');
  if(path==='/health'&&method==='GET'){await first(db,'SELECT 1 FROM users LIMIT 1');return json({ok:true,wechatConfigured:!!(env.WECHAT_APP_ID&&env.WECHAT_APP_SECRET)});}
  if(path==='/auth/login'&&method==='POST'){
   const b=await body(req),ip=req.headers.get('cf-connecting-ip')||'local';
   await limit(db,'login-ip:'+ip,80,now);
   let u;
   if(b.type==='employee'){
    const account=String(b.account||'').trim().toLowerCase(),password=String(b.password||'');
    if(!account||account.length>64||password.length>128)fail(400,'请输入正确的账号和密码');
    await limit(db,'login-account:'+account+':'+ip,12,now);
    await bootstrap(db,env,now);
    u=await first(db,'SELECT * FROM users WHERE account=?',[account]);
    if(!await verifyPassword(password,u?.password_hash))fail(401,'账号或密码错误');
   }else if(b.type==='wechat'){
    if(!env.WECHAT_APP_ID||!env.WECHAT_APP_SECRET)fail(503,'微信登录尚未配置，请使用员工登录');
    if(typeof b.code!=='string'||b.code.length<3||b.code.length>256)fail(400,'微信登录凭证无效，请重试');
    const wxUrl=new URL('https://api.weixin.qq.com/sns/jscode2session');
    for(const [k,v] of Object.entries({appid:env.WECHAT_APP_ID,secret:env.WECHAT_APP_SECRET,js_code:b.code,grant_type:'authorization_code'}))wxUrl.searchParams.set(k,v);
    let data;
    try{const r=await fetcher(wxUrl.toString(),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw 0;data=await r.json();}catch{fail(502,'微信服务暂时不可用，请稍后重试');}
    if(data.errcode||!data.openid)fail(401,'微信登录凭证已失效，请重新登录');
    // session_key never leaves this server and is not persisted.
    const id=crypto.randomUUID();
    await run(db,"INSERT OR IGNORE INTO users (id,openid,name,role,state,created_at) VALUES (?,?,?,'customer','active',?)",[id,data.openid,'微信用户'+String(now).slice(-4),new Date(now).toISOString()]);
    u=await first(db,'SELECT * FROM users WHERE openid=?',[data.openid]);
   }else fail(400,'不支持的登录方式');
   if(u.state!=='active')fail(403,u.state==='pending'?'员工账号需管理员审核通过后方可登录':'账号已停用');
   const token=randomToken(),expiresAt=now+SESSION_MS;
   await run(db,'INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)',[await digest(token),u.id,expiresAt,now]);
   await db.batch([statement(db,'DELETE FROM sessions WHERE expires_at<=?',[now]),statement(db,'DELETE FROM rate_limits WHERE expires_at<=?',[now])]);
   return json({token,user:profile(u),expiresAt});
  }
  const shared=path.match(/^\/shares\/([A-Za-z0-9_-]{40,80})$/);
  if(shared&&method==='GET'){
   const s=await first(db,'SELECT snapshot,expires_at FROM shares WHERE token_hash=? AND expires_at>?',[await digest(shared[1]),now]);
   if(!s)fail(404,'分享链接已失效');return json({craft:JSON.parse(s.snapshot),expiresAt:s.expires_at});
  }
  const u=await authenticate(req,db,now);
  if(path==='/auth/me'&&method==='GET')return json({user:profile(u)});
  if(path==='/auth/logout'&&method==='POST'){await run(db,'DELETE FROM sessions WHERE token_hash=?',[u.sessionHash]);return json({ok:true});}
  if(path==='/admin/users'&&method==='POST'){
   if(u.role!=='admin')fail(403,'仅超级管理员可以管理账号');
   const b=await body(req),account=String(b.account||'').trim().toLowerCase();
   if(!/^[a-z0-9_.-]{3,64}$/.test(account)||typeof b.password!=='string'||b.password.length<12||b.password.length>128||!roles[b.role])fail(400,'账号、密码或角色不符合要求');
   if(!['pending','active'].includes(b.state||'pending'))fail(400,'账号状态不正确');
   if(await first(db,'SELECT id FROM users WHERE account=?',[account]))fail(409,'账号已存在');
   const id=crypto.randomUUID();
   await run(db,'INSERT INTO users (id,account,password_hash,name,role,state,created_at) VALUES (?,?,?,?,?,?,?)',[id,account,await passwordHash(b.password),String(b.name||account).slice(0,60),b.role,b.state||'pending',new Date(now).toISOString()]);
   return json({user:profile(await first(db,'SELECT * FROM users WHERE id=?',[id]))},201);
  }
  const userAction=path.match(/^\/admin\/users\/([^/]+)$/);
  if(userAction&&method==='PATCH'){
   if(u.role!=='admin')fail(403,'仅超级管理员可以管理账号');
   const b=await body(req);if(!['active','disabled'].includes(b.state)||userAction[1]===u.id)fail(400,'账号状态不正确');
   const r=await run(db,'UPDATE users SET state=? WHERE id=?',[b.state,userAction[1]]);if(!r.meta.changes)fail(404,'账号不存在');
   if(b.state==='disabled')await run(db,'DELETE FROM sessions WHERE user_id=?',[userAction[1]]);return json({ok:true});
  }
  if(path==='/crafts'&&method==='GET')return json({crafts:(await rows(db,'SELECT * FROM crafts WHERE owner_id=? ORDER BY updated_at DESC LIMIT 500',[u.id])).map(c=>encodeCraft(c,u))});
  if(path==='/crafts'&&method==='POST'){
   const b=sanitizeCraft(await body(req)),id='GY-'+new Date(now).toISOString().slice(0,10).replaceAll('-','')+'-'+randomToken(9).toUpperCase(),at=new Date(now).toISOString();
   await run(db,"INSERT INTO crafts (id,owner_id,name,status,version,payload,created_at,updated_at) VALUES (?,?,?,'draft',1,?,?,?)",[id,u.id,b.name,JSON.stringify(b),at,at]);
   return json({craft:encodeCraft(await getCraft(db,id,u),u)},201);
  }
  const cm=path.match(/^\/crafts\/([^/]+)(?:\/(submit|review|history))?$/);
  if(cm){
   const c=await getCraft(db,cm[1],u),action=cm[2];
   if(!action&&method==='GET')return json({craft:encodeCraft(c,u)});
   if(action==='history'&&method==='GET')return json({history:await rows(db,'SELECT a.status,a.note,a.version,a.at,u.name actor FROM audit a JOIN users u ON a.actor_id=u.id WHERE a.craft_id=? ORDER BY a.version',[c.id])});
   if(!action&&method==='PUT'){
    if(c.owner_id!==u.id)fail(403,'只能编辑自己的工艺单');
    if(!['draft','rejected'].includes(c.status))fail(409,'待审核或已通过工艺单不可修改');
    const b=await body(req),data=sanitizeCraft(b);if(b.version!==c.version)fail(409,'工艺单已更新，请刷新');
    const r=await run(db,"UPDATE crafts SET name=?,payload=?,status='draft',version=version+1,updated_at=? WHERE id=? AND version=? AND status=?",[data.name,JSON.stringify(data),new Date(now).toISOString(),c.id,c.version,c.status]);
    if(!r.meta.changes)fail(409,'工艺单已更新，请刷新');return json({craft:encodeCraft(await getCraft(db,c.id,u),u)});
   }
   if(action==='submit'&&method==='POST'){
    if(c.owner_id!==u.id)fail(403,'只能提交自己的工艺单');if(!['draft','rejected'].includes(c.status))fail(409,'工艺单已提交或已通过');
    const b=await body(req);return json({craft:await transition(db,c,u,'pending','',b.version,now)});
   }
   if(action==='review'&&method==='POST'){
    if(!canApprove(u))fail(403,'仅主管和超级管理员可以审批工艺单');if(c.status!=='pending')fail(409,'工艺单已被处理');
    const b=await body(req);if(!['approved','rejected'].includes(b.decision))fail(400,'审批结果不正确');
    const note=String(b.note||'').trim();if(note.length>500||b.decision==='rejected'&&!note)fail(400,'请填写不超过500字的驳回原因');
    return json({craft:await transition(db,c,u,b.decision,note,b.version,now)});
   }
  }
  if(path==='/approvals'&&method==='GET'){
   if(!canApprove(u))fail(403,'仅主管和超级管理员可以审批工艺单');
   return json({crafts:(await rows(db,"SELECT c.*,u.name owner_name FROM crafts c JOIN users u ON c.owner_id=u.id WHERE c.status='pending' ORDER BY c.updated_at DESC LIMIT 500",[])).map(c=>encodeCraft(c,u))});
  }
  if(path==='/shares'&&method==='POST'){
   await limit(db,'share:'+u.id,60,now);const b=await body(req),c=await getCraft(db,b.craftId,u);
   if(c.owner_id!==u.id)fail(403,'只能分享自己的工艺单');
   const p=JSON.parse(c.payload),snapshot={...p,id:c.id,code:c.id},code=randomToken(),expiresAt=now+SHARE_MS;
   await run(db,'INSERT INTO shares (token_hash,owner_id,craft_id,snapshot,expires_at,created_at) VALUES (?,?,?,?,?,?)',[await digest(code),u.id,c.id,JSON.stringify(snapshot),expiresAt,now]);
   const origin=env.PUBLIC_ORIGIN||url.origin;if(!/^https?:\/\//.test(origin))fail(503,'分享域名未配置');
   return json({code,url:origin.replace(/\/$/,'')+'/#/pages/shared/shared?code='+code,expiresAt},201);
  }
  if(path==='/charts'&&method==='GET')return json({charts:(await rows(db,'SELECT * FROM charts WHERE owner_id=? ORDER BY updated_at DESC',[u.id])).map(c=>({id:c.id,craftId:c.craft_id,...JSON.parse(c.payload),updatedAt:c.updated_at}))});
  if(path==='/charts'&&method==='POST'){
   const b=await body(req);if(b.craftId){const c=await getCraft(db,b.craftId,u);if(c.owner_id!==u.id)fail(403,'只能保存自己的工艺图');}
   const id=b.id||crypto.randomUUID(),old=await first(db,'SELECT owner_id FROM charts WHERE id=?',[id]);if(old&&old.owner_id!==u.id)fail(404,'工艺图不存在');
   const payload={showText:b.showText!==false,showDimensions:b.showDimensions!==false,locked:!!b.locked};
   await run(db,'INSERT INTO charts (id,owner_id,craft_id,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',[id,u.id,b.craftId||null,JSON.stringify(payload),new Date(now).toISOString()]);return json({chart:{id,craftId:b.craftId||null,...payload}});
  }
  fail(404,'接口不存在');
 } catch(e) {if(!(e instanceof HttpError))console.error('API failure',e?.name);return json({message:e instanceof HttpError?e.message:'服务暂时不可用，请稍后重试'},e.status||500);}
}
