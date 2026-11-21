import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {basename,join} from 'node:path';
import {createHash} from 'node:crypto';
const label=process.argv[2]||'after';if(!['before','after'].includes(label))throw Error('before or after');
const directory='.data/qa/generator-parent-probe-before';mkdirSync(directory,{recursive:true});
const packaged=JSON.parse(execFileSync('python3',['-c',`import json,zipfile,pathlib,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 names=[p for p in z.namelist() if p.startswith('BOOT-INF/lib/') and p.endswith('.jar')]
 for p in names:
  target=pathlib.Path(sys.argv[2],pathlib.PurePosixPath(p).name)
  if not target.exists():target.write_bytes(z.read(p))
 print(json.dumps([pathlib.PurePosixPath(p).name for p in names]))`,'.data/qa/releases/qa-20261118-r8/ruoyi-admin.jar',directory],{encoding:'utf8'}));
const deps=packaged.filter(name=>!name.startsWith('ruoyi-generator-')&&!name.startsWith('ruoyi-common-')).map(name=>join(directory,name));
const modules=label==='before'?packaged.filter(name=>name.startsWith('ruoyi-generator-')||name.startsWith('ruoyi-common-')).map(name=>join(directory,name)):['../maoyi-backend/ruoyi-generator/target/classes','../maoyi-backend/ruoyi-common/target/classes'];
const classpath=[...modules,...deps].join(':');
const run=spawnSync('java',['--class-path',classpath,'tests/java/GeneratorParentMenuProbe.java'],{encoding:'utf8'});
const line=run.stdout.trim().split('\n').find(l=>l.startsWith('{')&&l.includes('assertions'));
if(!line){console.error(run.stderr);throw Error('Java regression probe produced no result')}
const serviceArtifact=label==='before'?modules.find(p=>basename(p).startsWith('ruoyi-generator-')):'../maoyi-backend/ruoyi-generator/target/classes/com/ruoyi/generator/service/GenTableServiceImpl.class';
const result={kind:'Actual Java compiled service/template pure in-memory regression; not HTTP or UI',phase:label,at:new Date().toISOString(),...JSON.parse(line),exitCode:run.status,serviceArtifact,serviceArtifactSha256:createHash('sha256').update(readFileSync(serviceArtifact)).digest('hex'),dependencyVersions:'Exactly matched current packaged R6 JAR libraries; not arbitrary Maven-cache versions'};
const file='.data/qa/api-evidence/r14-generator-parent-'+label+'.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,assertions:result.assertions,passed:result.passed,failed:result.failed,exitCode:run.status}));
if(label==='after'&&run.status!==0)process.exit(1);
