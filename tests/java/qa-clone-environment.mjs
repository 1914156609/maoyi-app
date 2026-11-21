// One isolated database + Redis namespace for destructive official-admin test actions.
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {detectDatabaseTimeZone,withDatabaseTimeZone,javaTimeZone} from '../../scripts/java-timezone.mjs';
const command=process.argv[2]||'prepare',file='.secrets/qa-clone.json';
function backendArtifact(release) {
 if(!/^qa-[a-zA-Z0-9-]+$/.test(release))throw Error('Invalid frozen release');
 const manifest=JSON.parse(readFileSync(resolve('.data/qa/releases',release,'manifest.json')));
 const name=manifest.backendArtifact||'ruoyi-admin.jar';
 if(!['maoyi-backend.jar','ruoyi-admin.jar'].includes(name)||!manifest.files[name])throw Error('Invalid frozen backend artifact');
 return name;
}
const mysql=(query,db)=>execFileSync('mysql',['--protocol=socket','-uroot',...(db?[db]:[])],{input:query,encoding:'utf8',maxBuffer:64*1024*1024});
if(command==='prepare'){
 if(existsSync(file))throw Error('Preserve tracked clone; do not overwrite it');
 const {runId}=JSON.parse(readFileSync('.secrets/qa-accounts.json')),suffix=runId.split('-').at(-1),release=process.env.QA_RELEASE_ID;
 if(!release||!/^[a-f0-9]{6}$/.test(suffix))throw Error('Set fixed release');
 try{execFileSync('redis-cli',['-p','6390','PING'],{stdio:'ignore'});throw Error('Port6390 already belongs to a Redis service')}catch(e){if(e.message==='Port6390 already belongs to a Redis service')throw e}
 const db='maoyi_qa_clone_'+suffix,dbUser='qa_clone_'+suffix,dbPassword=randomBytes(18).toString('base64url');
 const {env:original}=JSON.parse(readFileSync('.secrets/java-local.json'));
 const env={...original,DB_URL:`jdbc:mysql://127.0.0.1:3306/${db}?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`,DB_USER:dbUser,DB_PASSWORD:dbPassword,JWT_SECRET:randomBytes(32).toString('base64url'),REDIS_PORT:'6390',PUBLIC_ORIGIN:'http://127.0.0.1:5199',UPLOAD_PATH:resolve('.secrets/qa-clone/uploads'),WECHAT_APP_ID:'',WECHAT_APP_SECRET:'',PORT:'8082'};
 const state={runId,release,createdAt:new Date().toISOString(),database:db,dbUser,dbPassword,env,redisPort:6390,apiPort:8082,jar:resolve('.data/qa/releases',release,backendArtifact(release))};
 mkdirSync('.secrets/qa-clone/redis',{recursive:true,mode:0o700});writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});
 mysql(`CREATE DATABASE ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPassword}'; GRANT ALL PRIVILEGES ON ${db}.* TO '${dbUser}'@'localhost';`);
 const dump=execFileSync('mysqldump',['--protocol=socket','-uroot','--single-transaction','--skip-lock-tables','--set-gtid-purged=OFF','--no-tablespaces','maoyi_ruoyi'],{maxBuffer:64*1024*1024});mysql(dump,db);
 mysql("UPDATE sys_job SET status='1';",db);
 const redisConfig=resolve('.secrets/qa-clone/redis.conf');writeFileSync(redisConfig,`bind 127.0.0.1\nport 6390\nprotected-mode yes\ndaemonize yes\npidfile ${resolve('.secrets/qa-clone/redis.pid')}\ndir ${resolve('.secrets/qa-clone/redis')}\nlogfile ${resolve('.secrets/qa-clone/redis.log')}\nappendonly yes\n`,{mode:0o600});
 execFileSync('redis-server',[redisConfig],{stdio:'ignore'});execFileSync('redis-cli',['-p','6390','SET','qa:clone:runId',runId],{stdio:'ignore'});
 writeFileSync('.data/qa/clone-handoff.json',JSON.stringify({runId,release,database:db,redisPort:6390,apiPort:8082,javaStarted:false,accounts:'源QA账号在数据库快照中保留同一ID；凭据读取原.secrets/qa-accounts.json，JWT独立且不复制现用登录令牌。',scope:'全局日志/缓存清理仅可在此克隆Java8082及其专属管理预览进行。当前637e Java JAR，全部定时任务禁用；现用数据库/Redis未改动。',redisState:'新的独立Redis实例，仅QA标记，Java启动后自行建立克隆缓存'},null,2)+'\n');
 console.log('Prepared clone DB and isolated Redis6390; clone Java8082 deliberately not started.');
}else if(command==='java'){
 const c=JSON.parse(readFileSync(file));if(c.apiPort!==8082||c.redisPort!==6390||!/^maoyi_qa_clone_[a-f0-9]{6}$/.test(c.database))throw Error('Invalid isolated environment');
 if(!c.env.DB_URL.includes('/'+c.database+'?')||Number(c.env.REDIS_PORT)!==6390||Number(c.env.PORT)!==8082)throw Error('Clone URL/Redis/port isolation mismatch');
 if(resolve(c.jar)!==resolve('.data/qa/releases',c.release,backendArtifact(c.release)))throw Error('Clone must use its declared frozen release');
 const zone=detectDatabaseTimeZone(c.env),env={...c.env,DB_URL:withDatabaseTimeZone(c.env.DB_URL,zone),BIND_ADDRESS:'127.0.0.1'};
 const child=spawn('java',['-Duser.timezone='+javaTimeZone(zone),'-jar',c.jar,'--spring.profiles.active=druid,maoyi','--server.address=127.0.0.1'],{env:{...process.env,...env},stdio:'inherit'});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));child.on('exit',code=>process.exit(code||0));
}else if(command==='cleanup'){
 const c=JSON.parse(readFileSync(file));if(!/^maoyi_qa_clone_[a-f0-9]{6}$/.test(c.database)||!/^qa_clone_[a-f0-9]{6}$/.test(c.dbUser)||c.redisPort!==6390)throw Error('Invalid clone ownership');
 try{const r=await fetch('http://127.0.0.1:8082/api/health',{signal:AbortSignal.timeout(500)});if(r)throw Error('Stop isolated Java8082 before clone cleanup')}catch(e){if(e.message==='Stop isolated Java8082 before clone cleanup')throw e}
 const info=execFileSync('redis-cli',['-p','6390','INFO','server'],{encoding:'utf8'});if(!info.includes('config_file:'+resolve('.secrets/qa-clone/redis.conf')))throw Error('Redis6390 ownership changed');
 execFileSync('redis-cli',['-p','6390','SHUTDOWN','NOSAVE'],{stdio:'ignore'});mysql(`DROP DATABASE ${c.database};DROP USER '${c.dbUser}'@'localhost';`);
 writeFileSync('.data/qa/api-evidence/clone-cleanup.json',JSON.stringify({runId:c.runId,release:c.release,at:new Date().toISOString(),database:c.database,redisPort:6390,removed:true},null,2)+'\n');rmSync('.secrets/qa-clone',{recursive:true});rmSync(file);console.log('Removed only tracked clone database/user and isolated Redis files.');
}else throw Error('Expected prepare, java or cleanup');
