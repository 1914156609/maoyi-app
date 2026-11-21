<template>
  <view class="screen with-tabs"
    ><AppHeader title="工艺单" :back="false" /><view class="content"
      ><SearchControls
        placeholder="搜索工艺单名称 / 编号"
        @search="query = $event"
        @reset="
          query = '';
          filter = '全部';
        "
      /><view class="source-filters"
        ><button
          role="button"
          tabindex="0"
          v-for="f in ['全部', '草稿', '待审核', '已通过', '已驳回']"
          :key="f"
          :class="['pill', { selected: filter === f }]"
          @click="filter = f"
        >
          {{ f }}
        </button></view
      ><AccessEmpty
        v-if="!authenticated"
        class="craft-access"
        description="登录后可查看账号中的工艺单；也可以先打开工艺计算预览。"
        action="登录后查看"
      /><view v-else-if="loading || loadError" class="panel">
        <AccessEmpty compact icon="🧷" :title="loading ? '正在加载…' : loadError" />
        <button v-if="loadError" role="button" tabindex="0" class="secondary" @click="reload">重新加载</button>
      </view><template v-else
        ><CraftCard v-for="c in filtered" :key="c.id" :craft="c" /><AccessEmpty
          v-if="!filtered.length"
          compact
          icon="🧷"
          title="暂无数据"
        /><text v-else class="list-end">— 没有更多了 —</text></template
      ></view
    ><button
      role="button"
      tabindex="0"
      class="create-fab"
      aria-label="新增工艺"
      @click="navigate('create')"
    >
      ＋</button
    ><BottomNav active="crafts"
  /></view>
</template>
<script setup>
import { onShow } from "@dcloudio/uni-app";
import { ref, computed } from "vue";
import AppHeader from "../../components/AppHeader.vue";
import BottomNav from "../../components/BottomNav.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import SearchControls from "../../components/SearchControls.vue";
import { store, navigate, refreshCrafts } from "../../lib/store.js";
import CraftCard from "../../components/CraftCard.vue";
import { authenticated } from "../../lib/session.js";
import { statusLabels } from "../../lib/domain.mjs";
const query = ref(""),
  filter = ref("全部");
const filtered = computed(() =>
  store.crafts.filter(
    (c) =>
      (filter.value === "全部" || statusLabels[c.status] === filter.value) &&
      (c.name + " " + (c.code || c.id)).includes(query.value.trim()),
  ),
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
.craft-access {
  padding: 85rpx 10rpx 0;
  min-height: 380rpx;
}
.create-fab {
  position: fixed;
  right: 40rpx;
  bottom: 160rpx;
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: #f1a025;
  color: #191b1e;
  box-shadow: 0 8rpx 28rpx #d4912848;
  font-size: 50rpx;
  display: flex;
  justify-content: center;
  align-items: center;
} /* #ifdef H5 */
@media (min-width: 414px) {
  .create-fab {
    right: calc((100vw - 414px) / 2 + 22px);
  }
} /* #endif */
</style>
