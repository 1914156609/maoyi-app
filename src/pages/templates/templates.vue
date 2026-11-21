<template>
  <view class="screen"
    ><AppHeader title="款式模板" /><view class="content template-content"
      ><AccessEmpty dashed compact icon="👕" title="暂无模板" /></view
  ></view>
</template>
<script setup>
import AppHeader from "../../components/AppHeader.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
</script>
<style scoped>
.template-content {
  padding-top: 24rpx;
}
</style>
