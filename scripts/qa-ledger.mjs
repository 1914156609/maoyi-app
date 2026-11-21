import fs from 'node:fs';
const target='docs/qa/ledger.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const command=process.argv[2]||'stats';
if(command==='init'){
 if(fs.existsSync(target))throw new Error('唯一台账已存在，不覆盖');
 const cases=['user','admin','api'].flatMap(n=>{const d=read(`.data/qa/${n}-cases.json`);return Array.isArray(d)?d:d.cases;}).map(c=>({...c,owner:c.owner||'api_data',runtimeVersion:c.runtimeVersion||null,prerequisites:c.prerequisites||c.preconditions||[],apiPersistenceExpected:c.apiPersistenceExpected||c.persistenceExpected,evidence:c.evidence||[]}));
 const core=[['C001','视频样例针行守恒与同步引返'],['C002','参数等价类、边界、非法值与几何约束'],['C003','输入变化真实改变轮廓与标注，图表一致'],['C004','套头/开衫/背心及圆领/V领/袖型计算'],['C005','新旧胸围口径与分享快照一致'],['C006','H5、微信预览、后台、Java完整构建'],['C007','微信开发者工具及真实设备'],['C008','真实微信登录和公网跨设备分享'],['C009','最终固定版本全量回归与数据清理']].map(([id,title])=>({id,title,owner:'root',chain:'计算与最终验收',role:'开发验收',platform:'按具体证据分别标注',queue:'前置未就绪',result:'未执行',runtimeVersion:null,prerequisites:['视频计算及绘图联动实现完成'],actions:[title],functionalExpected:['符合视频算例与规范数据契约'],visualExpected:['涉及真实页面的用例必须核对实际截图'],apiPersistenceExpected:['图、明细、保存、重进、导出及分享一致'],evidenceRequired:['运行版本','计算断言或真实截图','必要的数据回读'],evidence:[],cleanup:'仅清理本批独立测试数据'}));
 fs.mkdirSync('docs/qa',{recursive:true});fs.writeFileSync(target,JSON.stringify({schemaVersion:1,objective:'视频逻辑计算绘图联动及完整端到端验证',queueValues:['前置未就绪','就绪','执行中','待修复','待复测','通过','外部阻断'],resultValues:['真实页面通过','仅自动化通过','失败待修','外部阻断','未执行'],runtimeVersions:[],requirements:[{id:'R-CALC',description:'款式/尺寸/密度生成真实工艺图及标注',cases:core.slice(0,5).map(c=>c.id)},{id:'R-PAGES',description:'全部15用户端路由及注册操作',cases:cases.filter(c=>c.owner==='user_journeys').map(c=>c.id)},{id:'R-ADMIN',description:'后台业务链及所有可访问菜单',cases:cases.filter(c=>c.owner==='admin_journeys').map(c=>c.id)},{id:'R-API',description:'登录、权限、跨主体、并发、持久化与异常',cases:cases.filter(c=>c.owner==='api_data').map(c=>c.id)},{id:'R-RELEASE',description:'全部构建、固定包回归及真实渠道阻断',cases:core.slice(5).map(c=>c.id)}],defects:[],cases:[...core,...cases]},null,2)+'\n');
}
if(command==='apply'){
 const ledger=read(target),patch=read(process.argv[3]);
 for(const change of patch.cases||patch.results||[]){const c=ledger.cases.find(c=>c.id===change.id);if(!c)throw new Error('Unknown case '+change.id);Object.assign(c,change);}
 for(const d of patch.defects||[]){const old=ledger.defects.find(x=>x.id===d.id);if(old)Object.assign(old,d);else ledger.defects.push(d);}
 if(patch.runtimeVersion){
  const versionKey=v=>typeof v==='string'?v:v.id||v.version;
  const key=versionKey(patch.runtimeVersion);
  if(!ledger.runtimeVersions.some(v=>versionKey(v)===key))ledger.runtimeVersions.push(patch.runtimeVersion);
 }
 for(const c of ledger.cases){if(!ledger.queueValues.includes(c.queue)||!ledger.resultValues.includes(c.result))throw Error('Invalid state '+c.id);if(c.result==='真实页面通过'&&!c.evidence.length)throw Error('Missing real evidence '+c.id);}
 fs.writeFileSync(target,JSON.stringify(ledger,null,2)+'\n');
}
const ledger=read(target),counts={},actionCounts={},supportingCounts={};
for(const c of ledger.cases){
 counts[c.result]=(counts[c.result]||0)+1;
 for(const step of c.checkpoints||[]){
  const result=step.result||'未执行';
  const bucket=step.kind==='supportingVerification'?supportingCounts:actionCounts;
  bucket[result]=(bucket[result]||0)+1;
 }
}
console.log(JSON.stringify({cases:ledger.cases.length,results:counts,recordedActions:Object.values(actionCounts).reduce((a,b)=>a+b,0),actionResults:actionCounts,supportingChecks:Object.values(supportingCounts).reduce((a,b)=>a+b,0),supportingResults:supportingCounts,defects:ledger.defects.length},null,2));
