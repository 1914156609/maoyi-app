<template>
  <view class="screen with-tabs"
    ><AppHeader title="毛衣姑娘" :back="false" /><view class="content"
      ><view class="shortcuts panel"
        ><button
          role="button"
          tabindex="0"
          v-for="item in shortcuts"
          :key="item.page"
          class="shortcut"
          @click="navigate(item.page)"
        >
          <text :class="['shortcut-icon', { plus: item.page === 'create' }]">{{
            item.icon
          }}</text
          ><text class="shortcut-name">{{ item.name }}</text>
        </button></view
      ><view class="section-heading"
        ><text>最近工艺</text
        ><button
          role="button"
          tabindex="0"
          class="text-button"
          @click="navigate('crafts')"
        >
          更多 ›
        </button></view
      ><view v-if="loading || loadError" class="panel">
        <AccessEmpty compact icon="🧷" :title="loading ? '正在加载…' : loadError" />
        <button v-if="loadError" role="button" tabindex="0" class="secondary" @click="reload">重新加载</button>
      </view><template v-else><view v-if="!recent.length" class="panel recent-empty"
        ><EmptyState /></view
      ><CraftCard
        v-for="craft in recent"
        :key="craft.id"
        :craft="craft"
        recent /></template></view
    ><BottomNav active="index"
  /></view>
</template>
<script setup>
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { authenticated, setReviewMode } from "../../lib/session.js";
onLoad((o) => {
  if (o.review) setReviewMode(o.review);
});
import AppHeader from "../../components/AppHeader.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import BottomNav from "../../components/BottomNav.vue";
import EmptyState from "../../components/EmptyState.vue";
import CraftCard from "../../components/CraftCard.vue";
import { store, navigate, refreshCrafts } from "../../lib/store.js";
const shortcuts = [
  { icon: "＋", name: "新增工艺", page: "create" },
  { icon: "🧮", name: "工艺计算", page: "calculate" },
];
const recent = computed(() =>
  (authenticated.value ? store.recentIds : [])
    .map((id) => store.crafts.find((c) => c.id === id))
    .filter(Boolean)
    .slice(0, 5),
);
const loading = ref(false), loadError = ref("");
async function reload() {
  if (loading.value) return;
  loading.value = true;
  loadError.value = "";
  try { await refreshCrafts(); }
  catch (e) { loadError.value = e.message || "加载失败，请稍后重试"; }
  finally { loading.value = false; }
}
onShow(reload);
</script>
<style scoped>
.shortcuts {
  display: flex;
  padding: 26rpx 8rpx 30rpx;
  margin-bottom: 0;
}
.shortcut {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 9rpx 0 4rpx;
}
.shortcut-icon {
  font-size: 45rpx;
  height: 48rpx;
  line-height: 48rpx;
}
.shortcut-icon.plus {
  color: #57595c;
  font-weight: 400;
  font-size: 64rpx;
}
.shortcut-name {
  font-size: 23rpx;
  color: #c3c9d4;
  white-space: nowrap;
}
.recent-empty {
  padding: 0;
  min-height: 245rpx;
}
.section-heading {
  margin-top: 35rpx;
  margin-bottom: 22rpx;
}
.section-heading .text-button {
  font-size: 24rpx;
}
</style>
