// Evidence indexing only: does not call HTTP, SQL, Redis, or alter the formal root ledger.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const release='qa-20261121-r21',previous='qa-20261118-r20';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const out='.data/qa/api-result-patch.json',original=read(out);
const archive='.data/qa/api-evidence/r20-api-patch-preserved-before-r21.json';
if(!fs.existsSync(archive))fs.writeFileSync(archive,JSON.stringify(original,null,2)+'\n');
const p=read(archive),cases=read('.data/qa/api-cases.json');
const types={g:'http-gaps-',i:'http-integration-',b:'bounds-contract-'};
const suites={},idMap=new Map();
const normalize=s=>s.replace(/GY-\d{8}-[A-F0-9]{16}/g,'[craft]').replace(/qa-chart-[a-f0-9-]+/g,'[chart]').replace(/[a-f0-9]{64}/g,'[hash]').replace(/QA上界合同-\d+/g,'[batch]');
for(const[k,prefix]of Object.entries(types)){
  const old=read('.data/qa/api-evidence/'+prefix+previous+'.json'),fresh=read('.data/qa/api-evidence/'+prefix+release+'.json');
  assert.equal(old.requests.length,fresh.requests.length);
  old.requests.forEach((r,i)=>assert.equal(r.method+' '+normalize(r.path),fresh.requests[i].method+' '+normalize(fresh.requests[i].path)));
  assert.equal(old.database.length,fresh.database.length);
  old.database.forEach((r,i)=>assert.equal(normalize(r.query),normalize(fresh.database[i].query)));
  for(const key of['craftIds','ids','chartIds']){const a=old.cleanup[key]||[],b=fresh.cleanup[key]||[];assert.equal(a.length,b.length);a.forEach((id,i)=>idMap.set(id,b[i]));}
  suites[k]={file:'.data/qa/api-evidence/'+prefix+release+'.json',...fresh};
}
suites.s={file:'.data/qa/api-evidence/r21-rate-limit-other-login.json',...read('.data/qa/api-evidence/r21-rate-limit-other-login.json')};
suites.t={file:'.data/qa/api-evidence/r21-canonical-own-detail.json',...read('.data/qa/api-evidence/r21-canonical-own-detail.json')};
const replacements=[...idMap.entries(),[previous,release],['r20-resume-20261121-java-tests.tap','r21-java-tests.tap'],['r20-resume-20261121-api-cleanup.json','r21-api-cleanup.json']];
const replace=value=>Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):typeof value==='string'?replacements.reduce((s,[a,b])=>s.split(a).join(b),value):value;
p.results=p.results.map(replace);
const sourceTests={};
for(const file of['tests/java/gaps.test.mjs','tests/java/integration.test.mjs','tests/java/bounds.test.mjs']){
  const source=fs.readFileSync(file,'utf8');sourceTests[file]=[...source.matchAll(/test\('([^']+)'/g)].map(m=>({file,line:source.slice(0,m.index).split('\n').length,testName:m[1]}));
}
const g=n=>sourceTests['tests/java/gaps.test.mjs'].filter(t=>t.testName.startsWith('API-'+String(n).padStart(3,'0')));
const i=n=>[sourceTests['tests/java/integration.test.mjs'][n]];
const testMap={1:g(1),2:i(0),3:[...g(3),...i(0)],4:g(4),5:i(5),6:i(6),7:[...i(1),...g(25)],8:g(8),9:[...g(9),...sourceTests['tests/java/bounds.test.mjs']],10:g(10),11:g(11),12:g(12),13:g(13),14:[...g(14),...i(2)],15:g(14),16:i(2),17:i(3),18:g(18),19:[...g(19),...i(4)],20:[...i(4),...g(26)],21:g(21),22:g(21),23:[...g(23),...g(11)],24:g(24),25:[...g(25),...g(19)],26:g(26),27:g(25)};
// Each entry maps one unchanged source-case action, in its original order.
const actionMap={
  1:['g:0','g:4-8'],2:['i:2,6','g:166','i:7-8'],3:['g:9-12 i:3','gd:0-1'],
  4:['g:153-165 s:0-12','s:13-15 scleanup'],5:['i:41','id:3','i:42-43','id:4 retention'],6:['i:44','id:5-6'],
  7:['g:141 i:9 t:1','td:0 t:2'],8:['g:13-22 laneempty','g:23-29 laneempty'],
  9:['g:30-40,51-54 b:1-66','g:41-50 b:1-66','g:51-54 b:1-66'],10:['g:55-58','g:59-60'],
  11:['g:62-66','g:67'],12:['g:74-76','g:77','g:74-76'],13:['g:79','g:79-80','g:81'],
  14:['i:17','g:83','g:85,88-92'],15:['g:86-87,93,97 i:18','g:94 gd:2'],
  16:['i:14-15,19-23 id:0-1','i:16,24'],17:['i:27-28','i:29'],
  18:['g:112-115 gd:3','g:98-111,116','g:113,115-116 gd:3'],
  19:['i:31-32 g:118,121','i:33-34 g:119-122','i:32'],20:['i:36','i:37-38','id:2 i:39-40','g:149-150'],
  21:['g:125-126,128','g:127 gd:4'],22:['g:123,125','g:124,126','g:126-127 gd:4'],
  23:['g:131','g:66','g:132-133'],24:['g:136','gd:5','g:137-139','gd:6 retention'],
  25:['g:117,141','g:121-122,143 gd:7','g:141 gd:7','g:118-122'],
  26:['g:147-150','g:152','g:151 laneempty'],27:['g:142 gd:8','g:143 gd:9-10','g:144-146 gd:11-13']
};
const extraFiles={retention:'.data/qa/api-evidence/r21-suite-retention.json',laneempty:'.data/qa/api-evidence/r21-api-lane-final-empty.json',scleanup:'.data/qa/api-evidence/r21-rate-limit-other-login.json'};
function refs(spec){return spec.split(' ').flatMap(part=>{
  if(extraFiles[part])return[{file:extraFiles[part],jsonPointer:part==='scleanup'?'/cleanup':part==='laneempty'?'/result':'/checks'}];
  const[marker,list]=part.split(':'),db=marker.endsWith('d'),suite=suites[marker[0]],collection=db?'database':'requests';assert.ok(suite);
  return list.split(',').flatMap(range=>{const[a,b=a]=range.split('-').map(Number);return Array.from({length:b-a+1},(_,j)=>{const index=a+j,entry=suite[collection][index];assert.ok(entry);return{file:suite.file,jsonPointer:'/'+collection+'/'+index,...(db?{kind:/^SELECT/i.test(entry.query)?'SQL readback':'SQL controlled fixture transition/cleanup',query:entry.query}:{kind:'Actual HTTP',method:entry.method,path:entry.path,httpStatus:entry.httpStatus,applicationStatus:entry.status})};});});
});}
let checkpoints=0;
for(const c of cases){
  const n=Number(c.id.slice(4)),r=p.results.find(x=>x.id===c.id);assert.equal(actionMap[n].length,c.actions.length);assert.ok(testMap[n]?.length);
  r.checkpoints=c.actions.map((action,j)=>({id:c.id+'-A'+String(j+1).padStart(2,'0'),caseId:c.id,release,role:c.role,preconditions:c.prerequisites,objectIds:r.objectIds,action,originalFunctionalExpected:c.functionalExpected,visualExpected:c.visualExpected,apiPersistenceExpected:c.persistenceExpected,result:'仅自动化通过',queue:'通过',testNames:testMap[n],evidence:[...refs(actionMap[n][j]),{file:'.data/qa/api-evidence/r21-java-tests.tap',testNames:testMap[n].map(t=>t.testName)}],cleanup:r.cleanup,scope:'只验证当前接口/持久化动作；无页面操作或视觉通过声明。'}));
  checkpoints+=r.checkpoints.length;
  if(n===4){r.checkpoints[1].testNames.push({file:'.data/qa/api-evidence/r21-rate-limit-other-login.json',testName:'API-004 限流期间其他账号新登录不受影响'});r.evidence.push({file:suites.s.file});}
  if(n===7){r.objectIds.push(suites.t.cleanup.craftId);r.evidence.push({file:suites.t.file});r.checkpoints[1].testNames.push({file:suites.t.file,testName:suites.t.testName});r.cleanup.supplementalEvidence=suites.t.file;r.cleanup.supplementalObjectRemaining=0;}
  if(n===19)r.checkpoints[2].headerEvidence='Cache-Control:no-store、ownerId/history不存在由 integration 精确测试中的实HTTP断言验证；原请求JSON未保存响应header，因此不伪称有独立header抓包。';
  if(n===25)r.checkpoints.forEach(cp=>cp.calculationScope='API仅持久化规范输入，拒绝客户端派生parts。实际公式和图形联动继承用户端C005/U016等真实页面证据，不冒充API作图。');
}
p.release=release;p.at=new Date().toISOString();p.currentFrontendRelease=release;p.runtimeEvidence='.data/qa/api-evidence/r21-runtime-readback.json';p.jarSha256='ba39a78c04377d5b68efa8b21d427c9a3b9d73e2436103109b6cb5a459719bc5';
p.summary={requirementCases:27,stableActionCheckpoints:checkpoints,automatedTests:32,businessTests:28,harnessTests:4,passed:32,failed:0,skipped:0,actualHttpRequests:308,fullSuiteHttpRequests:288,supplementalHttpRequests:20,supplementalAssertions:5,realPagePasses:0};
p.inheritance={previousFullSuiteRelease:previous,currentRuntime:release,scope:'New getInfo Controller: complete32-test suite rerun288HTTP; two exact action gaps add20HTTP/5checks: API004 fresh-login isolation and API007 independent own-detailGET after canonicalcreate. Original case actions/expectations preserved.',evidence:['.data/qa/api-evidence/r21-java-tests.tap','.data/qa/api-evidence/r21-suite-retention.json',suites.s.file,suites.t.file]};
const retained=read('.data/qa/api-evidence/r21-suite-retention.json');
p.retention={accounts:12,uiCrafts:24,shares:17,uiCharts:1,systemFixtureGroups:retained.after.systemFixtureGroups,currentlyPresentTrackedSystemRows:retained.after.system.filter(x=>x.present).length,readbackEvidence:'.data/qa/api-evidence/r21-suite-retention.json',preexistingSessionsRetained:6,cloneRetained:true,cloneServicesStopped:true,cloneEvidence:'.data/qa/api-evidence/r20-resume-20261121-clone-final-cache-readback.json',systemDeletionEvidence:'.data/qa/api-evidence/r19-authorized-system-cleanup-complete.json',subsequentUiDeletions:['.data/qa/api-evidence/r20-resume-20261121-config102-deleted.json','.data/qa/api-evidence/r21-role217-ui-deleted.json'],currentRole217:'Logical deletiondel_flag2; menus/users/depts0;107/113 original211 restored',temporaryIncompleteUiDraft:'.data/qa/api-evidence/r21-incomplete-export-draft-cleanup.json',reason:'No broad cleanup; original customer/system accounts and retained UI business data preserved.'};
p.cleanup.currentBatchEvidence='.data/qa/api-evidence/r21-api-cleanup.json';p.cleanup.remainingApiCrafts=0;p.cleanup.finalReadonlyEvidence='.data/qa/api-evidence/r21-suite-retention.json';p.cleanup.latestRealUiCleanupEvidence='.data/qa/api-evidence/r21-role217-ui-deleted.json';
p.supplementalPermissionMatrix.inheritance='R1 matrix remains historical (21HTTP/27assertions); currentR21 fullsuite revalidates business denial/revocation, getInfo grant/revoke now additionally verified by actualrootUI+compiled100assertions. Historical matrix is not mislabelled newly executed.';
p.backendInheritanceEligibility={sourceTestRelease:release,requiredJarSha256:p.jarSha256,scope:'27API requirement cases,32test suite,308totalHTTP. Future inheritance valid only with exactsameJar/config; actualUI results remain separate.'};
p.currentRuntimeConfiguration.javaPid=8530;p.currentRuntimeConfiguration.runtimeEvidence=p.runtimeEvidence;p.currentRuntimeConfiguration.javaInheritedFrom=null;
p.finalCoreTestBuildChecklist.fixedRelease=release;p.finalCoreTestBuildChecklist.at=p.at;
for(const item of p.finalCoreTestBuildChecklist.items){if(item.command.includes('npm run test:java'))Object.assign(item,{command:'MAOYI_TEST_ORIGIN=http://127.0.0.1:8081 QA_RELEASE_ID='+release+' npm run test:java -- --test-concurrency=1',lastExecutedRelease:release,result:'32/32 passed;288HTTP;34temporarycrafts+2charts removed;all11 retentionchecks passed',evidence:'.data/qa/api-evidence/r21-java-tests.tap',scope:'Independent API lanes only; no UI fixture bootstrap or global session cleanup',executedAt:p.at});if(item.command==='npm run build:java')Object.assign(item,{lastExecutedRelease:release,result:'Maven package exit0, default-DskipTests explicitly documented',evidence:'.data/qa/api-evidence/r21-java-candidate.json',jarSha256:p.jarSha256});}
p.finalCoreTestBuildChecklist.duplicationPolicy='R21 newController justified one fullJava regression; action audit identified API004fresh-login and API007independent-own-GET proof gaps, closed with targeted20HTTP. Other product builds belong to root delivery checklist and are not relabelled by API agent.';
p.additionalLiveChecks.getInfoFreshRoles={compiledChecks:100,profileRegressionChecks:32,actualUiEvidence:'.data/qa/api-evidence/r21-role217-actual-ui-retest.json',defectPatch:'.data/qa/api-r21-defects-patch.json'};
p.additionalLiveChecks.rateLimitOtherFreshLogin={file:suites.s.file,checks:3,requests:16,result:'passed'};
p.additionalLiveChecks.canonicalOwnDetail={file:suites.t.file,checks:2,requests:4,result:'passed'};
p.checkpointAudit={at:p.at,sourceRequirements:'.data/qa/api-cases.json',sourceRequirementsModified:false,sourceActionCount:cases.reduce((n,c)=>n+c.actions.length,0),stableCheckpointCount:checkpoints,requestAndSqlIndexMigrationVerified:true,requestEvidenceSemantics:'JSON pointers are exact individual indexes; previous requestArrayIndexes pairs remain inclusive ranges at case level.',cleanupSqlIsNotReadback:'Each checkpoint labels SQL SELECT separately from fixture mutations and cleanup DELETE; cleanup is not presented as pre-cleanup persistence proof.',resolvedGaps:['API004 existing-session200 was insufficient for fresh-login expectation; targeted new-login proof supplied.','API007 original maliciouscreate response+SQL lacked independentownGET; targetedGET+SQL supplied.'],unexecutedApiActions:[],pageVisualResult:'Not applicable to API-only checkpoints; no new real-page passes.'};
assert.equal(checkpoints,p.checkpointAudit.sourceActionCount);
fs.writeFileSync(out,JSON.stringify(p,null,2)+'\n');
console.log(JSON.stringify({cases:p.results.length,checkpoints,fullSuiteTests:32,httpRequests:p.summary.actualHttpRequests,realPagePasses:0}));
