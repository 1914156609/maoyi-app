const enc = new TextEncoder();
export function randomToken(bytes=32) { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
export async function digest(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export async function passwordHash(password, salt=randomToken(16)) {
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);
 return `pbkdf2$100000$${salt}$${[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}`;
}
export async function verifyPassword(password, hash) {
 const parts=String(hash||'').split('$');
 const expected=parts.length===4&&parts[0]==='pbkdf2'&&parts[1]==='100000' ? hash : 'pbkdf2$100000$dummy$'+'0'.repeat(64);
 const actual=await passwordHash(password,expected.split('$')[2]);
 let different=actual.length^expected.length;
 for(let i=0;i<actual.length;i++) different|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return different===0 && !!hash;
}
