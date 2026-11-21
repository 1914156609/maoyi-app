<template>
  <view class="screen"
    ><AppHeader title="工艺图库" /><view class="content"
      ><SearchControls
        placeholder="搜索工艺名称 / 编号"
        @search="query = $event"
        @reset="
          query = '';
          filter = '全部';
        " /><view class="source-filters"
        ><button
          role="button"
          tabindex="0"
          v-for="f in ['全部', '套头', '开衫', '背心']"
          :key="f"
          :class="['pill', { selected: filter === f }]"
          @click="filter = f"
        >
          {{ f }}
        </button></view
      ><AccessEmpty
        v-if="!authenticated"
        class="library-empty"
        dashed
        description="登录后可查看自己的工艺图库；可进入绘制页面预览图纸。"
        action="登录后查看" /><view v-else-if="loading || loadError" class="panel"
        ><AccessEmpty compact icon="📐" :title="loading ? '正在加载…' : loadError" />
        <button v-if="loadError" role="button" tabindex="0" class="secondary" @click="reload">重新加载</button>
      </view><template v-else
        ><button
          role="button"
          tabindex="0"
          v-for="c in filtered"
          :key="c.id"
          class="panel gallery-card"
          @click="navigate('detail', 'id=' + encodeURIComponent(c.id))"
        >
          <view
            ><text class="gallery-name">{{ c.name }}</text
            ><text>款式：{{ c.style }} · {{ c.neck }}</text
            ><text
              >毛料：{{ c.material || "未指定" }} · 针型：{{
                c.gauge || "未指定"
              }}</text
            ></view
          ><view class="gallery-end"
            ><text>{{ formatDate(c.createdAt) }}</text
            ><text>查看详情 ›</text></view
          ></button
        ><AccessEmpty
          v-if="!filtered.length"
          dashed
          compact
          icon="📐"
          title="暂无数据" /></template></view
    ><button
      role="button"
      tabindex="0"
      class="draw-fab"
      @click="navigate('chart')"
    >
      ＋ 绘制
    </button></view
  >
</template>
<script setup>
import { onShow } from "@dcloudio/uni-app";
import { ref, computed } from "vue";
import AppHeader from "../../components/AppHeader.vue";
import SearchControls from "../../components/SearchControls.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import { store, navigate, refreshCrafts } from "../../lib/store.js";
import { authenticated } from "../../lib/session.js";
import { formatDate } from "../../lib/domain.mjs";
const query = ref(""),
  filter = ref("全部");
const loading = ref(false), loadError = ref("");
async function reload() {
  if (loading.value) return;
  loading.value = true;
  loadError.value = "";
  try { await refreshCrafts(); }
  catch (e) { loadError.value = e.message || "加载失败，请稍后重试"; }
  finally { loading.value = false; }
}
const filtered = computed(() =>
  store.crafts.filter(
    (c) =>
      (filter.value === "全部" || c.style === filter.value) &&
      (c.name + " " + (c.code || c.id)).includes(query.value.trim()),
  ),
);
onShow(reload);
</script>
<style scoped>
.content {
  padding-bottom: 120rpx;
}
.source-filters .pill {
  min-width: 114rpx;
}
.library-empty {
  margin-top: 40rpx;
  min-height: 475rpx;
}
.draw-fab {
  position: fixed;
  right: 32rpx;
  bottom: 58rpx;
  padding: 21rpx 28rpx;
  border-radius: 99rpx;
  background: #f3a32a;
  color: #1c1b18;
  box-shadow: 0 12rpx 34rpx #c8842250;
  font-size: 28rpx;
  font-weight: 600;
} /* #ifdef H5 */
@media (min-width: 414px) {
  .draw-fab {
    right: calc((100vw - 414px) / 2 + 18px);
  }
} /* #endif */
.gallery-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  padding: 26rpx 24rpx;
  gap: 24rpx;
}
.gallery-card > view:first-child {
  flex: 1;
  min-width: 0;
}
.gallery-card text {
  display: block;
  color: var(--muted);
  font-size: 25rpx;
  line-height: 1.5;
  margin-top: 6rpx;
}
.gallery-card .gallery-name {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text);
  font-size: 30rpx;
  font-weight: 700;
  margin: 0 0 8rpx;
}
.gallery-end {
  flex-shrink: 0;
  width: 130rpx;
  text-align: right;
}
.gallery-end text:first-child {
  font-size: 22rpx;
  line-height: 1.1;
  color: var(--subtle);
}
.gallery-end text:last-child {
  color: #f5a329;
  white-space: nowrap;
  margin-top: 20rpx;
}
</style>
