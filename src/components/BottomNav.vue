<template>
  <view class="bottom-nav"
    ><button
      role="button"
      tabindex="0"
      v-for="item in tabs"
      :key="item.key"
      :class="['nav-item', { active: active === item.key }]"
      @click="open(item)"
    >
      {{ item.label }}
    </button></view
  >
</template>
<script setup>
const props = defineProps({ active: String });
const tabs = [
  { key: "index", label: "首页" },
  { key: "crafts", label: "工艺" },
  { key: "profile", label: "我的" },
];
function open(item) {
  if (props.active !== item.key)
    uni.redirectTo({ url: `/pages/${item.key}/${item.key}` });
}
</script>
<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 20;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg);
  display: flex;
  height: 100rpx;
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: content-box;
}
.nav-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
  font-weight: 550;
  color: var(--muted);
  padding-top: 6rpx;
}
.nav-item.active {
  color: var(--accent);
}
/* #ifdef H5 */
@media (min-width: 414px) {
  .bottom-nav {
    max-width: 414px;
    margin: 0 auto;
  }
}
/* #endif */
</style>
