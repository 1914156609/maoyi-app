import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const phase=process.argv[2]||'after';
if(!['before','after'].includes(phase))throw Error('Expected before/after');
const deps='.data/qa/generator-parent-probe-before';
const modules=['ruoyi-admin','ruoyi-common','ruoyi-framework','ruoyi-system','ruoyi-quartz','ruoyi-generator'].map(m=>'../maoyi-backend/'+m+'/target/classes');
const jars=readdirSync(deps).filter(n=>n.endsWith('.jar')&&!n.startsWith('ruoyi-')).map(n=>deps+'/'+n);
const className='com/ruoyi/web/controller/system/SysLoginController.class';
const beforeDir='.data/qa/getinfo-probe-before';
if(phase==='before') {
  mkdirSync(beforeDir+'/com/ruoyi/web/controller/system',{recursive:true});
  writeFileSync(beforeDir+'/'+className,execFileSync('unzip',['-p','.data/qa/releases/qa-20261118-r20/ruoyi-admin.jar','BOOT-INF/classes/'+className]));
}
const run=spawnSync('java',['--class-path',[...(phase==='before'?[beforeDir]:[]),...modules,...jars].join(':'),'tests/java/GetInfoFreshRolesProbe.java'],{encoding:'utf8'});
const line=run.stdout.split('\n').find(l=>l.startsWith('{')&&l.includes('assertions'));
if(!line){console.error(run.stderr);throw Error('GetInfo probe produced no result')}
const file='.data/qa/api-evidence/r21-getinfo-fresh-roles-'+phase+'.json';
const artifact=(phase==='before'?beforeDir:modules[0])+'/'+className;
const result={at:new Date().toISOString(),phase,kind:'Actual compiled controller and permission services with isolated SecurityContext and in-memory DB/token boundaries; not live HTTP or UI',...JSON.parse(line),exitCode:run.status,artifactSha256:createHash('sha256').update(readFileSync(artifact)).digest('hex'),scope:'Synthetic identities only; no database, real credentials, Redis, or running-service changes'};
writeFileSync(file,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file,assertions:result.assertions,passed:result.passed,failed:result.failed,exitCode:run.status}));
if(phase==='after'&&run.status!==0)process.exit(1);
