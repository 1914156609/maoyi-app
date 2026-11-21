import {existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

// RuoYi uses Fastjson WriteClassName (Set[...] and long suffixes), not strict JSON.
// Parse with its own library; never eval, normalize text, or expose private input in errors.
export function readSessionMetadata(values){
 if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!v.trim()))throw Error('Expected nonempty private session records');
 if(!values.length)return [];
 const base=resolve(process.env.HOME,'.m2/repository/com/alibaba/fastjson2/fastjson2');
 const candidates=existsSync(base)?readdirSync(base).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>resolve(base,v,`fastjson2-${v}.jar`)).filter(existsSync):[];
 const jar=process.env.QA_FASTJSON_JAR||candidates[0];
 if(!jar||!existsSync(jar))throw Error('Fastjson dependency unavailable; abort cleanup before mutation');
 let result;
 try{result=JSON.parse(execFileSync('java',['-cp',jar,resolve(import.meta.dirname,'QaSessionMetadataProbe.java')],{input:values.map(v=>Buffer.from(v).toString('base64')).join('\n'),encoding:'utf8',stdio:['pipe','pipe','pipe']}));}
 catch{throw Error('Could not safely parse session ownership; abort cleanup before mutation');}
 if(!Array.isArray(result)||result.length!==values.length||result.some(r=>!Number.isSafeInteger(r.userId)||r.userId<1))throw Error('Invalid session ownership projection; abort cleanup before mutation');
 return result;
}

export function selectOwnedSessionKeys(records,trackedIds){
 if(!(trackedIds instanceof Set)||[...trackedIds].some(id=>!Number.isSafeInteger(id)||id<=1))throw Error('Invalid QA ownership IDs');
 if(records.some(r=>typeof r.key!=='string'||!r.key.startsWith('login_tokens:')))throw Error('Invalid session key namespace');
 const metadata=readSessionMetadata(records.map(r=>r.raw));
 return records.filter((_,i)=>trackedIds.has(metadata[i].userId)).map(r=>r.key);
}
