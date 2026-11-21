<template>
  <view class="screen with-tabs"
    ><AppHeader title="我的" :back="false" /><view class="content"
      ><view class="panel user" @click="!authenticated && navigate('login')"
        ><view class="avatar">🧶</view
        ><view class="user-copy"
          ><text class="username">{{ currentUser?.name || "未登录" }}</text
          ><view v-if="authenticated" class="user-tags"
            ><text class="source-badge customer">{{ currentUser.role }}</text
            ><text class="source-badge approved">{{
              currentUser.status
            }}</text></view
          ><text v-else class="user-caption">登录后体验完整功能</text></view
        ><button
          role="button"
          tabindex="0"
          v-if="!authenticated"
          class="login-link"
        >
          去登录 ›
        </button></view
      ><view class="panel source-menu"
        ><button
          role="button"
          tabindex="0"
          v-for="item in menus"
          :key="item.page"
          class="setting-row"
          @click="navigate(item.page)"
        >
          <view class="menu-name"
            ><text class="menu-icon">{{ item.icon }}</text
            ><text>{{ item.label }}</text></view
          ><text class="chevron">›</text>
        </button></view
      ><view v-if="authenticated" class="panel source-menu"
        ><button role="button" tabindex="0" class="setting-row" @click="logout">
          <view class="menu-name logout"
            ><text class="menu-icon">🚪</text><text>退出登录</text></view
          ><text class="chevron">›</text>
        </button></view
      ><text class="version">毛衣姑娘 v1.0.0</text></view
    ><BottomNav active="profile"
  /></view>
</template>
<script setup>
import AppHeader from "../../components/AppHeader.vue";
import BottomNav from "../../components/BottomNav.vue";
import { navigate, notify } from "../../lib/store.js";
const menus = [
  { label: "我的工艺", icon: "📐", page: "crafts" },
  { label: "我的分享", icon: "📤", page: "share" },
  { label: "设置", icon: "⚙️", page: "settings" },
];
import { authenticated, currentUser, signOut } from "../../lib/session.js";
function logout() {
  uni.showModal({
    title: "退出登录",
    content: "确定退出登录？",
    confirmColor: "#f1a12b",
    success: (r) => {
      if (r.confirm) signOut().catch(e=>notify(e.message));
    },
  });
}
</script>
<style scoped>
.user {
  display: flex;
  align-items: center;
  gap: 26rpx;
  padding: 28rpx;
}
.avatar {
  background: linear-gradient(135deg, #232c3b, #19202b);
  width: 108rpx;
  height: 108rpx;
  flex-shrink: 0;
  border: 2rpx solid #765c36;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
}
.user-copy {
  flex: 1;
  min-width: 0;
}
.username {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
}
.user-caption {
  display: block;
  font-size: 27rpx;
  color: var(--muted);
  margin-top: 4rpx;
  white-space: nowrap;
}
.login-link {
  color: #f5a72c;
  font-size: 28rpx;
  white-space: nowrap;
}
.version {
  display: block;
  text-align: center;
  font-size: 23rpx;
  color: var(--muted);
  margin-top: 50rpx;
}
.user-tags {
  display: flex;
  gap: 12rpx;
  margin-top: 14rpx;
}
.user-tags .source-badge {
  font-size: 23rpx;
  padding: 4rpx 15rpx;
}
.logout {
  color: #ef727d;
}
</style>
