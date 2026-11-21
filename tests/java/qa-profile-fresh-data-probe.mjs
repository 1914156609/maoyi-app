import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const phase=process.argv[2]||'after';if(!['before','after'].includes(phase))throw Error('Expected before/after');
const deps='.data/qa/generator-parent-probe-before';
const modules=['ruoyi-admin','ruoyi-common','ruoyi-framework','ruoyi-system','ruoyi-quartz','ruoyi-generator'].map(m=>'../maoyi-backend/'+m+'/target/classes');
const jars=readdirSync(deps).filter(n=>n.endsWith('.jar')&&!n.startsWith('ruoyi-')).map(n=>deps+'/'+n);
const run=spawnSync('java',['--class-path',[...modules,...jars].join(':'),'tests/java/ProfileFreshDataProbe.java'],{encoding:'utf8'});
const line=run.stdout.split('\n').find(l=>l.startsWith('{')&&l.includes('assertions'));
if(!line){console.error(run.stderr);throw Error('Profile probe produced no result')}
const file='.data/qa/api-evidence/r16-profile-fresh-data-'+phase+'.json';
const artifact=modules[0]+'/com/ruoyi/web/controller/system/SysProfileController.class';
const result={at:new Date().toISOString(),phase,kind:'Actual compiled controller with isolated SecurityContext and in-memory service boundary; not live HTTP or UI',...JSON.parse(line),exitCode:run.status,artifactSha256:createHash('sha256').update(readFileSync(artifact)).digest('hex'),scope:'No real credentials, database, Redis, cache token or running service changes'};
writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,assertions:result.assertions,passed:result.passed,failed:result.failed,exitCode:run.status}));
if(phase==='after'&&run.status!==0)process.exit(1);
