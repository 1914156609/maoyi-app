import { handleApi } from './api.mjs';
export async function serve(request,env,assets={}){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(request.method==='OPTIONS'){
  if(origin&&origin!==(env.PUBLIC_ORIGIN||url.origin))return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||url.origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, OPTIONS','Vary':'Origin'}});
 }
 if(url.pathname.startsWith('/api/')){
  if(origin&&origin!==(env.PUBLIC_ORIGIN||url.origin)&&!env.LOCAL_DEV)return Response.json({message:'请求来源不受支持'},{status:403});
  const response=await handleApi(request,env);
  if(origin){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');}
  return response;
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const entry=assets[url.pathname==='/'?'/index.html':url.pathname];
 if(!entry)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(entry.body),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':entry.type,'Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}});
}
