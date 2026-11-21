import { reactive } from 'vue';
import { withCalculation } from './knitting.mjs';
import { authState, api, reviewEnabled } from './client.js';
const KEY='maoyi-guniang-source-v2';
const initial=()=>({version:2,crafts:[],details:{},charts:[],recentIds:[],reviewFixtureVersion:0,settings:{unit:'cm'},recycle:[]});
export const store=reactive(initial());
export function clearData(){Object.assign(store,initial());}
uni.$on('maoyi-signed-out',clearData);
export function loadReviewData(){if(!reviewEnabled)return;try{const saved=uni.getStorageSync(KEY);if(saved?.version===2)Object.assign(store,saved,{details:{}});}catch{}}
if(authState.review)loadReviewData();
const recentKey=()=> 'maoyi-recent-'+(authState.user?.id||'review');
const readRecentIds=()=>{const saved=uni.getStorageSync(recentKey());return Array.isArray(saved)?[...new Set(saved.filter(id=>typeof id==='string'&&id.trim()))].slice(0,5):[];};
export function persist(){try{if(authState.review)uni.setStorageSync(KEY,JSON.parse(JSON.stringify(store)));uni.setStorageSync(recentKey(),store.recentIds);return true;}catch{notify('存储空间不足，未保存成功');return false;}}
export function uid(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
export function applyCraft(c){c=withCalculation(c);store.details[c.id]=c;const i=store.crafts.findIndex(x=>x.id===c.id);if(i>=0)store.crafts.splice(i,1,c);else if(authState.review||c.ownerId===authState.user?.id)store.crafts.unshift(c);return c;}
let inFlight=null;
export async function refreshCrafts(){
 if(authState.review||!authState.token)return;
 const token=authState.token;
 if(inFlight?.token===token)return inFlight.promise;
 const promise=(async()=>{
  const crafts=new Map();
  let pageNum=1,total;
  while(true){
   const data=await api('/crafts?pageNum='+pageNum+'&pageSize=500');
   if(authState.token!==token)return;
   if(!Array.isArray(data.crafts))throw new Error('工艺列表加载不完整，请重试');
   if(Number.isSafeInteger(data.total)&&data.total>=0){
    if(total!==undefined&&data.total!==total)throw new Error('工艺列表已更新，请重试');
    total=data.total;
   }
   const previous=crafts.size;
   for(const craft of data.crafts)if(!crafts.has(craft.id))crafts.set(craft.id,craft);
   if(!data.hasMore)break;
   if(crafts.size===previous||(total!==undefined&&crafts.size>=total))throw new Error('工艺列表加载不完整，请重试');
   pageNum++;
  }
  if(total!==undefined&&crafts.size!==total)throw new Error('工艺列表已更新，请重试');
  store.crafts=[...crafts.values()].map(withCalculation);
  try{store.recentIds=readRecentIds();}
  catch{store.recentIds=[];notify('最近浏览记录读取失败，请稍后重试');}
 })();
 inFlight={token,promise};try{await promise;}finally{if(inFlight?.promise===promise)inFlight=null;}
}
export async function fetchCraft(id){if(authState.review)return store.crafts.find(c=>c.id===id);const token=authState.token;const {craft}=await api('/crafts/'+encodeURIComponent(id));if(token!==authState.token)throw new Error('登录账号已变化');return applyCraft(craft);}
export async function saveCraft(data,id){
 data=Object.fromEntries(['name','style','neck','sleeve','length','density','rowDensity','sizes','version','measurementBasis','calculationVersion'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
 if(!authState.review){
  const token=authState.token;
  const {craft}=await api('/crafts'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',data});
  if(authState.token!==token)throw new Error('登录账号已变化');
  return applyCraft(craft);
 }
 const old=store.crafts.find(c=>c.id===id),now=new Date().toISOString();
 const craft={...JSON.parse(JSON.stringify(data)),id:old?.id||uid(),status:'draft',code:old?.code||'GY-'+now.slice(0,10).replaceAll('-','')+'-'+uid().slice(-8).toUpperCase(),owner:'我',createdAt:old?.createdAt||now,updatedAt:now,history:old?.history||[]};
 applyCraft(craft);persist();return craft;
}
export async function changeStatus(id,status,note=''){
 const c=store.details[id]||store.crafts.find(x=>x.id===id);if(!c)throw new Error('工艺单不存在');
 if(!authState.review){
  const token=authState.token;
  const action=status==='pending'?'submit':'review';
  const {craft}=await api('/crafts/'+encodeURIComponent(id)+'/'+action,{method:'POST',data:{version:c.version,decision:status,note}});
  if(authState.token!==token)throw new Error('登录账号已变化');
  applyCraft(craft);return true;
 }
 c.status=status;c.updatedAt=new Date().toISOString();c.history||=[];c.history.push({status,note,at:c.updatedAt});persist();return true;
}
let chartsInFlight=null;
export async function refreshCharts(){
 if(authState.review)return store.charts;
 if(!authState.token){store.charts=[];return store.charts;}
 const token=authState.token;
 if(chartsInFlight?.token===token)return chartsInFlight.promise;
 const promise=(async()=>{const {charts}=await api('/charts');if(authState.token!==token)throw new Error('登录账号已变化');store.charts=charts;return store.charts;})();
 chartsInFlight={token,promise};try{return await promise;}finally{if(chartsInFlight?.promise===promise)chartsInFlight=null;}
}
export async function saveChart(data){
 const existing=store.charts.find(c=>(c.craftId||null)===(data.craftId||null));
 const payload={...data,id:data.id||existing?.id||uid()};
 let chart;
 if(authState.review)chart={...payload,updatedAt:new Date().toISOString()};
 else {const token=authState.token;const response=await api('/charts',{method:'POST',data:payload});if(authState.token!==token)throw new Error('登录账号已变化');chart=response.chart;}
 const i=store.charts.findIndex(c=>c.id===chart.id);if(i>=0)store.charts.splice(i,1,chart);else store.charts.unshift(chart);
 if(authState.review)persist();return chart;
}
export function recordViewed(id){
 if(!store.crafts.some(c=>c.id===id)&&!store.details[id])return;
 let recent;try{recent=readRecentIds();}catch{notify('最近浏览记录读取失败，请稍后重试');return;}
 store.recentIds=[id,...recent.filter(x=>x!==id)].slice(0,5);persist();
}
export function notify(title){uni.showToast({title,icon:'none',duration:2500});}
export function navigate(name,query=''){uni.hideToast?.();uni.navigateTo({url:`/pages/${name}/${name}${query?'?'+query:''}`});}
