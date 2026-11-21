import {chmodSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {hashBackendPasswords} from './backend-password-hasher.mjs';
process.chdir(resolve(import.meta.dirname,'..'));
const origin=process.argv[2];
if(!origin||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))throw Error('用法：node scripts/prepare-deploy.mjs https://你的小程序分享域名');
if(existsSync('.secrets/deploy.env'))throw Error('部署配置已存在，未覆盖。');
// Fifteen random bytes encode to 20 URL-safe characters, the login policy limit.
const password=randomBytes(15).toString('base64url');
const [hash]=hashBackendPasswords([password]);
mkdirSync('.secrets',{recursive:true,mode:0o700});
chmodSync('.secrets',0o700);
const env={DB_PASSWORD:randomBytes(24).toString('base64url'),MYSQL_ROOT_PASSWORD:randomBytes(32).toString('base64url'),JWT_SECRET:randomBytes(48).toString('base64url'),PUBLIC_ORIGIN:origin,WECHAT_APP_ID:'',WECHAT_APP_SECRET:''};
writeFileSync('.secrets/deploy.env',Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
// Docker's MySQL entrypoint reads this bind-mounted file as its mysql OS user.
// The parent directory remains private; this file contains only a BCrypt hash.
writeFileSync('.secrets/deploy-init.sql',`USE maoyi_ruoyi;\nUPDATE sys_user SET nick_name='管理员',password='${hash}',email='',phonenumber='' WHERE user_id=1;\nUPDATE sys_user SET status='1',password='' WHERE user_id=2;\n`,{mode:0o644});
chmodSync('.secrets/deploy-init.sql',0o644);
writeFileSync('.secrets/云端管理员账号.txt','账号：admin\n密码：'+password+'\n请部署后从用户管理创建员工和主管账号。\n',{mode:0o600});
console.log('部署配置与随机管理员凭证已生成于 .secrets/，未上传、未启动云服务器。');
