import{spawnSync}from'node:child_process';import{readFileSync,writeFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';
const deps='.data/qa/generator-parent-probe-before';
const modules=['ruoyi-admin','ruoyi-common','ruoyi-framework','ruoyi-system','ruoyi-quartz','ruoyi-generator'].map(m=>'../maoyi-backend/'+m+'/target/classes');
const jars=readdirSync(deps).filter(n=>n.endsWith('.jar')&&!n.startsWith('ruoyi-')).map(n=>deps+'/'+n);
const run=spawnSync('java',['--class-path',[...modules,...jars].join(':'),'tests/java/SystemUserValidationProbe.java'],{encoding:'utf8'});
const line=run.stdout.split('\n').find(l=>l.startsWith('{')&&l.includes('assertions'));
if(!line){console.error(run.stderr);throw Error('User validation probe returned no result');}
const sources=['../maoyi-backend/ruoyi-common/src/main/java/com/ruoyi/common/core/domain/entity/SysUser.java','../maoyi-backend/ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/SysUserController.java','../maoyi-backend/ruoyi-system/src/main/java/com/ruoyi/system/service/impl/SysUserServiceImpl.java','../maoyi-backend/ruoyi-system/src/main/java/com/ruoyi/system/service/impl/SysRoleServiceImpl.java'];
const result={at:new Date().toISOString(),candidate:'qa-20261121-r22',kind:'Actual compiled controller/BeanValidation/services, synthetic SecurityContext and mapper boundaries; not live HTTP or UI',...JSON.parse(line),exitCode:run.status,sourceSha256:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),scope:'No database, real account credentials, Redis, running service, or frozen release writes'};
const file='.data/qa/api-evidence/r22-system-user-validation-probe.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,assertions:result.assertions,passed:result.passed,failed:result.failed,exitCode:run.status}));if(run.status!==0)process.exit(1);
