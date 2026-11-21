import http from 'node:http';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeDelayed200} from './qa-delay-response.mjs';
import {isAllowedFaultRule,redactFaultPath} from './qa-fault-routing.mjs';

const events=[],checks=[],body='{"code":200,"value":"qa-only"}',path='/monitor/cache/getValue/sys_config:/sys_config:qa.fixture.7b073a';
const check=(name,fn)=>{fn();checks.push({name,passed:true})};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});
const upstream=http.createServer((req,res)=>{res.writeHead(req.url==='/error'?503:200,{'content-type':'application/json','x-fixture':'original'});res.end(req.url==='/large'?'x'.repeat(128):body)});
const upPort=await listen(upstream);
const proxy=http.createServer((req,res)=>{
 const id={'/ok':1,'/error':2,'/abort':3,'/large':4}[req.url];
 const request=http.get('http://127.0.0.1:'+upPort+req.url,response=>pipeDelayed200(response,res,{delayMs:1500,maxBytes:req.url==='/large'?32:1024,context:{ruleId:id,path,surface:'admin',method:'GET',mode:'delayOnce'},record:event=>events.push({...event,path:redactFaultPath(event.path)})}));
 request.on('error',()=>res.destroy());
});
const port=await listen(proxy);
try{
 const started=Date.now(),success=await fetch('http://127.0.0.1:'+port+'/ok'),text=await success.text(),elapsed=Date.now()-started;
 check('Real upstream200 delivered after at least1500ms holding period',()=>{assert.equal(success.status,200);assert.ok(elapsed>=1450)});
 check('Successful body bytes and headers preserved',()=>{assert.equal(text,body);assert.equal(success.headers.get('x-fixture'),'original')});
 check('Upstream200 and delivery recorded separately exactly once',()=>{assert.equal(events.filter(e=>e.ruleId===1&&e.event==='delayed-upstream').length,1);assert.equal(events.filter(e=>e.ruleId===1&&e.event==='delayed-sent').length,1)});
 const errorStart=Date.now(),error=await fetch('http://127.0.0.1:'+port+'/error');const errorBody=await error.text();
 check('Upstream503 is preserved without being converted into delayed200',()=>{assert.equal(error.status,503);assert.equal(errorBody,body);assert.ok(Date.now()-errorStart<1200);assert.ok(events.some(e=>e.ruleId===2&&e.event==='delay-bypassed'))});
 const controller=new AbortController(),cancelled=fetch('http://127.0.0.1:'+port+'/abort',{signal:controller.signal});setTimeout(()=>controller.abort(),75);
 await assert.rejects(cancelled,error=>error.name==='AbortError');await new Promise(resolve=>setTimeout(resolve,1600));
 check('Client cancellation clears delivery and records cancellation',()=>{assert.ok(events.some(e=>e.ruleId===3&&e.event==='delayed-cancelled'));assert.equal(events.filter(e=>e.ruleId===3&&e.event==='delayed-sent').length,0)});
 const large=await fetch('http://127.0.0.1:'+port+'/large');await large.text();
 check('Bounded buffer fails safely without logging upstream body',()=>{assert.equal(large.status,502);assert.ok(events.some(e=>e.ruleId===4&&e.reason==='response-body-limit'))});
 check('Logs exclude cache key and body values',()=>{const log=JSON.stringify(events);assert.ok(!log.includes('qa.fixture.7b073a'));assert.ok(!log.includes('qa-only'))});
 const rule={mode:'delayOnce',path,method:'GET',surface:'admin',value:1500};
 check('ExplicitGET delay rule and original failure modes remain allowed',()=>{assert.ok(isAllowedFaultRule(rule));assert.ok(isAllowedFaultRule({...rule,mode:'failOnce',value:500}));assert.ok(isAllowedFaultRule({...rule,mode:'timeoutOnce',value:1500}))});
 for(const [name,change] of Object.entries({writeMethod:{method:'POST'},wildcardMethod:{method:'*'},traversal:{path:'/monitor/cache/../value'},emptySegment:{path:'/monitor//cache'},nonNumericDelay:{value:'1500'},nan:{value:NaN},infinity:{value:Infinity},tooShort:{value:99},tooLong:{value:60001},otherFamily:{path:'/arbitrary/path'}}))check('Unsafe delay rule rejected: '+name,()=>assert.equal(isAllowedFaultRule({...rule,...change}),false));
 const sourcePaths=['tests/java/qa-fault-proxy.mjs','tests/java/qa-fault-routing.mjs','tests/java/qa-delay-response.mjs'];
 const result={harnessVersion:'delayOnce-v1',at:new Date().toISOString(),kind:'Independent local HTTP harness verification, not product/API/real-page test',checks,events,httpScenarios:4,successfulDelayObservedMs:elapsed,ports:'Only OS-assigned isolated loopback ports; shared5193/5196/Java/preview untouched',sourceHashes:Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),liveProxyReloaded:false,liveRuleArmed:false};
 const file='.data/qa/api-evidence/r15-harness-delay-tests.json';writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file,checks:checks.length,passed:checks.length,httpScenarios:4,delayMs:elapsed,sharedProcessesUntouched:true,sourceHashes:result.sourceHashes}));
}finally{await close(proxy);await close(upstream)}
