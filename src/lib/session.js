import { computed } from 'vue';
import { referenceCrafts } from './reference-data.js';
import { store, persist, clearData, loadReviewData, refreshCrafts, notify } from './store.js';
import { authState, api, apiBase, reviewEnabled, setAuth, clearAuth } from './client.js';
export { apiBase };
export const session=authState;
export const authenticated=computed(()=>Boolean(session.user&&session.token)||session.review);
export const currentUser=computed(()=>session.user||(__MAOYI_REVIEW__ && session.review?{id:'review',name:'微信用户2129',role:'顾客',roleCode:'customer',status:'正常'}:null));
export const canApprove=computed(()=>['admin','supervisor'].includes(currentUser.value?.roleCode));
export function setReviewMode(mode){
 if(!__MAOYI_REVIEW__)return;
 clearAuth();session.review=mode==='customer';uni.setStorageSync('maoyi-review-mode',mode);
 if(session.review){loadReviewData();if(store.reviewFixtureVersion<2){const fixtures=referenceCrafts();const ids=new Set(fixtures.map(c=>c.id));store.crafts=[...store.crafts.filter(c=>!ids.has(c.id)),...fixtures];store.recentIds=[fixtures[1].id,fixtures[0].id];store.reviewFixtureVersion=2;persist();}}
}
export async function signIn(credentials){
 const data=await api('/auth/login',{method:'POST',data:credentials,anonymous:true});
 clearData();
 const persisted=setAuth(data);
 await refreshCrafts();
 if(persisted===false)notify('登录成功，本地登录状态保存异常');
}
export async function restoreSession(){
 const token=session.token;
 if(!token)return;
 try{
  const data=await api('/auth/me');
  if(session.token!==token)return;
  session.user=data.user;
  await refreshCrafts();
 }catch(e){if(e.status!==401)throw e;}
}
export async function signOut(){
 const token=session.token;
 try{if(token)await api('/auth/logout',{method:'POST',data:{}});}
 finally{
  if(session.token===token){
   const cleared=clearAuth();clearData();
   if(cleared===false)notify('已退出当前会话，本地登录缓存清理失败');
  }
 }
}
