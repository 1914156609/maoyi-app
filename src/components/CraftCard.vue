<template>
  <button
    role="button"
    tabindex="0"
    :class="['source-craft panel', { recent }]"
    @click="navigate('detail', 'id=' + encodeURIComponent(craft.id))"
  >
    <view class="craft-code-line"
      ><text>{{ craft.code || craft.id }}</text
      ><text v-if="!recent" :class="['source-badge', craft.status]">{{
        statusLabels[craft.status]
      }}</text></view
    ><text class="source-craft-name">{{ craft.name }}</text
    ><text class="source-craft-meta"
      >{{ craft.style }} · {{ craft.neck }} · {{ craft.material || "未指定" }} ·
      {{
        recent
          ? "胸宽（平铺） " + flatChest + "cm"
          : craft.gauge || "未指定"
      }}</text
    ><view v-if="!recent" class="craft-footer"
      ><text
        >{{ craft.owner || "我" }} ·
        {{ formatDate(craft.createdAt).slice(5) }}</text
      ><text>查看详情 ›</text></view
    >
  </button>
</template>
<script setup>
import { computed } from "vue";
import { statusLabels, formatDate } from "../lib/domain.mjs";
import { navigate } from "../lib/store.js";
const props = defineProps({ craft: Object, recent: Boolean });
const flatChest = computed(() => {
  const normalized = props.craft.calculation?.input?.sizes?.chest;
  if (Number.isFinite(normalized)) return normalized;
  const raw = Number(props.craft.baseSizes?.chest ?? props.craft.sizes?.chest ?? 0);
  const basis = props.craft.measurementBasis || (props.craft.id ? 'circumference' : 'flat');
  return Number.isFinite(raw) ? raw / (basis === 'circumference' ? 2 : 1) : 0;
});
</script>
<style scoped>
.source-craft {
  display: block;
  width: 100%;
  text-align: left;
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.recent .source-craft-name,
.recent .source-craft-meta {
  margin-top: 5rpx;
}
.craft-code-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 25rpx;
  gap: 12rpx;
}
.source-craft-name {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 30rpx;
  font-weight: 700;
  margin-top: 14rpx;
}
.source-craft-meta {
  display: block;
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 25rpx;
  margin-top: 14rpx;
}
.craft-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 14rpx;
  border-top: 1px solid var(--line);
  margin-top: 14rpx;
  font-size: 24rpx;
  color: var(--subtle);
}
.craft-footer text:last-child {
  color: #f5a329;
}
</style>
