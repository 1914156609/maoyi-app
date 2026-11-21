import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';

// Only run-java.mjs uses this local overlay. Deployment defaults remain disabled.
export function prepareLocalAdminTools({configFile=resolve('.secrets/java-local-tools.yml')}={}) {
 mkdirSync('.secrets',{recursive:true,mode:0o700});
 const secretFile=resolve('.secrets/java-local-tools.json');
 const credentials=existsSync(secretFile)?JSON.parse(readFileSync(secretFile,'utf8')):{druid:{username:'local_monitor',password:randomBytes(24).toString('base64url')}};
 if(!credentials.druid?.username||typeof credentials.druid.password!=='string'||credentials.druid.password.length<24)throw Error('本机Druid监控凭据缺失或过短');
 writeFileSync(secretFile,JSON.stringify(credentials,null,2)+'\n',{mode:0o600});
 const groups=[
  {group:'maoyi','display-name':'毛衣业务','packages-to-scan':['com.ruoyi.maoyi']},
  {group:'system','display-name':'系统管理与登录','packages-to-scan':['com.ruoyi.web.controller.system','com.ruoyi.web.controller.common']},
  {group:'monitor','display-name':'系统监控与任务','packages-to-scan':['com.ruoyi.web.controller.monitor','com.ruoyi.quartz.controller']},
  {group:'tool','display-name':'代码生成','packages-to-scan':['com.ruoyi.generator.controller']},
  {group:'demo','display-name':'官方演示接口','packages-to-scan':['com.ruoyi.web.controller.tool']}
 ].map(group=>({...group,'paths-to-match':['/**']}));
 // Druid's allow-list parser accepts IPv4; this overlay also binds IPv4 loopback only.
 const config={server:{address:'127.0.0.1'},spring:{datasource:{druid:{statViewServlet:{enabled:true,allow:'127.0.0.1','url-pattern':'/druid/*','login-username':credentials.druid.username,'login-password':credentials.druid.password,'reset-enable':false}}}},springdoc:{'api-docs':{enabled:true},'group-configs':groups,'swagger-ui':{enabled:true,'config-url':'/prod-api/v3/api-docs/swagger-config','urls-primary-name':'毛衣业务',urls:groups.map(group=>({name:group['display-name'],url:'/prod-api/v3/api-docs/'+group.group})),'supported-submit-methods':[],'validator-url':'','query-config-enabled':false}}};
 writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
 return {configFile,secretFile};
}
