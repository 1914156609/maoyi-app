// Control only two newly inserted, disabled and hidden menus.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const origin=process.env.MAOYI_TEST_ORIGIN||'http://127.0.0.1:8081';assert.match(origin,/^http:\/\/127\.0\.0\.1:808[124]$/);
const {accounts}=JSON.parse(readFileSync('.secrets/java-local.json')),admin=accounts.find(x=>x.account==='admin');
const suffix=randomUUID().slice(0,8),ids=[],requests=[];let token,gate,gateOutput='',failure,cycle,statuses,blocked=0;
const sql=query=>execFileSync('mysql',['--protocol=socket','-uroot','--default-character-set=utf8mb4','-N','maoyi_ruoyi'],{input:query,encoding:'utf8'}).trim();
async function call(path,method='GET',body){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)}),data=await r.json(),status=typeof data.code==='number'&&data.code>=400?data.code:r.status;requests.push({path,method,status,message:data.msg||data.message});return {status,data};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const body=i=>({menuId:ids[i],parentId:ids[1-i],menuName:'QA25环'+suffix+i,orderNum:99,path:'qa25_cycle_'+suffix+i,isFrame:'1',isCache:'1',menuType:'M',visible:'1',status:'1',icon:'#'});
const release=()=>{if(gate&&!gate.stdin.destroyed)gate.stdin.write('COMMIT;\n');};
try{
 const login=await call('/api/auth/login','POST',{type:'employee',account:admin.account,password:admin.password});assert.equal(login.status,200);token=login.data.token;
 for(let i=0;i<2;i++)ids.push(Number(sql(`INSERT INTO sys_menu(menu_name,parent_id,order_num,path,is_frame,is_cache,menu_type,visible,status,create_by,create_time) VALUES('QA25环${suffix}${i}',0,99,'qa25_cycle_${suffix}${i}','1','1','M','1','1','qa25_menu',NOW());SELECT LAST_INSERT_ID();`)));
 gate=spawn('mysql',['--protocol=socket','-uroot','-N','--unbuffered','maoyi_ruoyi']);gate.stdout.on('data',part=>gateOutput+=part);
 gate.stdin.write(`START TRANSACTION;SELECT menu_id FROM sys_menu WHERE menu_id IN (${ids.join(',')}) ORDER BY menu_id FOR UPDATE;SELECT 'QA25_GATE';\n`);
 const until=Date.now()+5000;while(!gateOutput.includes('QA25_GATE')&&Date.now()<until)await pause(25);assert.ok(gateOutput.includes('QA25_GATE'));
 const operations=[0,1].map(i=>call('/system/menu','PUT',body(i)));
 const deadline=Date.now()+10000;while(Date.now()<deadline){blocked=Number(sql("SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_state='LOCK WAIT' AND trx_query LIKE '%sys_menu%'"));if(blocked>=2)break;await pause(75);}
 release();const responses=await Promise.all(operations);statuses=responses.map(x=>x.status);
 const parents=sql(`SELECT menu_id,parent_id FROM sys_menu WHERE menu_id IN (${ids.join(',')}) ORDER BY menu_id`).split('\n').map(line=>line.split('\t').map(Number));
 cycle=parents[0][1]===ids[1]&&parents[1][1]===ids[0];assert.ok(blocked>=2);assert.equal(cycle,false);assert.equal(statuses.filter(x=>x===200).length,1);assert.equal(statuses.filter(x=>x>=400&&x<500).length,1);
}catch(error){failure={name:error.name,message:error.message};}
finally{
 release();if(gate){gate.stdin.end();await new Promise(resolve=>{if(gate.exitCode!==null)return resolve();gate.once('exit',resolve);setTimeout(()=>{gate.kill();resolve();},2000);});}
 if(ids.length)sql(`DELETE FROM sys_menu WHERE menu_id IN (${ids.join(',')}) AND create_by='qa25_menu'`);
 if(token)await call('/api/auth/logout','POST',{}).catch(()=>{});
 const result={at:new Date().toISOString(),origin,release:process.env.QA_RELEASE_ID||'unfrozen',kind:'actual HTTP + controlled MySQL lock scheduling; no UI claim',passed:!failure,blockedWriters:blocked,statuses,cyclePersisted:cycle,failure,requests,cleanup:{ids,remaining:ids.length?Number(sql(`SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (${ids.join(',')})`)):0}};
 const file='.data/qa/current-review/round25/backend/menu-concurrency-'+(process.env.QA_RELEASE_ID||'unfrozen')+'.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,...result,requests:undefined}));if(failure)process.exitCode=1;
}
