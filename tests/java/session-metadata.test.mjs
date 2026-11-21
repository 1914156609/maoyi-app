import test from 'node:test';
import assert from 'node:assert/strict';
import {readSessionMetadata,selectOwnedSessionKeys} from './qa-session-metadata.mjs';

test('Fastjson typed records retain numeric owner while exposing no credentials',()=>{
 const [result]=readSessionMetadata(['{"@type":"com.ruoyi.common.core.domain.model.LoginUser","userId":114L,"loginTime":1794971394082L,"permissions":Set["system:user:list"],"token":"private-fixture","user":{"password":"private-fixture-password"}}']);
 assert.equal(result.userId,114);assert.equal(result.loginTime,1794971394082);
 assert.equal(JSON.stringify(result).includes('private-fixture'),false);
});
test('cleanup selects exact tracked ownership, preserving original admin and unrelated sessions',()=>{
 const records=[{key:'login_tokens:fixture-root',raw:'{"userId":1L}'},{key:'login_tokens:fixture-qa',raw:'{"userId":114L,"permissions":Set[]}'},{key:'login_tokens:fixture-other',raw:'{"userId":999}'}];
 assert.deepEqual(selectOwnedSessionKeys(records,new Set([103,114])),['login_tokens:fixture-qa']);
});
test('malformed private session fails closed without leaking the input',()=>{
 assert.throws(()=>readSessionMetadata(['private-secret-invalid-json']),e=>!e.message.includes('private-secret')&&e.message.includes('abort cleanup'));
 assert.throws(()=>readSessionMetadata(['{"permissions":Set[]}']),/Invalid session ownership/);
});
test('empty inventory needs no JVM and cleanup rejects privileged/invalid selectors',()=>{
 assert.deepEqual(readSessionMetadata([]),[]);
 assert.throws(()=>selectOwnedSessionKeys([],new Set([1])),/Invalid QA ownership/);
 assert.throws(()=>selectOwnedSessionKeys([{key:'other:fixture',raw:'{"userId":114}'}],new Set([114])),/namespace/);
});
