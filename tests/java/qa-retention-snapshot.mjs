// Read-only fingerprints for the UI lanes; never reads all Redis keys or mutates fixtures.
import {readFileSync} from 'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const sql=q=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','maoyi_ruoyi','-N','--raw'],{input:q,encoding:'utf8'}).trim();
const fingerprint=v=>createHash('sha256').update(v).digest('hex');
export function retentionSnapshot(){
 const objects=JSON.parse(readFileSync('.data/qa/handoff.json')).lanes.find(l=>l.lane==='system').objects;
 const craft=sql('SELECT id,owner_id,status,version,SHA2(payload,256),updated_at FROM maoyi_craft WHERE owner_id IN(103,104) ORDER BY id');
 const share=sql('SELECT token_hash,owner_id,craft_id,revoked,expires_at,SHA2(snapshot,256) FROM maoyi_share WHERE owner_id IN(103,104) ORDER BY token_hash');
 const system=objects.filter(o=>o.table&&o.key&&Number.isInteger(o.id)).map(o=>{if(!/^sys_[a-z_]+$/.test(o.table)||!/^[a-z_]+$/.test(o.key))throw Error('Invalid tracked identifier');const data=sql(`SELECT * FROM ${o.table} WHERE ${o.key}=${o.id}`);return {table:o.table,id:o.id,present:!!data,fingerprint:fingerprint(data)};});
 const protectedUsers=sql('SELECT user_id,user_name,nick_name,status,del_flag,password,create_time FROM sys_user WHERE user_id IN(1,101,102) ORDER BY user_id');
 const roles=sql('SELECT user_id,role_id FROM sys_user_role WHERE user_id BETWEEN 103 AND 114 ORDER BY user_id,role_id');
 const rootKeys=JSON.parse(readFileSync('.secrets/qa-r15-api-before.json')).rootSessionKeys;
 const originalAdminSessionPresence=rootKeys.map(k=>execFileSync('redis-cli',['-p','6388','EXISTS',k],{encoding:'utf8'}).trim()==='1');
 return {at:new Date().toISOString(),craftCount:craft?craft.split('\n').length:0,craftFingerprint:fingerprint(craft),shareCount:share?share.split('\n').length:0,shareFingerprint:fingerprint(share),systemFixtureGroups:objects.length,system,protectedUserFingerprint:fingerprint(protectedUsers),qaRoleFingerprint:fingerprint(roles),originalAdminSessionPresence,originalAdminSessionsRetained:originalAdminSessionPresence.every(Boolean)};
}
export function compareRetention(a,b){const before=a.originalAdminSessionPresence||[a.originalAdminSessionsRetained],after=b.originalAdminSessionPresence||[b.originalAdminSessionsRetained];return {uiCraftsUnchanged:a.craftFingerprint===b.craftFingerprint,uiSharesUnchanged:a.shareFingerprint===b.shareFingerprint,systemFixturesUnchanged:JSON.stringify(a.system)===JSON.stringify(b.system)&&a.systemFixtureGroups===b.systemFixtureGroups,originalAccountsUnchanged:a.protectedUserFingerprint===b.protectedUserFingerprint,qaRolesUnchanged:a.qaRoleFingerprint===b.qaRoleFingerprint,baselineOriginalAdminSessionsRetained:before.every((existed,i)=>!existed||after[i]===true)};}
