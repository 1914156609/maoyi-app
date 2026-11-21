<template>
  <view class="screen"
    ><AppHeader title="工艺分享" /><view class="content"
      ><view v-if="authenticated && selection && !loading && !loadError" class="panel"
        ><text class="panel-title">分享链接</text
        ><view class="share-link">{{ link }}</view
        ><view class="share-meta"
          ><text>工艺单：{{ selection.name }}</text
          ><text class="source-badge approved">有效期7天</text></view
        ><text class="panel-title qr-heading">二维码</text
        ><ShareQr :value="link" /><text class="qr-note"
          >微信 / 相机扫码即可打开工艺单</text
        ><button role="button" tabindex="0" class="primary" @click="copy">
          复制链接
        </button></view
      ><view class="panel"
        ><text class="panel-title">{{
          selection ? "换一个工艺单" : "选择要分享的工艺单"
        }}</text
        ><AccessEmpty
          v-if="!authenticated"
          class="share-access"
          description="登录后可选择自己的工艺单并生成分享链接。"
          action="登录后创建分享" /><view v-else-if="loading || loadError"
          ><AccessEmpty compact icon="🧷" :title="loading ? '正在加载…' : loadError" />
          <button v-if="loadError" role="button" tabindex="0" class="secondary" @click="reload">重新加载</button>
        </view><template v-else
          ><button
            role="button"
            tabindex="0"
            v-for="c in store.crafts"
            :key="c.id"
            class="share-choice"
            :disabled="busy"
            @click="select(c)"
          >
            <text :class="['radio', { selected: selection?.id === c.id }]">{{
              selection?.id === c.id ? "✓" : ""
            }}</text
            ><view
              ><text>{{ c.name }}</text
              ><text class="share-code"
                >{{ c.code || c.id }} · {{ c.style }} · {{ c.neck }}</text
              ></view
            ></button
          ><AccessEmpty
            v-if="!store.crafts.length"
            compact
            icon="🧷"
            title="暂无数据" /></template></view
      ><view class="panel"
        ><text class="panel-title">分享说明</text
        ><text class="share-notes"
          >· 链接和二维码可发送给车间或客户在线查看工艺单 ·
          分享页展示工艺名称、参数、尺寸和工艺明细，请确认内容适合接收人查看 ·
          链接有效期 7 天，到期自动失效</text
        ></view
      ></view
    ></view
  >
</template>
<script setup>
import { ref, watch } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import ShareQr from "../../components/ShareQr.vue";
import { authenticated, session } from "../../lib/session.js";
import { store, notify, refreshCrafts } from "../../lib/store.js";
import { createShare } from "../../lib/sharing.js";
const selection = ref(null),
  link = ref("");
const busy=ref(false);
const loading=ref(false), loadError=ref("");
let initialId="";
watch(() => [session.token, session.review], () => {
  selection.value = null;
  link.value = "";
});
async function select(c) {
 if(busy.value || loading.value || loadError.value || !authenticated.value)return;
 busy.value=true;
 try { const result=await createShare(c); selection.value=c; link.value=result.url; uni.pageScrollTo({scrollTop:0,duration:0}); }
 catch(e){notify(e.message);}finally{busy.value=false;}
}
function copy() {
  uni.setClipboardData({
    data: link.value,
    success: () => notify("链接已复制"),
    fail: () => notify("复制未完成，请重试"),
  });
}
async function reload() {
  if (loading.value) return;
  loading.value = true;
  loadError.value = "";
  try { await refreshCrafts(); }
  catch (e) { loadError.value = e.message || "加载失败，请稍后重试"; }
  finally { loading.value = false; }
  if (!loadError.value && initialId && authenticated.value) {
    const id = initialId;
    initialId = "";
    const craft = store.crafts.find(c => c.id === id);
    if (craft) await select(craft);
  }
}
onLoad(o => { initialId = o.id || ""; });
onShow(reload);
</script>
<style scoped>
.share-access {
  min-height: 350rpx;
  text-align: center;
}
.share-notes {
  display: block;
  color: var(--muted);
  font-size: 25rpx;
  line-height: 1.9;
  white-space: pre-line;
}
.share-choice {
  display: flex;
  gap: 22rpx;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 25rpx 0;
  border-bottom: 1px solid var(--line);
  font-size: 28rpx;
}
.share-choice:last-child {
  border: 0;
}
.share-choice > view {
  min-width: 0;
  flex: 1;
  white-space: normal;
  overflow-wrap: anywhere;
}
.radio {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2rpx solid #2d3544;
  border-radius: 50%;
  flex-shrink: 0;
}
.radio.selected {
  background: #ffa600;
  border-color: #ffa600;
  color: #15171c;
  font-size: 29rpx;
}
.share-code {
  display: block;
  color: var(--muted);
  font-size: 25rpx;
  margin-top: 5rpx;
}
.share-link {
  padding: 22rpx;
  border: 2rpx dashed #f1a12b;
  border-radius: 14rpx;
  color: #f1a12b;
  word-break: break-all;
  font-size: 26rpx;
  line-height: 1.5;
  background: var(--input);
}
.share-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 25rpx;
  color: var(--muted);
  margin-top: 16rpx;
  gap: 10rpx;
}
.share-meta > text:first-child {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
.share-meta .source-badge {
  flex-shrink: 0;
}
.qr-heading {
  margin: 32rpx 0 0;
}
.qr-note {
  display: block;
  text-align: center;
  color: var(--muted);
  font-size: 24rpx;
  margin: 4rpx 0 24rpx;
}
</style>
