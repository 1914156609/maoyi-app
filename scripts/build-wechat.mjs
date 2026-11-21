import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
process.chdir(resolve(import.meta.dirname,'..'));
const id=process.env.WECHAT_APP_ID,api=process.env.VITE_API_BASE_URL;
if(!/^wx[a-z0-9]{16}$/i.test(id||''))throw Error('请设置你自己的 WECHAT_APP_ID');
if(!/^https:\/\/[^\s]+\/api\/?$/.test(api||''))throw Error('请设置 VITE_API_BASE_URL=https://你的域名/api');
const file='src/manifest.json',original=readFileSync(file,'utf8'),manifest=JSON.parse(original);
manifest['mp-weixin'].appid=id;
try{writeFileSync(file,JSON.stringify(manifest,null,2));const r=spawnSync('npm',['run','build:mp-weixin'],{env:process.env,stdio:'inherit'});if(r.status)process.exitCode=r.status;}
finally{writeFileSync(file,original);}
