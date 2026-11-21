<template>
  <view class="screen"
    ><AppHeader title="设置" /><view class="content"
      ><view class="panel source-menu"
        ><view class="setting-row"
          ><view class="menu-name"
            ><text class="menu-icon">🔔</text><text>消息通知</text></view
          ><switch
            :checked="notifications"
            color="#f6a423"
            @change="setNotifications" /></view
        ><button role="button" tabindex="0" class="setting-row" @click="clear">
          <view class="menu-name"
            ><text class="menu-icon">🧹</text><text>清除缓存</text></view
          ><text class="muted">{{ cacheSize }}KB ›</text>
        </button></view
      ><view class="panel source-menu"
        ><button role="button" tabindex="0" class="setting-row" @click="about">
          <view class="menu-name"
            ><text class="menu-icon">ℹ️</text><text>关于毛衣姑娘</text></view
          ><text class="muted">v1.0.0 ›</text></button
        ><button
          role="button"
          tabindex="0"
          class="setting-row"
          @click="navigate('legal', 'type=terms')"
        >
          <view class="menu-name"
            ><text class="menu-icon">📄</text><text>用户协议</text></view
          ><text class="chevron">›</text></button
        ><button
          role="button"
          tabindex="0"
          class="setting-row"
          @click="navigate('legal', 'type=privacy')"
        >
          <view class="menu-name"
            ><text class="menu-icon">🔒</text><text>隐私政策</text></view
          ><text class="chevron">›</text>
        </button></view
      ></view
    ></view
  >
</template>
<script setup>
import { ref, nextTick } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import { navigate, notify } from "../../lib/store.js";
import { readPreviewCacheSize, clearPreviewCache } from "../../lib/preview-cache.mjs";
let savedNotifications = true;
try { savedNotifications = uni.getStorageSync("maoyi-notifications") !== false; }
catch { notify("通知设置读取失败，当前使用默认设置"); }
const notifications = ref(savedNotifications),
  cacheSize = ref(0);
const previewStorage = {
  getStorageSync: key => uni.getStorageSync(key),
  removeStorageSync: key => uni.removeStorageSync(key),
};
function refreshCacheSize() {
  try { cacheSize.value = readPreviewCacheSize(previewStorage); }
  catch { cacheSize.value = "—"; }
}
onShow(refreshCacheSize);
async function setNotifications(e) {
  const previous = notifications.value;
  notifications.value = e.detail.value;
  try { uni.setStorageSync("maoyi-notifications", e.detail.value); }
  catch {
    await nextTick();
    notifications.value = previous;
    notify("通知设置未保存，请稍后重试");
  }
}
function clear() {
  uni.showModal({
    title: "清除缓存",
    content: "确定清除缓存？",
    confirmColor: "#f1a12b",
    success: (r) => {
      if (r.confirm) {
        try {
          cacheSize.value = clearPreviewCache(previewStorage);
          notify("缓存已清除");
        } catch {
          refreshCacheSize();
          notify("清除缓存失败，请稍后重试");
        }
      }
    },
  });
}
function about() {
  uni.showModal({
    title: "关于毛衣姑娘",
    content:
      "毛衣工艺设计与模型展示工具：工艺计算、工艺图绘制、模型展示、审批与分享。",
    showCancel: false,
    confirmColor: "#f1a12b",
  });
}
</script>
