import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_CACHE_KEY, previewCacheBytes, readPreviewCacheSize, clearPreviewCache } from '../src/lib/preview-cache.mjs';

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return { data, getStorageSync: key => data.has(key) ? data.get(key) : '', removeStorageSync: key => data.delete(key) };
}

test('missing preview cache stays zero despite unrelated authentication and preferences', () => {
  const state = storage({ token: 'session-data', 'maoyi-notifications': true, 'maoyi-prefill': { name: 'draft' } });
  assert.equal(readPreviewCacheSize(state), 0);
  assert.equal(previewCacheBytes(undefined), 0);
  assert.equal(previewCacheBytes(''), 0);
});

test('UTF-8 byte counting includes Chinese, emoji, mixed text and JSON values', () => {
  for (const value of ['abc', '毛衣', '🧶', 'A毛🧶', '\ud800', { name: '毛衣🧶', size: 60 }, false, 0, null]) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    assert.equal(previewCacheBytes(value), Buffer.byteLength(serialized, 'utf8'));
  }
});

test('display reports only preview payload in KB, including values below one KB', () => {
  assert.equal(readPreviewCacheSize(storage({ [PREVIEW_CACHE_KEY]: 'x'.repeat(1024), token: 'x'.repeat(5000) })), 1);
  assert.equal(readPreviewCacheSize(storage({ [PREVIEW_CACHE_KEY]: '毛' })), 0.003);
});

test('clear removes only preview cache and retains identity, notifications and unsaved business data', () => {
  const state = storage({ [PREVIEW_CACHE_KEY]: '毛衣🧶', token: 'session-data', 'maoyi-notifications': false, 'maoyi-prefill': { name: 'unsaved' } });
  assert.equal(clearPreviewCache(state), 0);
  assert.equal(state.data.has(PREVIEW_CACHE_KEY), false);
  assert.equal(state.data.get('token'), 'session-data');
  assert.equal(state.data.get('maoyi-notifications'), false);
  assert.deepEqual(state.data.get('maoyi-prefill'), { name: 'unsaved' });
});

test('clear does not return success when removal throws or silently keeps the cache', () => {
  assert.throws(() => clearPreviewCache({ ...storage({ [PREVIEW_CACHE_KEY]: 'data' }), removeStorageSync() { throw new Error('denied'); } }), /denied/);
  assert.throws(() => clearPreviewCache({ ...storage({ [PREVIEW_CACHE_KEY]: 'data' }), removeStorageSync() {} }), /not removed/);
});

test('readback failure cannot be mistaken for successful cache removal', () => {
  assert.throws(() => clearPreviewCache({ removeStorageSync() {}, getStorageSync() { throw new Error('read failed'); } }), /read failed/);
});
