<template>
  <view class="search-bar"
    ><view class="search-field"
      ><text>🔍</text
      ><input
        :aria-label="placeholder"
        v-model="query"
        :placeholder="placeholder"
        placeholder-class="input-placeholder"
        @confirm="$emit('search', query)" /></view
    ><button
      role="button"
      tabindex="0"
      class="search-action"
      @click="$emit('search', query)"
    >
      搜索</button
    ><button role="button" tabindex="0" class="search-reset" @click="reset">
      重置
    </button></view
  >
</template>
<script setup>
import { ref } from "vue";
defineProps({ placeholder: String });
const emit = defineEmits(["search", "reset"]);
const query = ref("");
function reset() {
  query.value = "";
  emit("reset");
}
</script>
<style scoped>
.search-bar {
  display: flex;
  gap: 24rpx;
  align-items: center;
  padding: 10rpx 0 16rpx;
}
.search-field {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex: 1;
  min-width: 0;
  height: 70rpx;
  padding: 0 24rpx;
  border: 1px solid var(--line);
  border-radius: 99rpx;
  background: var(--panel);
}
.search-field text {
  font-size: 26rpx;
}
.search-field input {
  font-size: 25rpx;
  flex: 1;
  min-width: 0;
}
.search-action,
.search-reset {
  font-size: 27rpx;
  white-space: nowrap;
}
.search-action {
  color: #f5a72a;
}
.search-reset {
  color: var(--muted);
}
</style>
