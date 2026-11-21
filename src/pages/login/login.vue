<template>
  <view class="screen"
    ><AppHeader title="登录" /><view class="content"
      ><view class="login-brand"
        ><view class="brand-icon">🧶</view
        ><text class="brand-name">毛衣姑娘</text
        ><text class="brand-caption">毛衣工艺设计与模型展示</text></view
      ><view class="panel login-panel"
        ><view class="login-tabs"
          ><button
            role="button"
            tabindex="0"
            v-for="t in ['微信授权登录', '员工登录']"
            :key="t"
            :class="{ active: mode === t }"
            @click="mode = t"
          >
            {{ t }}
          </button></view
        ><view class="login-inner"
          ><template v-if="mode === '微信授权登录'"
            ><text class="login-description"
              >使用微信账号一键授权登录，无需注册</text
            ><button
              role="button"
              tabindex="0"
              class="primary"
              :disabled="busy"
              @click="login"
            >
              微信一键授权登录
            </button></template
          ><template v-else
            ><text class="field-label">账号</text
            ><input
              class="input"
              v-model="account"
              aria-label="员工账号"
              maxlength="20"
              placeholder="请输入员工账号"
              placeholder-class="input-placeholder"
            /><text class="field-label password-label">密码</text
            ><input
              class="input"
              v-model="password"
              password
              aria-label="密码"
              maxlength="20"
              placeholder="请输入密码"
              placeholder-class="input-placeholder"
            /><text class="employee-tip"
              >员工账号需管理员审核通过后方可登录</text
            ><button
              role="button"
              tabindex="0"
              class="primary"
              :disabled="busy"
              @click="login"
            >
              登 录
            </button></template
          ><view class="agreement"
            ><checkbox-group @change="agreed = $event.detail.value.length > 0"
              ><checkbox
                value="agree"
                :checked="agreed"
                color="#f4a329" /></checkbox-group
            ><text
              >我已阅读并同意
              <text class="legal-link" @click="navigate('legal', 'type=terms')"
                >《用户协议》</text
              >
              和
              <text
                class="legal-link"
                @click="navigate('legal', 'type=privacy')"
                >《隐私政策》</text
              ></text
            ></view
          ></view
        ></view
      ></view
    ></view
  >
</template>
<script setup>
import { ref } from "vue";
import AppHeader from "../../components/AppHeader.vue";
import { navigate, notify } from "../../lib/store.js";
import { apiBase, signIn } from "../../lib/session.js";
const mode = ref("微信授权登录"),
  account = ref(""),
  password = ref(""),
  agreed = ref(false),
  busy = ref(false);
async function login() {
  if(busy.value)return;
  if (!agreed.value) return notify("请先阅读并同意用户协议和隐私政策");
  busy.value = true;
  try {
    if (mode.value === "员工登录") {
      const username = account.value.trim();
      if (!username || !password.value)
        throw new Error("请输入账号和密码");
      if (username.length < 2 || username.length > 20)
        throw new Error("员工账号长度须为2至20个字符");
      if (password.value.length < 5 || password.value.length > 20)
        throw new Error("密码长度须为5至20个字符");
      await signIn({
        type: "employee",
        account: username,
        password: password.value,
      });
    } else {
      // #ifdef MP-WEIXIN
      const wx = await uni.login({ provider: "weixin" });
      await signIn({ type: "wechat", code: wx.code });
      // #endif
      // #ifdef H5
      throw new Error("请在微信小程序内使用微信授权登录，或选择员工登录");
      // #endif
    }
    getCurrentPages().length > 1 ? uni.navigateBack() : uni.reLaunch({ url: "/pages/index/index" });
  } catch (e) {
    notify(e.message || "登录失败，请重试");
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.login-brand {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 60rpx 0 32rpx;
  gap: 24rpx;
}
.brand-icon {
  width: 140rpx;
  height: 140rpx;
  border-radius: 40rpx;
  border: 2rpx solid #745a34;
  background: linear-gradient(135deg, #202735, #181d26);
  font-size: 66rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  color: #f6a021;
  font-size: 44rpx;
  font-weight: 700;
}
.brand-caption {
  color: var(--muted);
  font-size: 26rpx;
  margin-top: -12rpx;
}
.login-panel {
  padding: 28rpx;
}
.login-tabs {
  display: flex;
  border-bottom: 1px solid var(--line);
}
.login-tabs button {
  width: 50%;
  color: var(--muted);
  font-size: 29rpx;
  font-weight: 600;
  padding: 22rpx 0 27rpx;
  position: relative;
}
.login-tabs .active {
  color: #f4a328;
}
.login-tabs .active:after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 30%;
  width: 40%;
  height: 4rpx;
  background: #f4a328;
  border-radius: 9rpx;
  border: 0;
  transform: none;
  top: auto;
}
.login-inner {
  padding: 40rpx 6rpx 0;
}
.login-description {
  display: block;
  color: var(--muted);
  font-size: 28rpx;
  text-align: center;
  margin-bottom: 40rpx;
}
.agreement {
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: 25rpx;
  white-space: normal;
  gap: 10rpx;
  margin-top: 42rpx;
}
.agreement checkbox {
  transform: scale(0.8);
  transform-origin: left center;
  width: 34rpx;
}
.agreement :deep(.uni-checkbox-input) {
  background: transparent;
  border-color: #4c5362;
}
.legal-link {
  color: #f4a329;
  text-decoration: underline;
  text-underline-offset: 6rpx;
}
.password-label {
  margin-top: 30rpx;
}
.employee-tip {
  display: block;
  text-align: center;
  color: var(--muted);
  font-size: 24rpx;
  margin-top: 28rpx;
}
.login-inner .input {
  height: 82rpx;
}
.login-inner .primary {
  margin-top: 24rpx;
}
</style>
