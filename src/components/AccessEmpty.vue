<template>
  <view :class="['access-empty', { dashed, compact }]"
    ><text class="access-icon">{{ icon }}</text
    ><text v-if="title" class="access-title">{{ title }}</text
    ><text v-if="description" class="access-description">{{ description }}</text
    ><button
      role="button"
      tabindex="0"
      v-if="action"
      class="secondary"
      @click="navigate('login')"
    >
      {{ action }}
    </button></view
  >
</template>
<script setup>
import { navigate } from "../lib/store.js";
defineProps({
  icon: { type: String, default: "🔒" },
  title: String,
  description: String,
  action: String,
  dashed: Boolean,
  compact: Boolean,
});
</script>
<style scoped>
.access-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  min-height: 450rpx;
  gap: 24rpx;
}
.access-empty.dashed {
  border: 2rpx dashed #2c3341;
  border-radius: 14rpx;
  background: #10141c;
}
.access-icon {
  font-size: 48rpx;
  line-height: 1.3;
}
.access-title {
  font-size: 27rpx;
}
.access-description {
  font-size: 24rpx;
  line-height: 1.5;
  align-self: stretch;
}
.access-empty .secondary {
  width: 70%;
  margin-top: 10rpx;
  min-height: 84rpx;
  font-weight: 500;
}
.access-empty.compact {
  min-height: 365rpx;
}
</style>
