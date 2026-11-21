<template>
  <view class="screen">
    <AppHeader :title="editId ? '编辑工艺' : '新增工艺'" />
    <view class="content">
      <view v-if="loading || loadError" class="panel">
        <AccessEmpty compact icon="📐" :title="loading ? '正在加载工艺…' : loadError" />
        <button v-if="loadError" class="secondary" @click="loadExisting">重新加载</button>
      </view>
      <template v-else>
        <view class="panel">
          <text class="panel-title">基本信息</text>
          <view class="field-full">
            <text class="field-label">工艺单名称<text class="required">*</text></text>
            <input :class="['input', { error: errors.name }]" aria-label="工艺单名称" v-model="form.name" placeholder="如 燕麦色圆领套头衫" placeholder-class="input-placeholder" maxlength="60" />
            <text v-if="errors.name" class="error-text">{{ errors.name }}</text>
          </view>
          <view v-for="group in visibleChoices" :key="group.key" class="choice-group">
            <text class="choice-label">{{ group.label }}</text>
            <view class="choices">
              <button role="button" tabindex="0" v-for="value in group.values" :key="value" :class="['pill', { selected: form[group.key] === value }]" @click="choose(group.key, value)">{{ value }}</button>
            </view>
          </view>
        </view>
        <view class="panel">
          <text class="panel-title">尺寸与密度（cm / 针行）</text>
          <view class="fields">
            <NumberField v-model="form.density" label="密度(针/10cm)" placeholder="如 68" :error="errors.density" />
            <NumberField v-model="form.rowDensity" label="行密度(行/10cm)" placeholder="如 46" :error="errors.rowDensity" />
          </view>
        </view>
        <view class="panel">
          <view class="bar-heading craft-heading"><text>工艺尺寸（{{ fieldCount }}项）</text><text class="caption">CRAFT SIZES · 可选填</text></view>
          <text class="measurement-note">胸宽按单片平铺宽度填写，计算时不再除以 2。尺寸不足可先保存草稿，补齐后生成工艺图。</text>
          <view v-for="group in visibleGroups" :key="group.label" class="size-group">
            <text class="group-label">{{ group.label }}</text>
            <view class="fields">
              <NumberField v-for="field in group.fields" :key="field[0]" v-model="form.sizes[field[0]]" :label="field[1]" :placeholder="'如 ' + field[2]" :error="errors[field[0]]" />
            </view>
          </view>
        </view>
        <button role="button" tabindex="0" class="primary generate" :disabled="generating || saving" @click="generate">{{ generating ? '正在生成…' : '生成工艺图与数据' }}</button>
        <text v-if="calculationError" class="error-text calculation-error">{{ calculationError }}</text>
        <CalculationResult v-if="result" :result="result" />
        <view v-if="conflict" class="panel conflict-panel">
          <text class="error-text">工艺单已更新，当前填写内容尚未保存。重新加载最新工艺后再修改。</text>
          <button class="secondary" :disabled="saving" @click="reloadLatest">重新加载最新工艺</button>
        </view>
        <button role="button" tabindex="0" class="primary save" :disabled="saving || generating || conflict" @click="save">{{ saving ? '正在保存…' : '保存为草稿工艺单' }}</button>
        <button role="button" tabindex="0" class="secondary" :disabled="saving || generating" @click="reset">重置表单</button>
      </template>
    </view>
  </view>
</template>
<script setup>
import { reactive, ref, computed, watch, nextTick } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppHeader from '../../components/AppHeader.vue';
import NumberField from '../../components/NumberField.vue';
import AccessEmpty from '../../components/AccessEmpty.vue';
import CalculationResult from '../../components/CalculationResult.vue';
import { groups, emptyCraft, choiceGroups, validateCraft } from '../../lib/domain.mjs';
import { calculateCraft } from '../../lib/knitting.mjs';
import { fetchCraft, saveCraft, notify, navigate } from '../../lib/store.js';
import { authenticated } from '../../lib/session.js';
const form = reactive(emptyCraft()), errors = ref({}), editId = ref(''), version = ref(null),
  saving = ref(false), generating = ref(false), loading = ref(false), loadError = ref(''),
  result = ref(null), calculationError = ref(''), conflict = ref(false);
const visibleChoices = computed(() => choiceGroups.map(g => g.key === 'sleeve' && form.style === '背心' ? { ...g, values: ['无袖'] } : g));
const visibleGroups = computed(() => groups.filter(g => !(g.label === '袖子尺寸' && (form.style === '背心' || form.sleeve === '无袖')) && !(g.fields.some(f => f[0] === 'placketWidth') && form.style !== '开衫')));
const fieldCount = computed(() => visibleGroups.value.reduce((n, g) => n + g.fields.length, 0));
function applyForm(data = {}) {
  const fresh = emptyCraft();
  for (const key of Object.keys(fresh)) if (key !== 'sizes' && data[key] != null) fresh[key] = data[key];
  Object.assign(fresh.sizes, data.sizes || {});
  if (data.measurementBasis === 'circumference' || (data.id && !data.measurementBasis)) {
    if (fresh.sizes.chest !== '' && fresh.sizes.chest != null) fresh.sizes.chest = String(Number(fresh.sizes.chest) / 2);
  }
  fresh.measurementBasis = 'flat';
  fresh.calculationVersion = 'video-v1';
  if (fresh.style === '背心') fresh.sleeve = '无袖';
  Object.assign(form, fresh);
}
onLoad(async options => {
  if (options.id) { editId.value = options.id; await loadExisting(); }
  else if (options.prefill) {
    let stored;
    try { stored = uni.getStorageSync('maoyi-prefill'); }
    catch { notify('暂存表单读取失败，请稍后重试'); return; }
    if (stored) {
      applyForm(stored);
      try { uni.removeStorageSync('maoyi-prefill'); }
      catch { notify('表单已读取，暂存缓存未能清除'); }
    }
  }
});
watch(form, () => { result.value = null; calculationError.value = ''; errors.value = {}; }, { deep: true, flush: 'sync' });
async function loadExisting() {
  if (!editId.value || loading.value) return;
  loading.value = true; loadError.value = '';
  try {
    const c = await fetchCraft(editId.value);
    if (!c) throw new Error('工艺单不存在');
    if (!['draft', 'rejected'].includes(c.status)) throw new Error('待审核或已通过工艺单不可修改');
    applyForm(c); version.value = c.version; conflict.value = false;
  } catch (e) { loadError.value = e.message || '工艺加载失败'; }
  finally { loading.value = false; }
}
function choose(key, value) {
  form[key] = value;
  if (key === 'style' && value === '背心') form.sleeve = '无袖';
}
function activeForm() {
  const data = JSON.parse(JSON.stringify(form));
  const active = new Set(visibleGroups.value.flatMap(g => g.fields.map(f => f[0])));
  for (const key of Object.keys(data.sizes)) if (!active.has(key)) data.sizes[key] = '';
  return data;
}
async function generate() {
  if (generating.value || saving.value) return;
  generating.value = true;
  try {
    uni.hideToast?.();
    await nextTick();
    const output = calculateCraft(activeForm());
    errors.value = output.fieldErrors;
    if (output.errors.length) { result.value = null; calculationError.value = output.errors[0]; notify(calculationError.value); return; }
    result.value = output; calculationError.value = '';
  } catch (e) { result.value = null; calculationError.value = e.message || '工艺计算失败，请检查填写内容'; notify(calculationError.value); }
  finally { generating.value = false; }
}
async function save() {
  if (saving.value || generating.value || conflict.value) return;
  errors.value = validateCraft(activeForm());
  if (Object.keys(errors.value).length) {
    notify(Object.values(errors.value)[0]);
    if (errors.value.name) uni.pageScrollTo({ scrollTop: 0, duration: 180 });
    return;
  }
  if (!authenticated.value) {
    try { uni.setStorageSync('maoyi-prefill', JSON.parse(JSON.stringify(form))); }
    catch { notify('未能暂存表单，请稍后重试'); return; }
    return navigate('login');
  }
  saving.value = true;
  try {
    const payload = { ...activeForm(), name: form.name.trim(), ...(editId.value ? { version: version.value } : {}) };
    const c = await saveCraft(payload, editId.value);
    // Keep the committed identity even if local cleanup or navigation fails.
    editId.value = c.id; version.value = c.version;
    let cacheCleared = true;
    try { uni.removeStorageSync('maoyi-prefill'); }
    catch { cacheCleared = false; }
    notify(cacheCleared ? '已保存为草稿' : '工艺已保存，表单缓存未能清除');
    uni.redirectTo({
      url: '/pages/detail/detail?id=' + encodeURIComponent(c.id),
      fail: () => notify('工艺已保存，详情页打开失败，请在工艺列表查看'),
    });
  } catch (e) {
    if (e.status === 409) conflict.value = true;
    notify(e.message || '保存失败，请稍后重试');
  } finally { saving.value = false; }
}
function reloadLatest() {
  uni.showModal({ title: '重新加载最新工艺', content: '当前未保存的修改将被最新工艺替换，是否继续？', confirmText: '重新加载', confirmColor: '#dc8700', success: r => { if (r.confirm) loadExisting(); } });
}
function reset() {
  uni.showModal({ title: '重置表单', content: '清空当前填写的内容？已保存的工艺单不会改变。', confirmText: '重置', confirmColor: '#dc8700', success: r => {
    if (r.confirm) { applyForm(); errors.value = {}; result.value = null; calculationError.value = ''; uni.pageScrollTo({ scrollTop: 0, duration: 180 }); }
  } });
}
</script>
<style scoped>
.craft-heading { margin-top: 0; margin-bottom: 26rpx; flex-wrap: wrap; gap: 12rpx; }
.craft-heading > text:first-child { font-size: 29rpx; }
.craft-heading .caption { font-size: 16rpx; letter-spacing: 2rpx; }
.size-group + .size-group { margin-top: 42rpx; }
.choice-group { margin-top: 26rpx; }
.panel { padding-bottom: 36rpx; }
.measurement-note { display: block; color: var(--muted); font-size: 23rpx; line-height: 1.6; margin-bottom: 26rpx; }
.save { margin-top: 24rpx; }
.calculation-error { display: block; line-height: 1.5; margin: 16rpx 4rpx; }
.conflict-panel { margin-top: 24rpx; }
</style>
