import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { handleApi } from '../../server/api.mjs';
import { openDatabase } from '../../server/sqlite.mjs';
import { passwordHash } from '../../server/crypto.mjs';
const now=Date.UTC(2026,10,18),origin='https://workshop.example';
const baseCraft={name:'云端验收工艺',style:'背心',neck:'V领',sleeve:'无袖',length:'常规',density:'68',rowDensity:'46',sizes:{chest:'100',bodyLength:'60'}};
async function fixture(t){
 const DB=openDatabase();DB.migrate(resolve('server/migrations'));t.after(()=>DB.close());
 const env={DB,PUBLIC_ORIGIN:origin,BOOTSTRAP_ADMIN_ACCOUNT:'admin',BOOTSTRAP_ADMIN_PASSWORD_HASH:await passwordHash('admin-password-123')};
 async function call(path,method='GET',data,token,options={}){
  const r=await handleApi(new Request(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})}),env,{now,...options});
  return {status:r.status,data:await r.json(),headers:r.headers};
 }
 const login=async(account,password)=>call('/auth/login','POST',{type:'employee',account,password});
 const admin=(await login('admin','admin-password-123')).data;
 async function account(name,role='employee',state='active'){
  const r=await call('/admin/users','POST',{account:name,password:name+'-password-123',role,state},admin.token);assert.equal(r.status,201);
  return state==='active'?(await login(name,name+'-password-123')).data:r.data;
 }
 return {DB,env,call,login,admin,account};
}
test('真实账号验证、停用账号拒绝、退出撤销服务端会话',async t=>{
 const {call,login,admin,account}=await fixture(t);
 assert.equal((await login('admin','wrong')).status,401);
 const employee=await account('maker');assert.equal(employee.user.roleCode,'employee');
 const pending=await account('waiting','employee','pending');assert.equal((await login('waiting','waiting-password-123')).status,403);
 assert.equal((await call('/admin/users/'+pending.user.id,'PATCH',{state:'active'},admin.token)).status,200);
 assert.equal((await login('waiting','waiting-password-123')).status,200);
 assert.equal((await call('/auth/me','GET',null,employee.token)).status,200);
 assert.equal((await call('/auth/logout','POST',{},employee.token)).status,200);
 assert.equal((await call('/auth/me','GET',null,employee.token)).status,401);
 assert.equal((await call('/auth/me','GET',null,admin.token,{now:now+8*86400000})).status,401);
});
test('工艺持久保存与账号隔离，客户端不能伪造所有者或审批状态',async t=>{
 const {call,account,DB}=await fixture(t);const a=await account('maker-a'),b=await account('maker-b');
 const r=await call('/crafts','POST',{...baseCraft,ownerId:b.user.id,status:'approved',parts:[['x','x','x']]},a.token);assert.equal(r.status,201);
 assert.equal(r.data.craft.ownerId,a.user.id);assert.equal(r.data.craft.status,'draft');assert.deepEqual(r.data.craft.parts,[]);
 assert.equal((await call('/crafts/'+r.data.craft.id,'GET',null,b.token)).status,404);
 assert.equal((await call('/crafts','GET',null,b.token)).data.crafts.length,0);
 assert.equal((await call('/crafts','GET',null,a.token)).data.crafts[0].name,baseCraft.name);
 assert.equal(DB.raw.prepare('SELECT count(*) n FROM crafts').get().n,1);
});
test('提交→主管驳回→修改→再次提交→通过，记录与版本一致',async t=>{
 const {call,account}=await fixture(t),maker=await account('maker'),manager=await account('manager','supervisor');
 let c=(await call('/crafts','POST',baseCraft,maker.token)).data.craft;
 c=(await call('/crafts/'+c.id+'/submit','POST',{version:c.version},maker.token)).data.craft;assert.equal(c.status,'pending');
 assert.equal((await call('/approvals','GET',null,maker.token)).status,403);
 assert.equal((await call('/approvals','GET',null,manager.token)).data.crafts.length,1);
 assert.equal((await call('/crafts/'+c.id+'/review','POST',{decision:'approved',version:c.version},maker.token)).status,403);
 assert.equal((await call('/crafts/'+c.id+'/review','POST',{decision:'rejected',note:'',version:c.version},manager.token)).status,400);
 c=(await call('/crafts/'+c.id+'/review','POST',{decision:'rejected',note:'请补充尺寸',version:c.version},manager.token)).data.craft;
 c=(await call('/crafts/'+c.id,'PUT',{...baseCraft,version:c.version,sizes:{chest:'102'}},maker.token)).data.craft;
 assert.equal(c.status,'draft');c=(await call('/crafts/'+c.id+'/submit','POST',{version:c.version},maker.token)).data.craft;
 c=(await call('/crafts/'+c.id+'/review','POST',{decision:'approved',version:c.version},manager.token)).data.craft;
 assert.equal(c.status,'approved');assert.equal((await call('/approvals','GET',null,manager.token)).data.crafts.length,0);
 const hist=(await call('/crafts/'+c.id+'/history','GET',null,maker.token)).data.history;
 assert.deepEqual(hist.map(x=>x.status),['pending','rejected','pending','approved']);assert.equal(hist[1].note,'请补充尺寸');
 assert.equal((await call('/crafts/'+c.id,'PUT',{...baseCraft,version:c.version},maker.token)).status,409);
});
test('并发审批只允许一次成功，不会重复写审批记录',async t=>{
 const {call,admin,account,DB}=await fixture(t),maker=await account('maker');let c=(await call('/crafts','POST',baseCraft,maker.token)).data.craft;
 c=(await call('/crafts/'+c.id+'/submit','POST',{version:c.version},maker.token)).data.craft;
 const result=await Promise.all(['approved','rejected'].map(decision=>call('/crafts/'+c.id+'/review','POST',{decision,note:'核对意见',version:c.version},admin.token)));
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal(DB.raw.prepare('SELECT count(*) n FROM audit WHERE version=?').get(c.version+1).n,1);
});
test('无登录、无原浏览器存储也能读取七天分享，过期失效',async t=>{
 const {call,account}=await fixture(t),a=await account('maker'),b=await account('other');
 let c=(await call('/crafts','POST',baseCraft,a.token)).data.craft;
 assert.equal((await call('/shares','POST',{craftId:c.id},b.token)).status,404);
 const shared=await call('/shares','POST',{craftId:c.id},a.token);assert.equal(shared.status,201);
 assert.ok(shared.data.url.startsWith(origin+'/#/pages/shared/shared?code='));
 const independent=await call('/shares/'+shared.data.code);assert.equal(independent.status,200);assert.equal(independent.data.craft.name,baseCraft.name);
 assert.equal(independent.data.craft.ownerId,undefined);assert.equal(independent.data.craft.history,undefined);
 await call('/crafts/'+c.id,'PUT',{...baseCraft,version:c.version,name:'已经修改'},a.token);
 assert.equal((await call('/shares/'+shared.data.code)).data.craft.name,baseCraft.name);
 assert.equal((await call('/shares/'+shared.data.code,'GET',null,null,{now:now+7*86400000})).status,404);
 assert.equal(independent.headers.get('cache-control'),'no-store');
});
test('官方微信 code 在服务端兑换，session_key 不会下发，角色不由客户端指定',async t=>{
 const {call,env}=await fixture(t);assert.equal((await call('/auth/login','POST',{type:'wechat',code:'example-code'})).status,503);
 env.WECHAT_APP_ID='test-app-id';env.WECHAT_APP_SECRET='test-app-secret';
 const fetcher=async raw=>{const url=new URL(raw);assert.equal(url.origin,'https://api.weixin.qq.com');assert.equal(url.pathname,'/sns/jscode2session');assert.equal(url.searchParams.get('secret'),'test-app-secret');assert.equal(url.searchParams.get('grant_type'),'authorization_code');return Response.json({openid:'mock-test-open-id',session_key:'must-never-leave-server'});};
 const a=await call('/auth/login','POST',{type:'wechat',code:'example-code',role:'admin'},null,{fetcher});
 assert.equal(a.status,200);assert.equal(a.data.user.roleCode,'customer');assert.ok(!JSON.stringify(a.data).includes('must-never-leave-server'));
 const b=await call('/auth/login','POST',{type:'wechat',code:'another-code'},null,{fetcher});assert.equal(a.data.user.id,b.data.user.id);
});
test('暴力登录限流、恶意角色与不合法输入被拒绝',async t=>{
 const {call,login,admin,account}=await fixture(t);const a=await account('maker');
 assert.equal((await call('/admin/users','POST',{account:'rogue',password:'password-12345',role:'admin'},a.token)).status,403);
 assert.equal((await call('/crafts','POST',{...baseCraft,sizes:{chest:-1}},a.token)).status,400);
 for(let i=0;i<12;i++)await login('nonexistent','wrong-password');
 assert.equal((await login('nonexistent','wrong-password')).status,429);
 assert.equal((await call('/auth/me','GET',null,'invalid-token')).status,401);
});
