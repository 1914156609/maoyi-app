<template>
  <view class="screen"
    ><AppHeader title="工艺分享" /><view class="content"
      ><view class="panel" v-if="craft"
        ><text class="panel-title">{{ craft.name }}</text
        ><text class="share-line">编号：{{ craft.code || craft.id }}</text
        ><text class="share-line"
          >款式：{{ craft.style }} · {{ craft.neck }} · {{ craft.sleeve }}</text
        ><text class="share-line"
          >毛料：{{ craft.material || "未指定" }} ·
          {{ craft.color || "未指定" }}</text
        ><CraftDrawing v-if="craft.calculation && !craft.calculation.errors.length" :craft="craft" /><text class="share-line" v-if="craft.calculation?.errors.length">尺寸未填写完整，暂不能生成工艺图</text><text class="share-line" v-for="(p, i) in craft.parts || []" :key="i"
          >{{ p[0] }}：{{ p[1] }} {{ p[2] }}</text
        ></view
      ><AccessEmpty
        v-else-if="!loading"
        dashed
        compact
        icon="🔗"
        :title="error || '分享链接已失效'" /><text v-else class="share-line">正在读取分享…</text><button v-if="error" role="button" tabindex="0" class="secondary" @click="reload">重新加载</button></view
  ></view>
</template>
<script setup>
import { ref } from "vue";
import { onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import CraftDrawing from "../../components/CraftDrawing.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import { readShare } from "../../lib/sharing.js";
const craft = ref(null), loading=ref(true), error=ref(""), code=ref("");
let request=0;
onLoad(o => {
  code.value = o.code || '';
  // #ifdef H5
  window.addEventListener('hashchange', syncShareCode);
  // #endif
});
// #ifdef H5
function syncShareCode() {
  const hash = window.location.hash.slice(1);
  const separator = hash.indexOf('?');
  const path = separator < 0 ? hash : hash.slice(0, separator);
  if (path !== '/pages/shared/shared') return;
  const next = new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1)).get('code') || '';
  if (next === code.value) return;
  code.value = next;
  return reload();
}
// #endif
async function reload() {
  const current = ++request;
  loading.value = true; error.value = ''; craft.value = null;
  try {
    const value = await readShare(code.value);
    if (current === request) craft.value = value;
  } catch (e) {
    if (current === request) error.value = e.message;
  } finally {
    if (current === request) loading.value = false;
  }
}
onShow(reload);
onUnload(() => {
  request++;
  // #ifdef H5
  window.removeEventListener('hashchange', syncShareCode);
  // #endif
});
</script>
<style scoped>
.share-line {
  display: block;
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 24rpx;
  line-height: 2;
}
.panel-title {
  overflow-wrap: anywhere;
  font-size: 27rpx;
}
</style>
