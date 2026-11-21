// Assemble a single import patch for the root-owned action ledger from captured HTTP/SQL evidence.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const prefix='.data/qa/api-evidence/',g=JSON.parse(readFileSync(prefix+'http-gaps.json')),i=JSON.parse(readFileSync(prefix+'http-integration.json'));
const b=JSON.parse(readFileSync(prefix+'bounds-contract.json'));
if(g.release!==i.release||g.release!==b.release)throw Error('Evidence release mismatch');
if(g.requests.length!==171||i.requests.length!==49||b.requests.length!==68)throw Error('Evidence shape changed; update explicit action ranges before publishing');
const suffix=g.release.split('-').at(-1),testFile=prefix+suffix+'-test-results.tap',cleanupFile=prefix+suffix+'-api-cleanup.json';
const tap=readFileSync(testFile,'utf8');if(!/pass 28\b/.test(tap)||!/fail 0\b/.test(tap))throw Error('Do not mark failing suite passed');
const sources={gaps:g,integration:i,bounds:b};
const sourceFiles={gaps:prefix+'http-gaps-'+g.release+'.json',integration:prefix+'http-integration-'+g.release+'.json',bounds:prefix+'bounds-contract-'+g.release+'.json'};
const spans={
 'API-001':[['gaps',0,0],['gaps',4,8]],'API-002':[['integration',1,8]],'API-003':[['gaps',9,12],['integration',3,3]],'API-004':[['gaps',151,164]],
 'API-005':[['integration',41,43]],'API-006':[['integration',44,44]],'API-007':[['integration',9,13],['gaps',139,139]],'API-008':[['gaps',13,29]],'API-009':[['gaps',30,52]],'API-010':[['gaps',53,58]],
 'API-011':[['gaps',59,65]],'API-012':[['gaps',66,75]],'API-013':[['gaps',76,79]],'API-014':[['gaps',80,95],['integration',17,18]],'API-015':[['gaps',80,95]],
 'API-016':[['integration',14,24]],'API-017':[['integration',25,29]],'API-018':[['gaps',96,114]],'API-019':[['gaps',115,120],['integration',30,34]],'API-020':[['integration',35,40],['gaps',147,148]],
 'API-021':[['gaps',121,126]],'API-022':[['gaps',121,126]],'API-023':[['gaps',127,131],['gaps',64,64]],'API-024':[['gaps',132,137]],'API-025':[['gaps',115,120],['gaps',138,144]],'API-026':[['gaps',145,150]],'API-027':[['gaps',138,144]]
};
for(const ranges of Object.values(spans))for(const span of ranges){if(span[0]==='gaps'){if(span[1]>=53)span[1]+=2;if(span[2]>=53)span[2]+=2;}}
spans['API-009'][0][2]=54;spans['API-009'].push(['bounds',1,66]);
const ids=[...g.cleanup.craftIds,...i.cleanup.craftIds,...b.cleanup.ids],quoted=ids.map(id=>{if(!/^GY-\d{8}-[A-F0-9]{16}$/.test(id))throw Error('Invalid tracked id');return "'"+id+"'"}).join(',');
const chartQuoted=g.cleanup.chartIds.map(id=>{if(!/^qa-chart-[a-f0-9-]{36}$/.test(id))throw Error('Invalid tracked chart id');return "'"+id+"'"}).join(',');
const query=`SELECT 'craft',COUNT(*) FROM maoyi_craft WHERE id IN (${quoted}) UNION ALL SELECT 'audit',COUNT(*) FROM maoyi_audit WHERE craft_id IN (${quoted}) UNION ALL SELECT 'share',COUNT(*) FROM maoyi_share WHERE craft_id IN (${quoted}) UNION ALL SELECT 'chart',COUNT(*) FROM maoyi_chart WHERE craft_id IN (${quoted}) UNION ALL SELECT 'standaloneChart',COUNT(*) FROM maoyi_chart WHERE id IN (${chartQuoted});`;
const readback=execFileSync('mysql',['--protocol=socket','-uroot','maoyi_ruoyi','-N'],{input:query,encoding:'utf8'}).trim();
const cleanup={release:g.release,at:new Date().toISOString(),scope:'仅本批API临时对象，保留页面测试账号和对象',craftIds:ids,chartIds:g.cleanup.chartIds,query,rows:readback.split('\n').map(x=>{const [table,count]=x.split('\t');return {table,count:Number(count)}})};
if(cleanup.rows.some(x=>x.count!==0))throw Error('Tracked API records remain');
writeFileSync(cleanupFile,JSON.stringify(cleanup,null,2)+'\n');
const cases=JSON.parse(readFileSync('.data/qa/api-cases.json'));
function relatedIds(requests){
 const found=new Set();for(const request of requests){for(const id of ids)if(JSON.stringify(request).includes(id))found.add(id);for(const id of g.cleanup.chartIds)if(JSON.stringify(request).includes(id))found.add(id)}return [...found];
}
const results=cases.map(c=>{
 const ranges=spans[c.id],requests=ranges.flatMap(([key,start,end])=>sources[key].requests.slice(start,end+1));
 const objectIds=relatedIds(requests),db=[];
 for(const [key,source]of Object.entries(sources))source.database.forEach((record,index)=>{if(objectIds.some(id=>record.query.includes(id))||['API-003','API-006'].includes(c.id)&&record.query.startsWith('SELECT COUNT(*) FROM sys_user'))db.push({file:sourceFiles[key],jsonPointer:'/database/'+index})});
 return {id:c.id,release:g.release,queue:'通过',result:'仅自动化通过',evidenceType:'真实HTTP请求与MySQL回读；不是页面或真机测试',actualPage:null,screenshots:[],objectIds,accountLane:'api（106）/peer（107）/admin（105）；停用108、限流109、撤权110各专用',
 evidence:[{file:testFile},...ranges.map(([key,start,end])=>({file:sourceFiles[key],requestArrayIndexes:[start,end]})),...db,{file:cleanupFile}],
 actualSummary:c.id==='API-009'?'已按统一契约验证全部21尺寸0～500cm、密度/行密>0且≤1000；两种胸围口径一致，超界创建/修改无SQL副作用，空草稿允许。':c.functionalExpected.join('；'),visualResult:'未执行：API用例不计入真实页面通过',cleanup:{status:'已清理临时API对象；共享QA账号保留供真实页面使用',evidence:cleanupFile,method:'test.after按跟踪ID删除相关分享/审计/图纸/工艺，恢复临时停用/权限，撤销本次登录令牌'},
 limitations:c.id==='API-006'?['验证未配置微信时明确503及没有伪造用户；真实微信登录仍需AppID/AppSecret和上线环境。']:c.id==='API-025'?['本用例只验证规范输入和不可变快照；图形、公式与实际页面联动由用户端用例验收。']:[]};
});
const patchFile='.data/qa/api-result-patch.json',previous=existsSync(patchFile)?JSON.parse(readFileSync(patchFile)):{};
writeFileSync(patchFile,JSON.stringify({...previous,release:g.release,origin:g.origin,at:new Date().toISOString(),summary:{requirementCases:27,automatedTests:28,passed:28,failed:0,skipped:0,actualHttpRequests:g.requests.length+i.requests.length+b.requests.length,realPagePasses:0},results},null,2)+'\n');
console.log(`Prepared 27-case ${g.release} ledger patch; 288 HTTP responses, all 28 tests passed, temporary objects verified removed.`);
