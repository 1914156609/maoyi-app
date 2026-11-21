// Explicitly authorized QA114 ordinary-profile cleanup. Not a real-page action.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {execFileSync as exec} from 'node:child_process';
import {createHash} from 'node:crypto';
const evidenceFile='.data/qa/api-evidence/r19-systemAdmin114-profile-restored.json';
assert.ok(!fs.existsSync(evidenceFile),'Restoration already recorded; do not repeat');
const backup=JSON.parse(fs.readFileSync('.secrets/qa-r17-systemAdmin-profile-before.json'));
const uploaded=JSON.parse(fs.readFileSync('.secrets/qa-r19-avatar114-upload.json'));
assert.equal(backup.user.userId,114);assert.equal(uploaded.userId,114);
const hash=b=>createHash('sha256').update(b).digest('hex');
const sql=q=>exec('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','--raw'],{input:q,encoding:'utf8'}).trim();
const redis=(...args)=>exec('redis-cli',['-p','6388','--raw',...args],{encoding:'utf8'}).trim();
const row=()=>JSON.parse(sql("SELECT JSON_OBJECT('id',user_id,'nickname',nick_name,'phone',phonenumber,'email',email,'avatar',avatar,'sex',sex,'status',status,'deleted',del_flag,'deptId',dept_id,'passwordHash',password,'updated',update_time) FROM sys_user WHERE user_id=114"));
const before=row();assert.equal(before.nickname,'QA资料验收R18');assert.equal(before.phone,'13800000000');assert.equal(before.email,'qa114@example.test');assert.equal(before.avatar,uploaded.path);
const roleRows=sql('SELECT role_id FROM sys_user_role WHERE user_id=114 ORDER BY role_id');
const postRows=sql('SELECT post_id FROM sys_user_post WHERE user_id=114 ORDER BY post_id');
assert.equal(roleRows,backup.roleIds.join('\n'));assert.equal(postRows,backup.postIds.join('\n'));
const file=fs.realpathSync(uploaded.file),root=fs.realpathSync('.data/uploads/avatar')+path.sep;
assert.ok(file.startsWith(root));const bytes=fs.readFileSync(file);assert.equal(hash(bytes),uploaded.sha256);
const archived='.data/qa/api-evidence/r19-ui-avatar114-uploaded.png';fs.copyFileSync(file,archived);assert.equal(hash(fs.readFileSync(archived)),uploaded.sha256);
const keys=redis('--scan','--pattern','login_tokens:*').split('\n').filter(Boolean),raw=keys.map(k=>redis('GET',k));
const jarDir='.data/qa/generator-parent-probe-before',jar=jarDir+'/'+fs.readdirSync(jarDir).find(f=>f.startsWith('fastjson2-'));
const metadata=JSON.parse(exec('java',['-cp',jar,'tests/java/QaSessionMetadataProbe.java'],{input:raw.map(v=>Buffer.from(v).toString('base64')).join('\n'),encoding:'utf8'}));
const mapping={nickName:[before.nickname,backup.user.nickName],email:[before.email,backup.user.email],phonenumber:[before.phone,backup.user.phonenumber],avatar:[before.avatar,backup.user.avatar]};
const targets=metadata.map((m,i)=>({m,key:keys[i],raw:raw[i]})).filter(x=>x.m.userId===114);
assert.ok(targets.length>=1,'Expected current actual UI QA114 session');
for(const t of targets){let next=t.raw;for(const [key,[oldValue,newValue]]of Object.entries(mapping)){const search=JSON.stringify(key)+':'+JSON.stringify(oldValue);assert.equal(next.split(search).length-1,1,'Each changed ordinary field must uniquely match this exact QA114 snapshot: '+key);next=next.replace(search,JSON.stringify(key)+':'+JSON.stringify(newValue));}t.next=next;}
fs.writeFileSync('.secrets/qa-r19-profile114-cleanup-before.json',JSON.stringify({at:new Date().toISOString(),before,targets},null,2),{mode:0o600});
const hex=s=>"CONVERT(0x"+Buffer.from(s).toString('hex')+" USING utf8mb4)";
const str=s=>s===''?"''":hex(s);
sql(`UPDATE sys_user SET nick_name=${str(backup.user.nickName)},email=${str(backup.user.email)},phonenumber=${str(backup.user.phonenumber)},avatar=${str(backup.user.avatar)} WHERE user_id=114 AND BINARY avatar=BINARY ${str(before.avatar)} AND BINARY nick_name=BINARY ${str(before.nickname)};`);
// Send private Redis values over a local socket, never CLI arguments/output. CAS preserves TTL/auth fields.
async function compareAndSet(key,oldValue,newValue){const lua="if redis.call('GET',KEYS[1])~=ARGV[1] then return -2 end local ttl=redis.call('PTTL',KEYS[1]);redis.call('SET',KEYS[1],ARGV[2],'XX','KEEPTTL');return ttl";const args=['EVAL',lua,'1',key,oldValue,newValue];const wire=Buffer.concat([Buffer.from('*'+args.length+'\r\n'),...args.flatMap(a=>[Buffer.from('$'+Buffer.byteLength(a)+'\r\n'),Buffer.from(a),Buffer.from('\r\n')])]);return await new Promise((resolve,reject)=>{const socket=net.connect(6388,'127.0.0.1',()=>socket.write(wire));let text='';socket.on('data',b=>{text+=b;if(text.endsWith('\r\n')){socket.end();if(!/^:\d+\r\n$/.test(text))reject(Error('QA114 session changed concurrently; inspect private backup without overwriting'));else resolve(Number(text.slice(1)));}});socket.on('error',reject);});}
const caches=[];for(const t of targets){const ttlBefore=await compareAndSet(t.key,t.raw,t.next);assert.ok(redis('GET',t.key)===t.next,'Exact private session cache mismatch');const ttlAfter=Number(redis('PTTL',t.key));assert.ok(ttlAfter<=ttlBefore&&ttlAfter>ttlBefore-5000);caches.push({userId:114,ordinaryFields:Object.keys(mapping),otherBytesPreserved:true,ttlBeforeMs:ttlBefore,ttlAfterMs:ttlAfter});}
const after=row(),protectedPart=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['nickname','phone','email','avatar'].includes(k)));
assert.ok(JSON.stringify(protectedPart(after))===JSON.stringify(protectedPart(before)),'Protected QA114 fields changed unexpectedly');assert.equal(after.nickname,backup.user.nickName);assert.equal(after.phone,backup.user.phonenumber);assert.equal(after.email,backup.user.email);assert.equal(after.avatar,backup.user.avatar);
assert.equal(sql('SELECT role_id FROM sys_user_role WHERE user_id=114 ORDER BY role_id'),roleRows);assert.equal(sql('SELECT post_id FROM sys_user_post WHERE user_id=114 ORDER BY post_id'),postRows);
fs.unlinkSync(file);assert.ok(!fs.existsSync(file));
const safe=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='passwordHash'));
const evidence={release:'qa-20261118-r19',at:new Date().toISOString(),kind:'Explicit root-authorized SQL + ordinary-cache cleanup, NOT actual UI restoration',userId:114,baseline:'.secrets/qa-r17-systemAdmin-profile-before.json',before:safe(before),after:safe(after),sessionCache:caches,file:{archived,sha256:uploaded.sha256,bytes:bytes.length,removedExactNewUpload:true,originalAvatarEmpty:true},checks:{originalOrdinaryFieldsRestored:true,passwordStatusDepartmentAndTimestampUnchanged:true,rolesPostsUnchanged:true,sessionsTokensPermissionsExpiryAndTtlRetained:true,onlyUploadedFileRemoved:true},auditPolicy:'Original actual UI save/upload audits317/327 retained. Cleanup uses exact SQL and does not manufacture UI operation audit.'};
fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
console.log({evidenceFile,checks:evidence.checks,cacheSessions:caches.length});
