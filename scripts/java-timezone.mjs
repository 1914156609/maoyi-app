import {execFileSync} from 'node:child_process';

// DATETIME has no offset. Match JDBC and JVM to the actual database session,
// rather than interpreting every developer machine as Asia/Shanghai.
export function offsetSeconds(zone, at=new Date()) {
 if(/^[+-]\d\d:\d\d$/.test(zone)){const [h,m]=zone.slice(1).split(':').map(Number);return (zone[0]==='-'?-1:1)*(h*3600+m*60)}
 const value=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(at).find(p=>p.type==='timeZoneName').value;
 if(value==='GMT')return 0;
 const match=value.match(/^GMT([+-])(\d\d):(\d\d)$/);if(!match)throw Error('无法识别数据库时区偏移');
 return (match[1]==='-'?-1:1)*(Number(match[2])*3600+Number(match[3])*60);
}
export function selectDatabaseTimeZone({sessionZone,offset,localHost,hostZone,explicitZone,at=new Date()}) {
 const chosen=explicitZone||(sessionZone==='SYSTEM'?(localHost?hostZone:null):sessionZone);
 if(!chosen)throw Error('远程 MySQL 使用 SYSTEM 时区，请配置 DB_TIME_ZONE 为数据库实际 IANA 时区；不能猜测远程宿主时区');
 if(offsetSeconds(chosen,at)!==Number(offset))throw Error('DB_TIME_ZONE 与 MySQL 会话实际时区不一致；请核对配置，不修改历史日期');
 return chosen;
}
export function withDatabaseTimeZone(jdbc,zone){
 const url=new URL(jdbc.replace(/^jdbc:/,''));url.searchParams.delete('connectionTimeZone');url.searchParams.set('serverTimezone',zone);return 'jdbc:'+url.toString();
}
export function javaTimeZone(zone){return /^[+-]/.test(zone)?'GMT'+zone:zone}
export function detectDatabaseTimeZone(env={}){
 const jdbc=env.DB_URL||'jdbc:mysql://127.0.0.1:3306/maoyi_ruoyi',url=new URL(jdbc.replace(/^jdbc:/,''));
 if(url.protocol!=='mysql:')throw Error('数据库时区检查仅支持 MySQL');
 const localHost=['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname);
 const args=env.DB_USER?['--protocol=TCP','-h',url.hostname,'-P',url.port||'3306','-u',env.DB_USER]:['--protocol=socket','-uroot'];
 const output=execFileSync('mysql',[...args,'-N','--raw'],{input:'SELECT @@session.time_zone, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW());',encoding:'utf8',env:{...process.env,...(env.DB_PASSWORD?{MYSQL_PWD:env.DB_PASSWORD}:{})},stdio:['pipe','pipe','pipe']}).trim();
 const [sessionZone,offset]=output.split('\t');
 return selectDatabaseTimeZone({sessionZone,offset,localHost,hostZone:Intl.DateTimeFormat().resolvedOptions().timeZone,explicitZone:env.DB_TIME_ZONE});
}
