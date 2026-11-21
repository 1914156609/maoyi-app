<template>
  <view v-if="visible" class="panel approval-panel">
    <text class="panel-title">审批记录</text>
    <text v-if="loading" class="approval-meta">正在加载审批记录…</text>
    <view v-if="error" class="approval-error">
      <text class="error-text">{{ error }}</text>
      <button class="secondary" :disabled="loading" @click="$emit('retry')">重新加载</button>
    </view>
    <view v-for="(entry, index) in entries" :key="`${entry.version || ''}-${entry.at || ''}-${index}`" class="approval-entry">
      <view class="approval-heading">
        <text :class="['source-badge', entry.status]">{{ statusLabels[entry.status] || '审批记录' }}</text>
        <text class="approval-meta">{{ entry.actor || '审批人未记录' }}</text>
      </view>
      <text v-if="entry.at" class="approval-meta approval-time">{{ formatDate(entry.at) }}</text>
      <text v-if="entry.note" class="approval-note">{{ entry.status === 'rejected' ? '驳回原因：' : '备注：' }}{{ entry.note }}</text>
    </view>
    <text v-if="!entries.length && !loading && !error" class="approval-meta">{{ status === 'rejected' ? '暂无可用的驳回记录，请联系审批人。' : '暂无审批记录' }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate, statusLabels } from '../lib/domain.mjs';

const props = defineProps({
  history: { type: Array, default: () => [] },
  status: { type: String, default: 'draft' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
defineEmits(['retry']);
const entries = computed(() => (Array.isArray(props.history) ? props.history : [])
  .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
  .slice()
  .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0)
    || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)));
const visible = computed(() => entries.value.length || props.loading || props.error || ['pending', 'approved', 'rejected'].includes(props.status));
</script>

<style scoped>
.approval-entry { padding: 20rpx 0; border-bottom: 1px solid var(--line); }
.approval-entry:last-child { border-bottom: 0; padding-bottom: 0; }
.approval-heading { display: flex; align-items: center; gap: 16rpx; flex-wrap: wrap; }
.approval-meta { color: var(--muted); font-size: 24rpx; line-height: 1.7; overflow-wrap: anywhere; }
.approval-time { display: block; margin-top: 8rpx; }
.approval-note { display: block; margin-top: 14rpx; font-size: 27rpx; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.approval-error .secondary { margin-top: 18rpx; }
</style>
