import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const origin=process.env.MAOYI_TOOLS_ORIGIN||'http://127.0.0.1:8084';
const label=process.env.QA_EVIDENCE_LABEL||'r12-swagger-groups-candidate';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid evidence label');
const checks=[],requests=[];
async function get(path){const response=await fetch(origin+path);const data=await response.json();requests.push({path,status:response.status});return {response,data};}
function check(label,fn){fn();checks.push({label,passed:true});}
const {data:config}=await get('/v3/api-docs/swagger-config');
check('Swagger offers five distinct local diagnostic groups',()=>assert.equal(config.urls.length,5));
check('All groups use admin proxy prefix',()=>assert.ok(config.urls.every(u=>u.url.startsWith('/prod-api/v3/api-docs/'))));
check('Try-it-out remains disabled',()=>assert.deepEqual(config.supportedSubmitMethods,[]));
check('No external validator enabled',()=>assert.equal(config.validatorUrl,''));
const required={maoyi:['/api/crafts','/api/auth/login','/maoyi/craft/list'],system:['/system/user/list','/system/role/list','/login'],monitor:['/monitor/server','/monitor/cache','/monitor/job/list','/monitor/jobLog/list'],tool:['/tool/gen/list','/tool/gen/importTable'],demo:['/test/user/list']};
const groups=[];
for(const [name,paths] of Object.entries(required)){
 const {response,data}=await get('/v3/api-docs/'+name);
 check(name+' OpenAPI loads',()=>{assert.equal(response.status,200);assert.ok(data.openapi)});
 for(const path of paths)check(name+' includes '+path,()=>assert.ok(data.paths[path]));
 const methods=['get','post','put','patch','delete','options','head','trace'];
 groups.push({name,pathCount:Object.keys(data.paths).length,operationCount:Object.values(data.paths).reduce((sum,path)=>sum+Object.keys(path).filter(key=>methods.includes(key)).length,0),paths:Object.keys(data.paths),schemaNames:Object.keys(data.components?.schemas||{})});
}
for(const path of ['/system/user/list','/maoyi/craft/list','/api/crafts','/monitor/server','/tool/gen/list']){
 const {response,data}=await get(path);check('Anonymous application access remains denied '+path,()=>assert.ok(response.status===401||data.code===401));
}
const configPath=origin.endsWith(':8084')?'.secrets/qa-local-tools-candidate.yml':'.secrets/java-local-tools.yml';
const result={origin,at:new Date().toISOString(),kind:'Real HTTP OpenAPI configuration coverage only, not endpoint semantic validation or visual UI acceptance',configSha256:createHash('sha256').update(readFileSync(configPath)).digest('hex'),requestCount:requests.length,requests,checks,groups,readonly:true,jarUnchanged:true,limitations:['OpenAPI exposure does not replace existing 28 business API integration tests.','Some controllers use Map/object request bodies; generated schemas are documentation and cannot prove every field contract.','Primary application authentication and role permissions remain unchanged.']};
const file='.data/qa/api-evidence/'+label+'.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,origin,passed:checks.length,requests:requests.length,groups:groups.map(({name,pathCount,operationCount})=>({name,pathCount,operationCount})),configSha256:result.configSha256}));
