import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/store.js');
const deferred = () => { let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve}; };
const craft = i => ({id:'craft-'+i,ownerId:'103',name:'工艺'+i,sizes:{}});
async function fixture(respond) {
  const key=randomUUID(),calls=[];
  const context={authState:{user:{id:'103'},token:'old',review:false},reviewEnabled:false,
    api:async path=>{calls.push(path);return respond(calls.length,path);},
    uni:{$on(){},getStorageSync(){return [];},showToast(){}}};
  globalThis.__miniPaginationReview ||= {};globalThis.__miniPaginationReview[key]=context;
  let source=`const uni=globalThis.__miniPaginationReview[${JSON.stringify(key)}].uni;\n`+readFileSync(filename,'utf8');
  source=source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm,(line,binding,specifier)=>{
    if(specifier==='./client.js')return `const ${binding}=globalThis.__miniPaginationReview[${JSON.stringify(key)}];`;
    const target=specifier.startsWith('.')?pathToFileURL(resolve(dirname(filename),specifier)).href:import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  module.store.crafts=[craft('existing')];return {...module,context,calls};
}
test('501 owned crafts are loaded in two batches without silently hiding the final record',async()=>{
  const f=await fixture(page=>page===1?{crafts:Array.from({length:500},(_,i)=>craft(i)),total:501,hasMore:true}:{crafts:[craft(500)],total:501,hasMore:false});
  await f.refreshCrafts();
  assert.equal(f.store.crafts.length,501);assert.equal(f.store.crafts.at(-1).id,'craft-500');
  assert.deepEqual(f.calls,['/crafts?pageNum=1&pageSize=500','/crafts?pageNum=2&pageSize=500']);
});
test('the visible list is replaced only after the final page succeeds',async()=>{
  const gate=deferred();const f=await fixture(page=>page===1?{crafts:[craft(1)],total:2,hasMore:true}:gate.promise);
  const request=f.refreshCrafts();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.store.crafts[0].id,'craft-existing');
  gate.resolve({crafts:[craft(2)],total:2,hasMore:false});await request;
  assert.deepEqual(f.store.crafts.map(c=>c.id),['craft-1','craft-2']);
});
test('failure on a later page preserves the entire previous visible list for an explicit retry',async()=>{
  const f=await fixture(page=>{if(page===1)return {crafts:[craft(1)],total:2,hasMore:true};throw new Error('later-page-offline');});
  await assert.rejects(f.refreshCrafts(),/later-page-offline/);
  assert.deepEqual(f.store.crafts.map(c=>c.id),['craft-existing']);
});
test('switching accounts while a later page is pending cannot replace the current account list',async()=>{
  const gate=deferred();const f=await fixture(page=>page===1?{crafts:[craft(1)],total:2,hasMore:true}:gate.promise);
  const request=f.refreshCrafts();await new Promise(resolve=>setImmediate(resolve));
  f.context.authState.token='new';f.store.crafts=[craft('new-account')];
  gate.resolve({crafts:[craft(2)],total:2,hasMore:false});await request;
  assert.deepEqual(f.store.crafts.map(c=>c.id),['craft-new-account']);
});
test('reordered duplicate pages do not masquerade as a complete list',async()=>{
  const f=await fixture(page=>({crafts:[craft(1)],total:2,hasMore:page===1}));
  await assert.rejects(f.refreshCrafts(),/加载不完整|已更新/);
  assert.deepEqual(f.store.crafts.map(c=>c.id),['craft-existing']);
});
test('empty pages claiming more records terminate with a retryable error',async()=>{
  const f=await fixture(()=>({crafts:[],total:2,hasMore:true}));
  await assert.rejects(f.refreshCrafts(),/加载不完整/);assert.equal(f.calls.length,1);
});
test('a count change during pagination is detected before replacing the old list',async()=>{
  const f=await fixture(page=>({crafts:[craft(page)],total:page===1?2:3,hasMore:page===1}));
  await assert.rejects(f.refreshCrafts(),/已更新|加载不完整/);
  assert.deepEqual(f.store.crafts.map(c=>c.id),['craft-existing']);
});
test('legacy responses without pagination metadata still load once',async()=>{
  const f=await fixture(()=>({crafts:[craft(1)]}));await f.refreshCrafts();
  assert.equal(f.calls.length,1);assert.equal(f.store.crafts[0].id,'craft-1');
});
