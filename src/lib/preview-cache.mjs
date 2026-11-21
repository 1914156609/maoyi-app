export const PREVIEW_CACHE_KEY = 'maoyi-preview-cache';

export function previewCacheBytes(value) {
  if (value === undefined) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return 0;
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function readPreviewCacheSize(storage) {
  const bytes = previewCacheBytes(storage.getStorageSync(PREVIEW_CACHE_KEY));
  return Number((bytes / 1024).toFixed(3));
}

export function clearPreviewCache(storage) {
  storage.removeStorageSync(PREVIEW_CACHE_KEY);
  const remaining = previewCacheBytes(storage.getStorageSync(PREVIEW_CACHE_KEY));
  if (remaining !== 0) throw new Error('Preview cache was not removed');
  return 0;
}
