import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const embedded='/Applications/IntelliJ IDEA.app/Contents/plugins/maven/lib/maven3/bin/mvn';
const command=process.env.MAVEN_BIN||(existsSync(embedded)?embedded:'mvn');
const r=spawnSync(command,process.argv.slice(2).length?process.argv.slice(2):['-q','-DskipTests','package'],{cwd:resolve(import.meta.dirname,'../../maoyi-backend'),stdio:'inherit'});process.exit(r.status??1);
