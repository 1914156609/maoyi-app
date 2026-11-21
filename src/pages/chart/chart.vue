<template>
  <view class="screen"
    ><AppHeader title="工艺图绘制" /><view class="content"
      ><view v-if="loading || loadError" class="panel"
        ><AccessEmpty compact icon="📐" :title="loading ? '正在加载工艺图…' : loadError" />
        <button v-if="loadError" class="secondary" @click="load">重新加载</button>
      </view><template v-else><view class="panel drawing-panel"
        ><view class="drawing-wrap"
          ><text v-if="locked" class="locked-badge">🔒 已锁定</text
          ><CraftDrawing
            ref="drawing"
            :craft="craft"
            :show-text="showText"
            :show-dimensions="showDimensions"
            :locked="true" /></view
        ><text class="drawing-caption"
          >前片 / 后片 / 袖 / 领 / 门襟结构图，含工艺文字标注与尺寸标注</text
        ></view
      ><view class="panel"
        ><text class="panel-title">工具栏</text
        ><view class="choices tools"
          ><button
            role="button"
            tabindex="0"
            :class="['pill', { selected: showText }]"
            @click="toggleText"
          >
            {{ showText ? "✓ " : "" }}显示文字</button
          ><button
            role="button"
            tabindex="0"
            :class="['pill', { selected: showDimensions }]"
            @click="toggleDimensions"
          >
            {{ showDimensions ? "✓ " : "" }}显示尺寸</button
          ><button
            role="button"
            tabindex="0"
            :class="['pill', { selected: locked }]"
            @click="locked = !locked"
          >
            {{ locked ? "🔒 解锁图形" : "🔓 锁定图形" }}
          </button></view
        ></view
      ><button role="button" tabindex="0" class="primary" :disabled="saving" @click="save">
        {{ saving ? '正在保存…' : '保存工艺图' }}
      </button></template></view
    ></view
  >
</template>
<script setup>
import { ref } from "vue";
import { onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import CraftDrawing from "../../components/CraftDrawing.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import { drawingSample } from "../../lib/reference-data.js";
import { authenticated } from "../../lib/session.js";
import { fetchCraft, refreshCharts, saveChart, navigate, notify, uid } from "../../lib/store.js";
const craft = ref(drawingSample()),
  showText = ref(true),
  showDimensions = ref(true),
  locked = ref(false),
  drawing = ref(null),
  loading = ref(false),
  loadError = ref(''),
  saving = ref(false);
let craftId = null, chartId = '', generation = 0, initialized = false, disposed = false;
let pendingLoad = null;
craft.value.updatedAt = new Date().toISOString();
onLoad((o) => {
  selectTarget(o.id || null);
  // #ifdef H5
  window.addEventListener('hashchange', syncChartTarget);
  // #endif
});
onShow(load);
onUnload(() => {
  disposed = true;
  generation++;
  pendingLoad = null;
  craft.value = null;
  chartId = '';
  loading.value = false;
  saving.value = false;
  // #ifdef H5
  window.removeEventListener('hashchange', syncChartTarget);
  // #endif
});
function selectTarget(id) {
  const next = typeof id === 'string' && id ? id : null;
  if (initialized && next === craftId) return false;
  initialized = true;
  craftId = next;
  generation++;
  pendingLoad = null;
  craft.value = null;
  chartId = '';
  showText.value = true;
  showDimensions.value = true;
  locked.value = false;
  loading.value = true;
  loadError.value = '';
  saving.value = false;
  return true;
}
function isCurrent(version, id) {
  return !disposed && version === generation && id === craftId;
}
// #ifdef H5
function currentChartTarget() {
  const hash = window.location.hash.slice(1);
  const separator = hash.indexOf('?');
  const path = separator < 0 ? hash : hash.slice(0, separator);
  if (path !== '/pages/chart/chart') return null;
  return { id: new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1)).get('id') || null };
}
function syncChartTarget() {
  if (disposed) return;
  const target = currentChartTarget();
  if (target && selectTarget(target.id)) return load();
}
// #endif
async function load() {
  if (disposed) return;
  // #ifdef H5
  const target = currentChartTarget();
  if (target) selectTarget(target.id);
  // #endif
  if (pendingLoad) return pendingLoad.promise;
  const version = generation, id = craftId;
  const pending = { promise: null };
  pendingLoad = pending;
  loading.value = true;
  loadError.value = '';
  pending.promise = (async () => {
    try {
      const found = id ? await fetchCraft(id) : drawingSample();
      if (!isCurrent(version, id)) return;
      if (!found) throw new Error('工艺单不存在');
      const charts = authenticated.value ? await refreshCharts() : [];
      if (!isCurrent(version, id)) return;
      const saved = charts.find(c => (c.craftId || null) === id);
      craft.value = found;
      chartId = saved?.id || uid();
      showText.value = saved?.showText !== false;
      showDimensions.value = saved?.showDimensions !== false;
      locked.value = saved?.locked === true;
    } catch (e) {
      if (isCurrent(version, id)) loadError.value = e.message || '工艺图加载失败';
    } finally {
      if (isCurrent(version, id)) {
        loading.value = false;
        if (pendingLoad === pending) pendingLoad = null;
      }
    }
  })();
  return pending.promise;
}
async function save() {
  if (disposed) return;
  // #ifdef H5
  const target = currentChartTarget();
  if (!target) return;
  if (selectTarget(target.id)) {
    load();
    return;
  }
  // #endif
  if (saving.value || loading.value || loadError.value || !craft.value || !chartId) return;
  if (!authenticated.value) return navigate("login");
  const version = generation, id = craftId;
  const payload = { id: chartId, craftId: id,
    showText: showText.value, showDimensions: showDimensions.value, locked: locked.value };
  saving.value = true;
  try {
    const saved = await saveChart(payload);
    if (!isCurrent(version, id)) return;
    chartId = saved.id;
    notify("工艺图已保存");
  } catch (e) {
    if (isCurrent(version, id)) notify(e.message || '工艺图保存失败');
  } finally {
    if (isCurrent(version, id)) saving.value = false;
  }
}
function toggleText() {
  if (locked.value) return notify("图形已锁定，请先解锁");
  showText.value = !showText.value;
  notify(showText.value ? "已显示文字标注" : "已隐藏文字标注");
}
function toggleDimensions() {
  if (locked.value) return notify("图形已锁定，请先解锁");
  showDimensions.value = !showDimensions.value;
  notify(showDimensions.value ? "已显示尺寸标注" : "已隐藏尺寸标注");
}
</script>
<style scoped>
.drawing-caption {
  display: block;
  color: var(--muted);
  font-size: 23rpx;
  line-height: 1.5;
  margin-top: 12rpx;
}
.tools {
  gap: 14rpx;
}
.tools .pill {
  font-size: 25rpx;
  padding: 12rpx 25rpx;
  min-width: 0;
}
.drawing-panel {
  padding-bottom: 24rpx;
}
.drawing-wrap {
  position: relative;
}
.locked-badge {
  position: absolute;
  z-index: 2;
  right: 10rpx;
  top: 10rpx;
  padding: 8rpx 14rpx;
  border: 1px solid #e7a42c;
  border-radius: 99rpx;
  background: #604519c9;
  color: #ffc254;
  font-size: 22rpx;
}
</style>
