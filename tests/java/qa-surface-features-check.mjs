// Isolated harness checks. Does not bind 5193/5196, mutate a real browser, or claim UI acceptance.
import http from 'node:http';import assert from'node:assert/strict';import vm from'node:vm';import fs from'node:fs';import{createHash}from'node:crypto';
import{initialSurfaceFeatures,featureCommand,setSurfaceFeature,clipboardPolicyHeaders,serveCacheFixture,cacheFixturePage,cacheFixtureScript,CACHE_FIXTURE,CACHE_FIXTURE_BYTES,CACHE_FIXTURE_WIRE_BYTES,CACHE_FIXTURE_SHA256,CACHE_FIXTURE_PATH}from'./qa-surface-features.mjs';
import{readPreviewCacheSize,clearPreviewCache}from'../../src/lib/preview-cache.mjs';
const checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true});};
const release='qa-20261121-r21',features=initialSurfaceFeatures();
check('Both new preconditions default off',()=>assert.deepEqual(features,{clipboardDeny:false,previewCacheFixture:false}));
check('Explicit clipboard on command',()=>assert.deepEqual(featureCommand('clipboard-deny','on'),{action:'feature',feature:'clipboardDeny',enabled:true}));
check('Explicit cache off command',()=>assert.deepEqual(featureCommand('preview-cache-fixture','off'),{action:'feature',feature:'previewCacheFixture',enabled:false}));
for(const bad of [undefined,'yes','true','1','ON'])check('No implied feature enabling '+String(bad),()=>assert.throws(()=>featureCommand('clipboard-deny',bad)));
check('Existing CLI commands remain separate',()=>assert.equal(featureCommand('failOnce','/api/crafts'),null));
check('Control rejects unknown feature',()=>assert.throws(()=>setSurfaceFeature(features,{feature:'auth',enabled:true})));
check('Control rejects nonboolean value',()=>assert.throws(()=>setSurfaceFeature(features,{feature:'clipboardDeny',enabled:'false'})));
const originalHeaders={'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'",'permissions-policy':'camera=(), clipboard-write=(self), microphone=()','content-length':'29','cache-control':'max-age=300'};
check('Disabled policy leaves exact header object unchanged',()=>assert.equal(clipboardPolicyHeaders('admin',originalHeaders,features),originalHeaders));
setSurfaceFeature(features,{feature:'clipboardDeny',enabled:true});
check('Policy denies clipboard and preserves other directives',()=>assert.equal(clipboardPolicyHeaders('admin',originalHeaders,features)['permissions-policy'],'camera=(), microphone=(), clipboard-write=()'));
check('Original CSP and length remain unchanged',()=>{const h=clipboardPolicyHeaders('admin',originalHeaders,features);assert.equal(h['content-security-policy'],originalHeaders['content-security-policy']);assert.equal(h['content-length'],'29');assert.equal(h['cache-control'],'no-store');assert.equal(originalHeaders['permissions-policy'],'camera=(), clipboard-write=(self), microphone=()');});
check('H5 response never receives clipboard denial',()=>assert.equal(clipboardPolicyHeaders('h5',originalHeaders,features),originalHeaders));
check('JSON response never receives clipboard denial',()=>{const h={'content-type':'application/json'};assert.equal(clipboardPolicyHeaders('admin',h,features),h)});
check('JS response never receives clipboard denial',()=>{const h={'content-type':'text/javascript'};assert.equal(clipboardPolicyHeaders('admin',h,features),h)});
check('Fixed logical fixture exactly24KiB',()=>assert.equal(CACHE_FIXTURE_BYTES,24576));
check('Uni object wire exactly24601bytes',()=>assert.equal(CACHE_FIXTURE_WIRE_BYTES,24601));
check('Fixture matches independently supplied SHA',()=>assert.equal(CACHE_FIXTURE_SHA256,'7e42e958795e4b5e0f19ad18ac4ab10e4ebfab8fd4892adc4ce5a556b89b58d7'));
check('Fixture release cannot inject HTML',()=>assert.throws(()=>cacheFixturePage('qa-<script>')));
const page=cacheFixturePage(release),script=cacheFixtureScript();
check('Fixture CSP only permits exact inline script hash',()=>assert.ok(page.headers['Content-Security-Policy'].includes("script-src 'sha256-"+createHash('sha256').update(script).digest('base64')+"'")));
check('Fixture targets original same-origin settings route',()=>assert.ok(page.body.includes('href="/#/pages/settings/settings"')));
check('Fixture visibly disclaims product acceptance',()=>assert.ok(page.body.includes('这不是产品页面，不计入产品验收通过')));

// Exercise the actual exported HTTP handler on an ephemeral loopback port, never the shared proxy.
const originalHtml=Buffer.from('<!doctype html><title>unchanged original bundle</title><script src="/fixed.js"></script>');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),surface=u.searchParams.get('surface')||'h5';
 if(serveCacheFixture(req,res,{surface,pathname:u.pathname,features,release}))return;
 res.writeHead(200,clipboardPolicyHeaders(surface,{'content-type':'text/html;charset=utf-8','content-length':String(originalHtml.length)},features));res.end(originalHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
try{
 let r=await fetch(origin+CACHE_FIXTURE_PATH);check('Disabled QA page returns404 (not SPA fallback)',()=>assert.equal(r.status,404));
 setSurfaceFeature(features,{feature:'previewCacheFixture',enabled:true});
 r=await fetch(origin+CACHE_FIXTURE_PATH+'?surface=admin');check('Enabled fixture inaccessible on admin surface',()=>assert.equal(r.status,404));
 r=await fetch(origin+CACHE_FIXTURE_PATH,{method:'POST'});check('QA page refuses POST',()=>assert.equal(r.status,405));
 r=await fetch(origin+CACHE_FIXTURE_PATH,{method:'HEAD'});const headText=await r.text();check('HEAD gate enabled with no body',()=>{assert.equal(r.status,200);assert.equal(r.headers.get('x-qa-fixture-enabled'),'1');assert.equal(headText,'');});
 r=await fetch(origin+CACHE_FIXTURE_PATH);const actualPage=await r.text();check('Enabled GET sends exact fixtureHTML no-store',()=>{assert.equal(r.status,200);assert.equal(actualPage,page.body);assert.equal(r.headers.get('cache-control'),'no-store');});
 r=await fetch(origin+'/tool/build?surface=admin');const bodyOn=Buffer.from(await r.arrayBuffer());check('Actual HTTP originalHTML body unchanged under policy',()=>{assert.deepEqual(bodyOn,originalHtml);assert.equal(r.headers.get('permissions-policy'),'clipboard-write=()');});
 setSurfaceFeature(features,{feature:'clipboardDeny',enabled:false});
 r=await fetch(origin+'/tool/build?surface=admin');const bodyOff=Buffer.from(await r.arrayBuffer());check('Turningoff restores original header/body after new request',()=>{assert.deepEqual(bodyOff,originalHtml);assert.equal(r.headers.get('permissions-policy'),null);});
 setSurfaceFeature(features,{feature:'previewCacheFixture',enabled:false});
 r=await fetch(origin+CACHE_FIXTURE_PATH,{method:'HEAD'});check('Turningoff immediately closes HEAD write gate',()=>assert.equal(r.status,404));
}finally{await new Promise(resolve=>server.close(resolve));}

// Execute fixture script in a storage/element test double. This is not a real-page/browser result.
function fixtureContext(values={},gateEnabled=true){
 const data=new Map(Object.entries(values)),reads=[],writes=[],requests=[];let handler;
 const status={textContent:''},button={disabled:false,addEventListener(name,fn){assert.equal(name,'click');handler=fn}};
 const localStorage={getItem(k){reads.push(k);return data.get(k)??null},setItem(k,v){writes.push(k);data.set(k,v)}};
 const context={TextEncoder,document:{getElementById(id){return id==='status'?status:button}},localStorage,fetch:async(path,options)=>{requests.push({path,options});return{ok:gateEnabled,headers:{get:n=>n==='x-qa-fixture-enabled'&&gateEnabled?'1':null}}}};
 vm.runInNewContext(script,context);
 return{data,reads,writes,requests,status,button,click:()=>handler()};
}
const preserved={'maoyi-auth':'opaque-test-session','maoyi-notifications':'false','maoyi-prefill':'unsaved-test-form','maoyi-recent-103':'["sample"]'};
const fixture=fixtureContext(preserved);
check('GET/loading QA fixture causes zero storage writes',()=>assert.equal(fixture.writes.length,0));
await fixture.click();
check('Only actual fixturebutton writes sole fixed key',()=>assert.deepEqual(fixture.writes,['maoyi-preview-cache']));
check('Fixture never reads unrelated keys',()=>assert.ok(fixture.reads.every(k=>k==='maoyi-preview-cache')));
check('Auth/prefs/preload/recent values preserved',()=>Object.entries(preserved).forEach(([k,v])=>assert.equal(fixture.data.get(k),v)));
check('Write checks explicitenabled HEAD with omittedcredentials',()=>assert.deepEqual(fixture.requests.map(r=>({path:r.path,method:r.options.method,credentials:r.options.credentials})),[{path:CACHE_FIXTURE_PATH,method:'HEAD',credentials:'omit'}]));
const wire=fixture.data.get('maoyi-preview-cache');
check('Actual fixed payload/wrapper exact',()=>assert.deepEqual(JSON.parse(wire),{type:'object',data:CACHE_FIXTURE}));
const uniSource=fs.readFileSync('node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js','utf8');
const parseSource=uniSource.slice(uniSource.indexOf('function parseValue(value, isUTS) {'),uniSource.indexOf('const setStorageSync =',uniSource.indexOf('function parseValue(value, isUTS) {')));
const codec=vm.runInNewContext(parseSource+';parseValue',{isString:v=>typeof v==='string'});const decoded=codec(wire);
check('Installed uni objectcodec decodes payload and original settings counts24KB',()=>assert.equal(readPreviewCacheSize({getStorageSync:()=>decoded}),24));
check('Fixturebutton displays actual byte lengths',()=>{assert.match(fixture.status.textContent,/24576 bytes/);assert.match(fixture.status.textContent,/24601 bytes/);});
const storage={getStorageSync:k=>fixture.data.has(k)?codec(fixture.data.get(k)):'',removeStorageSync:k=>fixture.data.delete(k)};
check('Original clear helper removes fixture and leaves auth/preferences untouched',()=>{assert.equal(clearPreviewCache(storage),0);assert.equal(fixture.data.has('maoyi-preview-cache'),false);Object.entries(preserved).forEach(([k,v])=>assert.equal(fixture.data.get(k),v));});
const closed=fixtureContext(preserved,false);await closed.click();check('Loaded page cannot write after CLI off',()=>{assert.equal(closed.writes.length,0);assert.match(closed.status.textContent,/已关闭/);});
const nonQa=fixtureContext({'maoyi-preview-cache':'original-user-cache'});await nonQa.click();check('Existing nonQA cache never overwritten',()=>{assert.equal(nonQa.writes.length,0);assert.equal(nonQa.data.get('maoyi-preview-cache'),'original-user-cache');});
const repeated=fixtureContext({'maoyi-preview-cache':wire});await repeated.click();check('Same fixed QA fixture preparation is deterministic',()=>assert.equal(repeated.data.get('maoyi-preview-cache'),wire));
const files=['tests/java/qa-fault-proxy.mjs','tests/java/qa-surface-features.mjs','tests/java/qa-surface-features-check.mjs'];
const evidence={release,at:new Date().toISOString(),kind:'Isolated QA harness HTTP/codec/script checks; no product real-page/clipboard failure assertion',passed:checks.length,failed:0,checks,sourceSha256:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),fixture:{payloadBytes:CACHE_FIXTURE_BYTES,wireBytes:CACHE_FIXTURE_WIRE_BYTES,sha256:CACHE_FIXTURE_SHA256},sharedProxyRestarted:false,realBrowserExecuted:false,productBundleModified:false,remaining:'Root must enable on restarted isolated proxy, reload actual admin document, observe genuine clipboard failure then off+reload retry; preparecache by real QA-page click then validate original settings UI.'};
const out='.data/qa/api-evidence/r21-surface-features-harness-check.json';fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({out,passed:checks.length,failed:0,sourceSha256:evidence.sourceSha256}));
