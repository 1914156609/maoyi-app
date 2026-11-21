<template>
  <view class="screen">
    <AppHeader title="工艺计算" />
    <view class="content">
      <view v-if="loading || loadError" class="panel">
        <AccessEmpty compact icon="🧮" :title="loading ? '正在加载工艺…' : loadError" />
        <button v-if="loadError" class="secondary" @click="loadExisting">重新加载</button>
      </view>
      <template v-else>
        <view class="panel unit-panel">
          <view class="choices">
            <button role="button" tabindex="0" v-for="u in ['cm', '寸']" :key="u" :class="['pill', { selected: unit === u }]" @click="setUnit(u)">{{ u }}</button>
          </view>
        </view>
        <view class="panel">
          <text class="panel-title">基本信息</text>
          <view class="field-full">
            <text class="field-label">工艺单名称</text>
            <input class="input" v-model="form.name" aria-label="工艺单名称" placeholder="选填，保存工艺单时填写" placeholder-class="input-placeholder" maxlength="60" />
          </view>
          <view v-for="group in visibleChoices" :key="group.key" class="choice-group">
            <text class="choice-label">{{ group.label }}</text>
            <view class="choices"><button role="button" tabindex="0" v-for="value in group.values" :key="value" :class="['pill', { selected: form[group.key] === value }]" @click="choose(group.key, value)">{{ value }}</button></view>
          </view>
        </view>
        <view class="panel">
          <text class="panel-title">工艺尺寸（{{ fieldCount }}项）</text>
          <text class="measurement-note">胸宽按单片平铺宽度填写，计算时不再除以 2。切换 cm / 寸会换算已填写的尺寸，密度仍按 10cm 填写。</text>
          <view v-for="group in visibleGroups" :key="group.label" class="calc-group">
            <view class="bar-heading">{{ group.label }}</view>
            <view v-for="field in group.fields" :key="field[0]" class="calc-field">
              <view class="calc-row">
                <text class="calc-label">{{ field[1] }}</text>
                <input :aria-label="group.label + ' ' + field[1]" :class="{ error: errors[field[0]] }" v-model="form.sizes[field[0]]" type="digit" placeholder="选填" placeholder-class="input-placeholder" maxlength="10" />
                <text class="calc-unit">{{ unit }}</text>
              </view>
              <text v-if="errors[field[0]]" class="error-text">{{ errors[field[0]] }}</text>
            </view>
          </view>
        </view>
        <view class="panel">
          <text class="panel-title">密度与行数</text>
          <view class="fields density-fields">
            <NumberField v-model="form.density" label="密度（针/10cm）" placeholder="如 68" :error="errors.density" />
            <NumberField v-model="form.rowDensity" label="行数（行/10cm）" placeholder="如 46" :error="errors.rowDensity" />
          </view>
        </view>
        <button role="button" tabindex="0" class="primary" :disabled="generating || transferring" @click="run">{{ generating ? '正在生成…' : '开始计算' }}</button>
        <text v-if="error" class="error-text calculation-error">{{ error }}</text>
        <CalculationResult id="calculation-result" :result="result" />
        <button v-if="result" role="button" tabindex="0" class="primary" :disabled="transferring" @click="saveDraft">{{ transferring ? '正在转入…' : '保存为草稿工艺单' }}</button>
      </template>
    </view>
  </view>
</template>
<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppHeader from '../../components/AppHeader.vue';
import NumberField from '../../components/NumberField.vue';
import AccessEmpty from '../../components/AccessEmpty.vue';
import CalculationResult from '../../components/CalculationResult.vue';
import { groups, emptyCraft, convertUnit, allFields, choiceGroups, isDecimalNumber } from '../../lib/domain.mjs';
import { calculateCraft } from '../../lib/knitting.mjs';
import { store, fetchCraft, notify } from '../../lib/store.js';
const unit = ref(store.settings.unit || 'cm'), form = reactive(emptyCraft()), result = ref(null), error = ref(''), errors = ref({}),
  loading = ref(false), loadError = ref(''), generating = ref(false), transferring = ref(false);
let sourceId = '';
const physicalSizes = new Map();
let switchingUnit = false;
const visibleChoices = computed(() => choiceGroups.filter(g => g.key !== 'length').map(g => g.key === 'sleeve' && form.style === '背心' ? { ...g, values: ['无袖'] } : g));
const visibleGroups = computed(() => groups.filter(g => !(g.label === '袖子尺寸' && (form.style === '背心' || form.sleeve === '无袖')) && !(g.fields.some(f => f[0] === 'placketWidth') && form.style !== '开衫')));
const fieldCount = computed(() => visibleGroups.value.reduce((n, g) => n + g.fields.length, 0));
onLoad(async options => { if (options.id) { sourceId = options.id; await loadExisting(); } });
watch([form, unit], () => { result.value = null; error.value = ''; errors.value = {}; }, { deep: true, flush: 'sync' });
watch(() => allFields.map(([key]) => form.sizes[key]), values => {
  if (switchingUnit) return;
  allFields.forEach(([key], i) => {
    const cached = physicalSizes.get(key);
    if (cached && cached.display !== String(values[i])) physicalSizes.delete(key);
  });
}, { flush: 'sync' });
async function loadExisting() {
  if (!sourceId || loading.value) return;
  loading.value = true; loadError.value = '';
  try {
    const c = await fetchCraft(sourceId);
    if (!c) throw new Error('工艺单不存在');
    const fresh = emptyCraft();
    for (const key of Object.keys(fresh)) if (key !== 'sizes' && c[key] != null) fresh[key] = c[key];
    Object.assign(fresh.sizes, c.sizes || {});
    if (c.measurementBasis === 'circumference' || !c.measurementBasis) {
      if (fresh.sizes.chest !== '' && fresh.sizes.chest != null) fresh.sizes.chest = String(Number(fresh.sizes.chest) / 2);
    }
    fresh.measurementBasis = 'flat'; fresh.calculationVersion = 'video-v1';
    if (fresh.style === '背心') fresh.sleeve = '无袖';
    physicalSizes.clear(); unit.value = 'cm'; Object.assign(form, fresh);
  } catch (e) { loadError.value = e.message || '工艺加载失败'; }
  finally { loading.value = false; }
}
function choose(key, value) { form[key] = value; if (key === 'style' && value === '背心') form.sleeve = '无袖'; }
function physicalCm(value, from) {
  if (from === 'cm') return value;
  // Multiply the entered decimal by 333/100 without rounding away user precision.
  const match = String(value).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!match) return String(Number(value) * 3.33);
  const digits = (match[2] || '0') + (match[3] || '');
  let product = '', carry = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const n = Number(digits[i]) * 333 + carry;
    product = String(n % 10) + product; carry = Math.floor(n / 10);
  }
  if (carry) product = String(carry) + product;
  const places = (match[3]?.length || 0) + 2;
  product = product.padStart(places + 1, '0');
  const whole = product.slice(0, -places).replace(/^0+(?=\d)/, ''), fraction = product.slice(-places).replace(/0+$/, '');
  return (match[1] === '-' ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}
function setUnit(next) {
  if (next === unit.value) return;
  switchingUnit = true;
  try {
    for (const [key] of allFields) {
      const value = form.sizes[key];
      if (!isDecimalNumber(value)) { physicalSizes.delete(key); continue; }
      const cached = physicalSizes.get(key);
      const cm = cached && cached.unit === unit.value && cached.display === String(value) ? cached.cm : physicalCm(value, unit.value);
      const display = next === 'cm' ? cm : convertUnit(cm, 'cm', '寸');
      form.sizes[key] = display;
      physicalSizes.set(key, { cm, display: String(display), unit: next });
    }
    unit.value = next; store.settings.unit = next;
  } finally { switchingUnit = false; }
}
function activeForm() {
  const data = JSON.parse(JSON.stringify(form));
  const active = new Set(visibleGroups.value.flatMap(g => g.fields.map(f => f[0])));
  for (const key of Object.keys(data.sizes)) if (!active.has(key)) data.sizes[key] = '';
  for (const [key, value] of Object.entries(data.sizes)) {
    if (!isDecimalNumber(value)) continue;
    const cached = physicalSizes.get(key);
    data.sizes[key] = cached && cached.unit === unit.value && cached.display === String(value)
      ? cached.cm : physicalCm(value, unit.value);
  }
  return data;
}
async function run() {
  if (generating.value || transferring.value) return;
  generating.value = true;
  try {
    uni.hideToast?.();
    await nextTick();
    const output = calculateCraft(activeForm());
    errors.value = output.fieldErrors;
    if (output.errors.length) { result.value = null; error.value = output.errors[0]; notify(error.value); return; }
    result.value = output; error.value = '';
  } catch (e) { result.value = null; error.value = e.message || '工艺计算失败，请检查填写内容'; notify(error.value); }
  finally { generating.value = false; }
}
function saveDraft() {
  if (!result.value || transferring.value) return;
  transferring.value = true;
  try {
    const prefill = { ...emptyCraft(), ...result.value.input, name: form.name.trim() };
    delete prefill.id; delete prefill.version; delete prefill.calculation;
    uni.setStorageSync('maoyi-prefill', JSON.parse(JSON.stringify(prefill)));
    uni.navigateTo({ url: '/pages/create/create?prefill=1', fail: () => notify('页面打开失败，请重试'), complete: () => { transferring.value = false; } });
  } catch { transferring.value = false; notify('未能暂存计算结果，请稍后重试'); }
}
</script>
<style scoped>
.unit-panel { padding: 28rpx; }
.unit-panel .pill { min-width: 126rpx; min-height: 62rpx; }
.choice-group { margin-top: 26rpx; }
.calc-group + .calc-group { margin-top: 28rpx; }
.calc-row { display: flex; align-items: center; min-height: 101rpx; gap: 14rpx; }
.calc-label { width: 205rpx; flex-shrink: 0; font-size: 28rpx; }
.calc-row input { flex: 1; min-width: 0; background: #1b2030; padding: 0 20rpx; height: 76rpx; border-radius: 9rpx; font-size: 26rpx; }
.calc-row input.error { border: 1px solid #ed7373; }
.calc-unit { width: 60rpx; text-align: right; color: var(--muted); font-size: 25rpx; }
.measurement-note { display: block; color: var(--muted); font-size: 23rpx; line-height: 1.6; margin: 0 0 26rpx; }
.density-fields { display: block; }
.density-fields :deep(.field) + :deep(.field) { margin-top: 24rpx; }
.density-fields :deep(.field:first-child) { width: 48%; }
.calculation-error { display: block; line-height: 1.5; margin: 16rpx 4rpx; }
.calc-field > .error-text { display: block; margin-bottom: 16rpx; }
</style>
