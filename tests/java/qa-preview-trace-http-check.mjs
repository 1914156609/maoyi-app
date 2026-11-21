import http from'node:http';import assert from'node:assert/strict';import fs from'node:fs';import{createQaApiTrace}from'./qa-preview-trace.mjs';
const secret='SYNTHETIC_SECRET_NEVER_ARCHIVED',id='GY-20261118-AA8EF67F1F0C43C7',events=[],checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true})};
const bodies={
 '/api/auth/login':JSON.stringify({token:secret,user:{id:'103',roleCode:'employee',name:secret},code:200}),
 ['/api/crafts/'+id+'/submit']:JSON.stringify({craft:{id,status:'pending',version:3,sizes:{secret},parts:[secret]}}),
 ['/api/shares/'+secret]:JSON.stringify({code:secret,url:secret,craft:{id,status:'draft',version:2}}),
 '/prod-api/captchaImage':JSON.stringify({img:secret.repeat(9000),uuid:secret}),
 '/prod-api/system/user/profile':JSON.stringify({code:200,data:{userName:secret,phonenumber:secret,email:secret}})
};let forwardedRequestBodies=0;
const upstream=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;if(body.includes(secret))forwardedRequestBodies++;res.writeHead(200,{'content-type':'application/json','set-cookie':'fake_cookie='+secret});res.end(bodies[req.url]);});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const proxy=http.createServer((req,res)=>{const trace=createQaApiTrace({enabled:true,release:'qa-20261118-r18',app:req.url.startsWith('/prod-api/')?'admin':'h5',method:req.method,path:req.url,write:e=>events.push(e)});const p=http.request({host:'127.0.0.1',port:upstream.address().port,path:req.url,method:req.method,headers:req.headers},r=>{trace?.observe(r);res.writeHead(r.statusCode,r.headers);r.pipe(res);});req.pipe(p);});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
try{
 for(const [path,body]of Object.entries(bodies)){const response=await fetch('http://127.0.0.1:'+proxy.address().port+path,{method:'POST',headers:{Authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({password:secret,token:secret})});check('Unmodified response body '+path.replace(secret,'[redacted]'),()=>assert.equal(response.status,200));const returnedBody=await response.text();check('Byte-equivalent response '+path.replace(secret,'[redacted]'),()=>assert.equal(Buffer.from(returnedBody).compare(Buffer.from(body)),0));}
 check('Request body forwarded unchanged, never logged',()=>assert.equal(forwardedRequestBodies,5));
 check('Exactly5 request and5 response trace events',()=>assert.equal(events.length,10));
 check('No request/response credential, cookie, captcha, share code or identity text persisted',()=>assert.ok(!JSON.stringify(events).includes(secret)));
 check('Craft submission metadata retained',()=>assert.ok(events.some(e=>e.craftId===id&&e.version===3&&e.status==='pending')));
 check('Captcha oversized body never projected',()=>assert.ok(events.some(e=>e.route==='/captchaImage'&&e.projectionSkipped==='captcha')));
}finally{await new Promise(r=>proxy.close(r));await new Promise(r=>upstream.close(r));}
const file='.data/qa/api-evidence/r18-preview-trace-tests.json',data=JSON.parse(fs.readFileSync(file));data.httpForwarding={at:new Date().toISOString(),kind:'5 real local HTTP flows using ephemeral isolated ports, synthetic data only; not shared runtime or UI',checks,passed:checks.length,failed:0,sharedRuntimeUntouched:true};fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');console.log({file,httpScenarios:5,checks:checks.length,passed:checks.length});
