// QA transport helper: preserve a real successful upstream response, delay only delivery.
export function pipeDelayed200(upstream, downstream, {delayMs, record, context, maxBytes=1024*1024}) {
 if(upstream.statusCode!==200){
  record({...context,event:'delay-bypassed',status:upstream.statusCode,reason:'upstream-not-200'});
  downstream.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(downstream);return;
 }
 let settled=false,timer,chunks=[],bytes=0;
 const started=Date.now();
 const cancel=()=>{
  if(settled)return;settled=true;clearTimeout(timer);chunks=[];upstream.destroy();
  record({...context,event:'delayed-cancelled',status:200,elapsedMs:Date.now()-started});
 };
 const fail=reason=>{
  if(settled)return;settled=true;clearTimeout(timer);chunks=[];upstream.destroy();
  record({...context,event:'delay-harness-error',reason});
  if(!downstream.destroyed){downstream.writeHead(502,{'Content-Type':'application/json;charset=utf-8'});downstream.end(JSON.stringify({code:502,msg:'测试代理延迟响应失败'}));}
 };
 downstream.once('close',()=>{if(!downstream.writableEnded)cancel();});
 if(downstream.destroyed){cancel();return;}
 record({...context,event:'delayed-upstream',status:200,delayMs});
 upstream.on('data',chunk=>{if(settled)return;bytes+=chunk.length;if(bytes>maxBytes){fail('response-body-limit');return;}chunks.push(chunk);});
 upstream.once('error',()=>fail('upstream-response-error'));
 upstream.once('aborted',()=>fail('upstream-response-aborted'));
 upstream.once('end',()=>{
  if(settled)return;
  const body=Buffer.concat(chunks);chunks=[];
  timer=setTimeout(()=>{
   if(settled||downstream.destroyed){cancel();return;}
   settled=true;downstream.writeHead(200,upstream.headers);downstream.end(body);
   record({...context,event:'delayed-sent',status:200,bytes:body.length,delayMs,elapsedMs:Date.now()-started});
  },delayMs);
 });
}
