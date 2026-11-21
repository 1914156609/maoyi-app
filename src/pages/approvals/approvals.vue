<template>
  <view class="screen with-tabs"
    ><AppHeader title="工艺审批" :back="false" /><view
      class="content approval-content"
      ><AccessEmpty
        v-if="!authenticated"
        dashed
        class="approval-access"
        description="审批页面可预览。登录后，主管和超级管理员可处理待审批工艺。"
        action="登录后查看"
      /><AccessEmpty
        v-if="!authenticated"
        dashed
        compact
        class="approval-empty"
        icon="📭"
        title="暂无审批"
      /><view v-if="authenticated && !canApprove" class="permission-empty"
        >仅主管和超级管理员可以审批工艺单</view
      ><template v-if="canApprove"><CraftCard v-for="c in pending" :key="c.id" :craft="c" />
      <AccessEmpty v-if="!loading && !pending.length" dashed compact icon="📭" :title="error || '暂无审批'" /></template></view
    ><BottomNav active="approvals"
  /></view>
</template>
<script setup>
import AppHeader from "../../components/AppHeader.vue";
import BottomNav from "../../components/BottomNav.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import { ref } from "vue";
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import CraftCard from "../../components/CraftCard.vue";
import { api } from "../../lib/client.js";
import { notify } from "../../lib/store.js";
import { authenticated, canApprove } from "../../lib/session.js";
const pending=ref([]),loading=ref(false),error=ref('');
let poll;
async function refresh(){if(!canApprove.value)return;loading.value=true;try{pending.value=(await api('/approvals')).crafts;error.value='';}catch(e){error.value=e.message;notify(e.message);}finally{loading.value=false;}}
const stop=()=>{clearInterval(poll);poll=null;};
onShow(()=>{stop();refresh();if(canApprove.value)poll=setInterval(refresh,15000);});
onHide(stop);onUnload(stop);
</script>
<style scoped>
.approval-content {
  padding-top: 24rpx;
}
.approval-access {
  min-height: 512rpx;
}
.approval-empty {
  margin-top: 24rpx;
}
.permission-empty {
  border: 2rpx dashed #2c3341;
  border-radius: 14rpx;
  background: #10141c;
  min-height: 280rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 27rpx;
}
</style>
