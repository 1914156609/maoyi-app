<template>
  <view class="empty"
    ><text class="empty-icon">{{ icon }}</text
    ><text class="empty-label">{{ title }}</text
    ><text v-if="description" class="empty-desc">{{ description }}</text
    ><button
      role="button"
      tabindex="0"
      v-if="action"
      class="secondary"
      @click="$emit('action')"
    >
      {{ action }}
    </button></view
  >
</template>
<script setup>
defineProps({
  title: { type: String, default: "暂无数据" },
  icon: { type: String, default: "🧷" },
  description: String,
  action: String,
});
defineEmits(["action"]);
</script>
