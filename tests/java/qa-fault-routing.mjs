// SPA paths can equal backend route suffixes. Only API-prefix traffic is injectable.
export function normalizeFaultPath(path) { return String(path).replace(/%3a/ig, ':'); }
export function isAllowedFaultPath(path) {
 return (/^\/(api|maoyi|system|monitor)\/[A-Za-z0-9/:_.-]+$/.test(path)
  || /^\/tool\/gen\/(list|db\/list)$/.test(path) || path === '/captchaImage')
  && !path.includes('..') && !path.includes('//') && !path.endsWith('/')
  && !path.split('/').some(segment => segment === '.');
}
export function isAllowedFaultRule(rule) {
 if(!['failOnce','failAlways','timeoutOnce','delayOnce'].includes(rule.mode)||!isAllowedFaultPath(rule.path)||!['GET','POST','PUT','DELETE','*'].includes(rule.method)||!['h5','admin','*'].includes(rule.surface))return false;
 if(rule.path==='/captchaImage'&&(rule.method!=='GET'||rule.surface!=='admin'||rule.mode!=='failOnce'))return false;
 if((rule.path.startsWith('/tool/')||rule.mode==='delayOnce')&&rule.method!=='GET')return false;
 return ['timeoutOnce','delayOnce'].includes(rule.mode)?Number.isSafeInteger(rule.value)&&rule.value>=100&&rule.value<=60000:[500,502,503,504].includes(rule.value);
}
export function redactFaultPath(path) {
 return path.replace(/^(\/monitor\/cache\/getValue\/[^/]+)\/.+$/, '$1/[redacted]').replace(/^(\/monitor\/cache\/clearCacheKey)\/.+$/, '$1/[redacted]').replace(/^(\/api\/shares)\/[A-Za-z0-9_-]{43}$/, '$1/[redacted]');
}
export function classifyFaultRequest(surface, pathname) {
 const isApiRequest = surface === 'admin' ? pathname.startsWith('/prod-api/') : surface === 'h5' && pathname.startsWith('/api/');
 return {isApiRequest, normalized: normalizeFaultPath(surface === 'admin' && pathname.startsWith('/prod-api/') ? pathname.slice('/prod-api'.length) : pathname)};
}
