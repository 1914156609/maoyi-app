// Loopback QA-only preconditions. No original bundle, clipboard API, or product DOM is rewritten.
import {createHash} from 'node:crypto';
export const CACHE_FIXTURE_PATH='/__qa/preview-cache-fixture';
export const CACHE_FIXTURE_KEY='maoyi-preview-cache';
export const CACHE_FIXTURE=Object.freeze({kind:'maoyi-qa-preview-cache-v1',text:'毛衣🧶'.repeat(2048),padding:'x'.repeat(4037)});
export const CACHE_FIXTURE_BYTES=Buffer.byteLength(JSON.stringify(CACHE_FIXTURE),'utf8');
export const CACHE_FIXTURE_WIRE_BYTES=Buffer.byteLength(JSON.stringify({type:'object',data:CACHE_FIXTURE}),'utf8');
export const CACHE_FIXTURE_SHA256=createHash('sha256').update(JSON.stringify(CACHE_FIXTURE)).digest('hex');
export function initialSurfaceFeatures(){return {clipboardDeny:false,previewCacheFixture:false};}
export function featureCommand(name,value){
 const feature={'clipboard-deny':'clipboardDeny','preview-cache-fixture':'previewCacheFixture'}[name];
 if(!feature)return null;
 if(!['on','off'].includes(value))throw Error('Use '+name+' on|off');
 return {action:'feature',feature,enabled:value==='on'};
}
export function setSurfaceFeature(features,body){
 if(!['clipboardDeny','previewCacheFixture'].includes(body.feature)||typeof body.enabled!=='boolean')throw Error('Invalid QA surface feature');
 features[body.feature]=body.enabled;
 return {...features};
}
export function clipboardPolicyHeaders(surface,headers,features){
 if(surface!=='admin'||!features.clipboardDeny||!/^text\/html(?:\s*;|\s*$)/i.test(String(headers['content-type']||'')))return headers;
 const policy=String(headers['permissions-policy']||'').split(',').map(x=>x.trim()).filter(x=>x&&!/^clipboard-write\s*=/i.test(x));
 policy.push('clipboard-write=()');
 return {...headers,'permissions-policy':policy.join(', '),'cache-control':'no-store','x-qa-clipboard-deny':'1'};
}
export function cacheFixtureScript(){return `(() => {
  'use strict';
  const key='maoyi-preview-cache';
  const fixture={kind:'maoyi-qa-preview-cache-v1',text:'毛衣🧶'.repeat(2048),padding:'x'.repeat(4037)};
  const text=JSON.stringify(fixture),wire=JSON.stringify({type:'object',data:fixture});
  const bytes=value=>new TextEncoder().encode(value).length;
  const status=document.getElementById('status'),button=document.getElementById('prepare');
  const existing=()=>{const raw=localStorage.getItem(key);if(!raw)return {raw:'',data:null};try{const parsed=JSON.parse(raw);return {raw,data:parsed?.type==='object'?parsed.data:parsed};}catch{return {raw,data:null};}};
  function showCurrent(){try{const old=existing();status.textContent=old.raw===wire?'当前：本页固定 QA 缓存已准备，逻辑 '+bytes(text)+' bytes（24KB），存储 '+bytes(wire)+' bytes。':old.raw?'当前：已有其他预览缓存，本页不会覆盖。':'当前：没有预览缓存。只有点击下方按钮才会写入。';}catch{status.textContent='无法读取本地缓存，请检查浏览器存储权限。';}}
  button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;
    try{
      const gate=await fetch('/__qa/preview-cache-fixture',{method:'HEAD',cache:'no-store',credentials:'omit'});
      if(!gate.ok||gate.headers.get('x-qa-fixture-enabled')!=='1')throw Error('QA 前置页已关闭，未写入。');
      const old=existing();
      if(old.raw&&old.raw!==wire)throw Error('已有其他预览缓存，未覆盖；请先由原页面处理。');
      localStorage.setItem(key,wire);
      if(localStorage.getItem(key)!==wire)throw Error('缓存回读不一致。');
      status.textContent='准备成功：QA-R21-cache-positive；逻辑 '+bytes(text)+' bytes（24KB），存储 '+bytes(wire)+' bytes。现在可进入原版设置页验证。';
    }catch(error){status.textContent=error?.message||'准备失败，未跳转。';}
    finally{button.disabled=false;}
  });
  showCurrent();
})();`;}
export function cacheFixturePage(release){
 if(!/^qa-[a-zA-Z0-9-]+$/.test(release))throw Error('Invalid fixture release');
 const script=cacheFixtureScript(),scriptHash=createHash('sha256').update(script).digest('base64');
 const body=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA 缓存测试前置</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:24px auto;padding:0 20px;max-width:620px;background:#f5f5f5;color:#161616}h1{font-size:24px}p,output{overflow-wrap:anywhere}output{display:block;padding:16px;background:white;border:1px solid #bbb;border-radius:8px}button,a{display:block;box-sizing:border-box;width:100%;margin-top:20px;padding:12px 16px;border-radius:6px;font:inherit;text-align:center}button{border:1px solid #222;background:#222;color:white;cursor:pointer}button:disabled{opacity:.6}a{background:white;color:#174995;border:1px solid #174995;text-decoration:none}</style></head><body><h1>QA 缓存测试前置</h1><p>这不是产品页面，不计入产品验收通过。固定版本：${release}。</p><p>仅准备固定无敏感测试对象 QA-R21-cache-positive，仅写入 <code>maoyi-preview-cache</code>。不会读取或修改登录、偏好、草稿或其他存储键。</p><p>预期原版设置页显示：<strong>24KB</strong>。逻辑数据 ${CACHE_FIXTURE_BYTES} bytes，uni 对象包装后 ${CACHE_FIXTURE_WIRE_BYTES} bytes。</p><output id="status" role="status" aria-live="polite"></output><button id="prepare" type="button">准备固定 24KB QA 缓存</button><a href="/#/pages/settings/settings">进入原版设置页</a><p>测试应在同一个浏览器来源下完成。关闭前置页不会自动清除数据；由原版设置页执行清理并验证身份。</p><script>${script}</script></body></html>`;
 return {body,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-QA-Fixture-Enabled':'1','X-QA-Release':release,'Content-Security-Policy':`default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`}};
}
export function serveCacheFixture(req,res,{surface,pathname,features,release}){
 if(pathname!==CACHE_FIXTURE_PATH)return false;
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-QA-Release':release};
 if(surface!=='h5'||!features.previewCacheFixture){res.writeHead(404,headers);res.end(req.method==='HEAD'?undefined:JSON.stringify({message:'QA cache fixture disabled'}));return true;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end(JSON.stringify({message:'Read-only QA fixture route'}));return true;}
 const page=cacheFixturePage(release);res.writeHead(200,page.headers);res.end(req.method==='HEAD'?undefined:page.body);return true;
}
