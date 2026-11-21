<template>
  <view class="calculation-result">
    <view v-if="result" class="panel drawing-panel">
      <text class="panel-title">工艺图</text>
      <CraftDrawing :craft="drawingCraft" :locked="true" />
      <text class="result-note">图形、尺寸与针行标注根据本次填写的数据生成。</text>
    </view>
    <view class="panel results">
      <text class="panel-title">计算结果（各部位加减针）</text>
      <view v-if="!result" class="result-empty">无</view>
      <view v-else class="result-table">
        <view class="result-table-head"><text>部位</text><text>针数 / 行数</text></view>
        <view v-for="(row, i) in result.rows" :key="i" class="result-table-row">
          <view><text>{{ row.label }}</text><text v-if="row.detail" class="row-detail">{{ row.detail }}</text></view>
          <text class="row-output">{{ row.output }}</text>
        </view>
        <text class="result-footer">密度 {{ result.input.density }} 针/10cm · 行数 {{ result.input.rowDensity }} 行/10cm</text>
      </view>
    </view>
    <view v-if="result?.adjustments?.length" class="panel adjustments">
      <text class="panel-title">调针与行数说明</text>
      <text v-for="(adjustment, i) in result.adjustments" :key="i" class="adjustment">{{ adjustment }}</text>
    </view>
  </view>
</template>
<script setup>
import { computed } from 'vue';
import CraftDrawing from './CraftDrawing.vue';
const props = defineProps({ result: { type: Object, default: null } });
const drawingCraft = computed(() => props.result ? { ...props.result.input, calculation: props.result } : {});
</script>
<style scoped>
.calculation-result { margin-top: 30rpx; }
.result-empty { min-height: 160rpx; background: var(--input); border: 1px solid var(--line); border-radius: 14rpx; display: flex; align-items: center; justify-content: center; color: var(--muted); }
.result-table { border: 1px solid var(--line); border-radius: 14rpx; overflow: hidden; background: var(--input); }
.result-table-head, .result-table-row { display: grid; grid-template-columns: minmax(0, 42%) minmax(0, 58%); padding: 18rpx 20rpx; border-bottom: 1px solid var(--line); font-size: 25rpx; line-height: 1.5; overflow-wrap: anywhere; }
.result-table-head { background: #1a2130; color: var(--muted); }
.result-table-row { padding: 20rpx; }
.result-table-row > view { padding-right: 20rpx; min-width: 0; }
.row-output, .result-footer { color: #f6a42c; }
.row-detail, .result-note, .adjustment { display: block; color: var(--muted); font-size: 24rpx; line-height: 1.6; margin-top: 8rpx; overflow-wrap: anywhere; }
.result-note { margin-top: 20rpx; }
.result-footer { font-size: 24rpx; font-weight: 600; background: #1a2130; display: block; padding: 20rpx; line-height: 1.6; }
.adjustment + .adjustment { margin-top: 16rpx; }
</style>
