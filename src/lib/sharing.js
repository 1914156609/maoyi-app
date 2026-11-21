import { api, authState } from './client.js';
import { uid } from './store.js';
import { withCalculation } from './knitting.mjs';
const KEY='maoyi-local-share-previews';
export async function createShare(craft){
 if(!authState.review){
  const token=authState.token;
  const result=await api('/shares',{method:'POST',data:{craftId:craft.id}});
  if(authState.token!==token)throw new Error('登录账号已变化');
  return result;
 }
 const code='REVIEW'+uid().replaceAll('-','').toUpperCase(),shares=uni.getStorageSync(KEY)||{},expiresAt=Date.now()+7*86400000;
 shares[code]={craft:JSON.parse(JSON.stringify(craft)),expiresAt};uni.setStorageSync(KEY,shares);
 let base='';
 // #ifdef H5
 base=window.location.origin+window.location.pathname;
 // #endif
 return {code,url:base+'#/pages/shared/shared?code='+code,expiresAt};
}
export async function readShare(code){
 if(authState.review&&code?.startsWith('REVIEW')){const item=(uni.getStorageSync(KEY)||{})[code];return item&&item.expiresAt>Date.now()?withCalculation(item.craft):null;}
 if(!code)return null;
 try{return withCalculation((await api('/shares/'+encodeURIComponent(code),{anonymous:true})).craft);}catch(e){if(e.status===404)return null;throw e;}
}
