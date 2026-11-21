<template>
  <view class="screen"
    ><AppHeader :title="type === 'privacy' ? '隐私政策' : '用户协议'" /><view
      class="content"
      ><view class="panel legal-panel"
        ><text class="updated">更新日期：2026年10月24日</text
        ><text
          v-for="(block, i) in legalCopy[type]"
          :key="i"
          :class="['legal-block', block.kind]"
          >{{ block.text }}</text
        ></view
      ></view
    ></view
  >
</template>
<script setup>
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import { legalCopy } from "../../lib/legal.js";
const type = ref("terms");
onLoad((o) => {
  if (o.type === "privacy") type.value = "privacy";
});
</script>
<style scoped>
.legal-panel {
  padding: 30rpx;
}
.updated {
  display: block;
  color: var(--muted);
  font-size: 23rpx;
  margin-bottom: 24rpx;
}
.legal-block {
  display: block;
  font-size: 25rpx;
  line-height: 1.95;
  margin-bottom: 20rpx;
}
.heading {
  color: #f4a528;
  font-size: 30rpx;
  font-weight: 700;
  margin-top: 32rpx;
  margin-bottom: 20rpx;
}
.subheading {
  font-weight: 600;
  margin-bottom: 10rpx;
}
.note {
  font-size: 22rpx;
  color: var(--muted);
}
</style>
