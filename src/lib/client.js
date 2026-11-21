import { reactive } from 'vue';
export const reviewEnabled = __MAOYI_REVIEW__;
const KEY='maoyi-auth-v3';
let saved={},savedReview='';try{saved=uni.getStorageSync(KEY)||{};if(reviewEnabled)savedReview=uni.getStorageSync('maoyi-review-mode');}catch{}
export const authState=reactive({user:saved.expiresAt>Date.now()?saved.user:null,token:saved.expiresAt>Date.now()?saved.token:'',expiresAt:saved.expiresAt||0,review:reviewEnabled&&savedReview==='customer'});
export const apiBase=import.meta.env.VITE_API_BASE_URL||'/api';
export function setAuth(value){
 Object.assign(authState,value,{review:false});
 try{
  uni.setStorageSync(KEY,{user:authState.user,token:authState.token,expiresAt:authState.expiresAt});
  uni.removeStorageSync('maoyi-review-mode');return true;
 }catch{return false;}
}
export function clearAuth(){
 Object.assign(authState,{user:null,token:'',expiresAt:0,review:false});
 let cleared=true;
 for(const key of [KEY,'maoyi-review-mode']){
  try{uni.removeStorageSync(key);}catch{cleared=false;}
 }
 uni.$emit('maoyi-signed-out');
 return cleared;
}
export async function api(path,{method='GET',data,anonymous=false}={}){
 const token=authState.token;
 let r;
 try{r=await uni.request({url:apiBase.replace(/\/$/,'')+path,method,data,timeout:15000,header:{'Content-Type':'application/json',...(!anonymous&&token?{Authorization:'Bearer '+token}:{})}});}catch{throw new Error('网络连接失败，请稍后重试');}
 const status=typeof r.data?.code==='number'&&r.data.code>=400?r.data.code:r.statusCode;
 if(status<200||status>=300){
  if(status===401&&!anonymous&&authState.token===token)clearAuth();
  const message=status===401&&!anonymous?(token?'登录已失效，请重新登录':'请先登录后重试'):(r.data?.message||r.data?.msg||'服务暂时不可用');
  const e=new Error(message);e.status=status;throw e;
 }
 return r.data;
}
