// Archive an exact completed candidate attempt, then refresh only two QA tokens
// against the still-running R29 service. No candidate requests or business writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,renameSync,readdirSync,statSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const directory=resolve('.data/qa/current-review/round30/http-contract');
const attempt=Number(process.env.QA_OSS_ARCHIVE_ATTEMPT||5);
if(!Number.isSafeInteger(attempt)||attempt<5||attempt>99)throw Error('Invalid previous candidate attempt');
const archive=resolve(directory,'attempt'+attempt);
const stateFile=resolve('.secrets/qa-r30-oss-http-contract.json');
const stateArchive=resolve('.secrets/qa-r30-oss-http-contract-attempt'+attempt+'.json');
const resume=process.argv.includes('--resume-refresh');
const state=JSON.parse(readFileSync(stateFile));
const candidate=JSON.parse(readFileSync(resolve(resume?archive:directory,'candidate.json')));
const review=JSON.parse(readFileSync(resolve(directory,'review.json')));
const expectedSha=process.env.QA_OSS_PREVIOUS_SHA||(attempt===5?'0c58b80c1e0d55c6eb730b77c7eb1d1f0cdd72d54f45915f428cc6f1d5b9a0c2':'');
if(!/^[a-f0-9]{64}$/.test(expectedSha)||candidate.provenance.jarSha256!==expectedSha||review.releaseReady!==false)throw Error('Unexpected previous candidate evidence');
if(!resume&&(!state.phases.candidate?.cleaned||Object.entries(candidate.cleanup).some(([key,value])=>key.startsWith('remaining')&&value!==0)||candidate.cleanup.avatarRestored!==true))throw Error('Finish exact previous-candidate cleanup before preparation');
if(!resume&&(existsSync(resolve(archive,'archive-manifest.json'))||existsSync(stateArchive)))throw Error('Preparation already started; do not repeat QA logins automatically');
if(resume&&(!existsSync(stateArchive)||!state.refresh||state.refresh.complete))throw Error('No partial refresh to resume');
if(!resume){
mkdirSync(archive,{recursive:true});
copyFileSync(stateFile,stateArchive);chmodSync(stateArchive,0o600);
const sources=readdirSync(directory).filter(name=>name.startsWith('candidate')||['comparison.json','all-pairs-review.json','post-candidate-cleanup-readback.json','review.md','review.json'].includes(name));
const manifest=[];
for(const name of sources){const from=resolve(directory,name);if(!statSync(from).isFile())continue;const to=resolve(archive,name);if(existsSync(to))throw Error('Archive target exists');copyFileSync(from,to);manifest.push({name,sha256:createHash('sha256').update(readFileSync(to)).digest('hex')});if(!name.startsWith('review.'))renameSync(from,to);}
for(const name of ['http-contract-candidate-command.json','http-contract-candidate-stderr.txt']){const from=resolve(directory,'..',name);if(existsSync(from)){const to=resolve(archive,name);renameSync(from,to);manifest.push({name,sha256:createHash('sha256').update(readFileSync(to)).digest('hex')});}}
writeFileSync(resolve(archive,'archive-manifest.json'),JSON.stringify({candidateAttempt:attempt,jarSha256:expectedSha,reviewConclusion:review.verdict,releaseReady:review.releaseReady,files:manifest,privateStateArchivedMode:'600'},null,2)+'\n');
state.candidateHistory||=[];state.candidateHistory.push(state.phases.candidate);delete state.phases.candidate;
state.oldTokens={};
state.refresh={sourceRelease:'qa-20261121-r29',sourceOrigin:'http://127.0.0.1:8081',startedAt:new Date().toISOString(),reason:`Candidate${attempt} checks ended with exact owned token logout; these are new tokens from the original still-running R29 stack, not the previously revoked tokens.`,complete:false};
const save=()=>{writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});chmodSync(stateFile,0o600);};save();
}
const save=()=>{writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});chmodSync(stateFile,0o600);};
const accounts=JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts;
const baseline=JSON.parse(readFileSync(resolve(directory,'baseline.json')));
const observations=state.refresh.observations||Object.entries(state.oldTokens).map(([lane,saved])=>({lane,userId:saved.userId,httpStatus:200,tokenType:'string',userIdType:'string',issuedAt:saved.createdAt,kind:'successful first-stage login proved by guard before private atomic save; Content-Type was not retained in the interrupted prepare run'}));
for(const lane of ['systemAdmin','api']){
 if(state.oldTokens[lane])continue;
 const account=accounts[lane];if(account.id!==(lane==='systemAdmin'?114:106))throw Error('Unexpected QA account');
 const response=await fetch('http://127.0.0.1:8081/api/auth/login',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({type:'employee',account:account.account,password:account.password})});
 const data=await response.json();
 if(response.status!==200||typeof data.token!=='string'||data.user?.id!==String(account.id)){
  state.refresh.lastFailure={lane,httpStatus:response.status,applicationCode:typeof data.code==='number'?data.code:null,at:new Date().toISOString()};save();
  writeFileSync(resolve(directory,'token-refresh-failure.json'),JSON.stringify({kind:'safe refresh failure metadata only',...state.refresh.lastFailure},null,2)+'\n');
  throw Error('R29 QA token refresh failed; no automatic retry');
 }
 state.oldTokens[lane]={token:data.token,sourceOrigin:'http://127.0.0.1:8081',sourceRelease:'qa-20261121-r29',sourceJarSha256:baseline.provenance.jarSha256,userId:account.id,createdAt:new Date().toISOString()};save();
 observations.push({lane,userId:account.id,httpStatus:response.status,contentType:response.headers.get('content-type'),userIdType:typeof data.user.id,expiresAtType:typeof data.expiresAt,tokenType:typeof data.token,issuedAt:state.oldTokens[lane].createdAt});
 state.refresh.observations=observations;save();
}
state.refresh.complete=true;state.refresh.completedAt=new Date().toISOString();save();
const result={kind:'only two real R29 QA login requests; no candidate request and no business data write',...state.refresh,sourceJarSha256:baseline.provenance.jarSha256,observations,previousTokensWereRevoked:true,oldTokensReplacedNotReused:true,privateStateMode:(statSync(stateFile).mode&0o777).toString(8),privateArchiveMode:(statSync(stateArchive).mode&0o777).toString(8),candidatePhaseOwnershipCleared:true,baselineComplete:state.baselineComplete,previousCandidateArchive:`attempt${attempt}/archive-manifest.json`};
writeFileSync(resolve(directory,`r29-token-refresh-for-candidate${attempt+1}.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({prepared:true,loginRequests:2,userIds:[114,106],privateMode:result.privateStateMode,archive:result.previousCandidateArchive,candidateRequests:0}));
