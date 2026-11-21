<template>
  <view class="header" :style="{ paddingTop: statusHeight + 'px' }"
    ><view class="header-row"
      ><button
        role="button"
        tabindex="0"
        v-if="back"
        class="back"
        aria-label="返回"
        @click="goBack"
      >
        ‹</button
      ><text class="header-title">{{ title }}</text></view
    ><!-- #ifdef H5 --><view class="capsule" aria-hidden="true"
      ><view class="dots"><text>•</text><text>●</text><text>•</text></view
      ><view class="capsule-line" /><view class="minimize" /><view
        class="capsule-line" /><view class="capsule-circle"
        ><view /></view></view
    ><!-- #endif --></view
  >
</template>
<script setup>
defineProps({ title: String, back: { type: Boolean, default: true } });
let statusHeight = 12;
// #ifdef MP-WEIXIN
statusHeight = uni.getSystemInfoSync().statusBarHeight || 24;
// #endif
function goBack() {
  const pages = getCurrentPages();
  pages.length > 1
    ? uni.navigateBack()
    : uni.reLaunch({ url: "/pages/index/index" });
}
</script>
<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--bg);
  padding-bottom: 8rpx;
}
.header-row {
  height: 92rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.header-title {
  font-size: 31rpx;
  font-weight: 700;
  letter-spacing: 0.2rpx;
}
/* #ifdef H5 */
.header-title {
  transform: translateY(12rpx);
}
/* #endif */
.back {
  position: absolute;
  left: 20rpx;
  top: 26rpx;
  border: 1px solid var(--line);
  border-radius: 50%;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--panel);
  color: var(--accent);
  font-size: 48rpx;
  font-weight: 500;
  padding-bottom: 7rpx;
}
.capsule {
  position: absolute;
  z-index: 30;
  right: 10rpx;
  top: 47rpx;
  width: 216rpx;
  height: 58rpx;
  border-radius: 999rpx;
  background: #a5a5a5;
  color: #101214;
  display: flex;
  align-items: center;
  justify-content: space-evenly;
}
.dots {
  display: flex;
  gap: 3rpx;
  align-items: center;
  font-size: 23rpx;
}
.dots text:nth-child(2) {
  font-size: 19rpx;
}
.capsule-line {
  width: 1px;
  height: 31rpx;
  background: #898989;
}
.minimize {
  width: 25rpx;
  height: 5rpx;
  border-radius: 4rpx;
  background: #101214;
}
.capsule-circle {
  width: 31rpx;
  height: 31rpx;
  border-radius: 50%;
  border: 4rpx solid #101214;
  display: flex;
  align-items: center;
  justify-content: center;
}
.capsule-circle view {
  width: 11rpx;
  height: 11rpx;
  background: #101214;
  border-radius: 50%;
}
@media (max-width: 380px) {
  .capsule {
    width: 172rpx;
  }
  .minimize {
    display: none;
  }
  .capsule-line:nth-of-type(4) {
    display: none;
  }
}
</style>
