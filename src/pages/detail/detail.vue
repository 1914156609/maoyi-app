<template>
  <view class="screen"
    ><AppHeader title="工艺详情" /><view v-if="craft && !error" class="content"
      ><view class="panel"
        ><view class="detail-top"
          ><text>{{ craft.name }}</text
          ><text :class="['source-badge', craft.status]">{{
            statusLabels[craft.status]
          }}</text></view
        ><text class="detail-meta"
          >{{ craft.code || craft.id }} · {{ craft.owner || "我" }} ·
          {{ formatDate(craft.createdAt) }}</text
        ><view class="detail-info"
          ><text>款式</text
          ><text
            >{{ craft.style }} · {{ craft.neck }} · {{ craft.sleeve }} ·
            {{ craft.length }}</text
          ></view
        ><view class="detail-info"
          ><text>毛料</text
          ><text
            >{{ craft.material || "未指定" }}（{{
              craft.color || "未指定"
            }}）</text
          ></view
        ><view class="detail-info"
          ><text>针型</text
          ><text
            >{{ craft.gauge || "未指定" }}（密度 {{ craft.density || 0 }} 针 ·
            {{ craft.rowDensity || 0 }} 行/10cm）</text
          ></view
        ><view class="detail-info"
          ><text>尺寸</text
          ><text
            >胸宽（平铺） {{ flatChest }}cm · 衣长 {{ base.bodyLength || 0 }}cm<text v-if="hasSleeve"> · 袖长 {{ base.sleeveLength || 0 }}cm</text></text
          ></view
        ></view
      ><ApprovalHistory :history="craft.history || []" :status="craft.status" :loading="historyLoading" :error="historyError" @retry="reload" /><view class="panel detail-sizes"
        ><text class="panel-title">工艺尺寸</text
        ><view v-if="craft.hasSizes === false" class="sizes-empty"
          >暂无尺寸数据</view
        >
        <view v-for="g in detailGroups" v-else :key="g.label"
          ><view class="bar-heading">{{ g.label }}</view
          ><view class="dimension-line" v-for="f in g.fields" :key="f[0]"
            ><text>{{ f[1] }}</text
            ><text>{{ f[0] === 'chest' ? flatChest : (craft.sizes[f[0]] || 0) }}cm</text></view
          ></view
        ></view
      ><view class="panel"
        ><text class="panel-title">工艺图</text
        ><CraftDrawing ref="drawing" :craft="craft" /><text v-if="craft.calculation?.errors.length" class="error-text">{{ craft.calculation.errors[0] }}</text></view
      ><view class="panel"
        ><text class="panel-title">工艺明细（针数 / 行数 / 收放针）</text
        ><view v-if="craft.calculation?.adjustments.length" class="adjustment-notes"><text v-for="note in craft.calculation.adjustments" :key="note">{{ note }}</text></view><view class="detail-table"
          ><view class="detail-table-row table-head"
            ><text>部位</text><text>针数 / 行数</text><text>说明</text></view
          ><view
            class="detail-table-row"
            v-for="(row, i) in craft.parts || []"
            :key="i"
            ><text>{{ row[0] }}</text
            ><text>{{ row[1] }}</text
            ><text>{{ row[2] }}</text></view
          ></view
        ></view
      ><view class="panel"
        ><view class="model-heading"
          ><text class="panel-title">毛衣模型图</text
          ><button role="button" tabindex="0" @click="model">
            生成模型 ›
          </button></view
        ><view @click="model"><CraftDrawing :craft="craft" garment /></view
        ><text class="model-caption"
          >点击模型图可前往生成 2D / 3D 毛衣模型</text
        ></view
      ><button
        role="button"
        tabindex="0"
        class="primary"
        :disabled="busy || craft.status === 'approved' || craft.status === 'pending'"
        @click="submit"
      >
        {{
          craft.status === "approved"
            ? "已通过审批"
            : craft.status === "pending"
              ? "待审核"
              : "提交审批"
        }}</button
      ><button v-if="['draft','rejected'].includes(craft.status)" role="button" tabindex="0" class="secondary" @click="navigate('create', 'id=' + encodeURIComponent(craft.id))">编辑工艺</button><view class="detail-actions"
        ><button
          role="button"
          tabindex="0"
          class="secondary"
          @click="exportImage"
        >
          导出</button
        ><button
          role="button"
          tabindex="0"
          class="secondary"
          @click="navigate('share', 'id=' + encodeURIComponent(craft.id))"
        >
          分享</button
        ><button role="button" tabindex="0" class="secondary" @click="model">
          生成模型
        </button></view
      ></view
    ><view v-else class="content"
      ><AccessEmpty dashed compact icon="🧷" :title="loading ? '正在加载…' : error || '暂无数据'" /><button v-if="error" role="button" tabindex="0" class="secondary" @click="reload">重新加载</button></view
  ></view>
</template>
<script setup>
import { ref, computed } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import CraftDrawing from "../../components/CraftDrawing.vue";
import ApprovalHistory from "../../components/ApprovalHistory.vue";
import { allFields, groups, statusLabels, formatDate } from "../../lib/domain.mjs";
import {
  store,
  navigate,
  changeStatus,
  notify,
  recordViewed,
  fetchCraft,
} from "../../lib/store.js";
import { authenticated } from "../../lib/session.js";
const id = ref(""),
  drawing = ref(null),
  busy = ref(false),
  loading = ref(false),
  error = ref(""),
  historyLoading = ref(false),
  historyError = ref(""),
  craft = computed(() =>
    authenticated.value ? (store.details[id.value] || store.crafts.find((c) => c.id === id.value)) : null,
  ),
  base = computed(() => craft.value?.baseSizes || craft.value?.sizes || {});
const flatChest = computed(() => craft.value?.calculation?.input.sizes.chest ?? base.value.chest ?? 0);
const hasSleeve = computed(() => craft.value?.style !== '背心' && craft.value?.sleeve !== '无袖');
const detailGroups = computed(() => groups.filter(g => !(g.label === '袖子尺寸' && !hasSleeve.value) && !(g.label.startsWith('门襟') && craft.value?.style !== '开衫')).map(g=>({...g,fields:g.fields.filter(f=> !['bodyRib','sleeveRib','placketWidth','placketLength'].includes(f[0]) || craft.value?.sizes[f[0]])})));
onLoad((o) => {
  id.value = o.id || "";
  if (authenticated.value) recordViewed(id.value);
});
function model() {
  navigate("model", "id=" + encodeURIComponent(id.value));
}
async function reload() {
 if(!id.value || !authenticated.value)return;
 loading.value=true;historyLoading.value=true;error.value='';
 try{await fetchCraft(id.value); historyError.value=''; recordViewed(id.value);}catch(e){error.value=e.message;notify(e.message);}
 finally{loading.value=false;historyLoading.value=false;}
}
onShow(reload);
async function updateStatus(status,note='') {
 if(busy.value)return;
 busy.value=true;
 try{
  await changeStatus(id.value,status,note);
  historyLoading.value=true;
  historyError.value='';
  try{await fetchCraft(id.value);}catch{historyError.value='审批记录加载失败，请重新加载';}
  notify(status==='pending'?'已提交审批':status==='approved'?'已通过审批':'已驳回');
 }
 catch(e){notify(e.message);if(e.status===409)await fetchCraft(id.value).catch(()=>{});}
 finally{historyLoading.value=false;busy.value=false;}
}
function submit() {
 if(busy.value)return;
 uni.showModal({title:'提交审批',content:'确定提交该工艺单进行审批？',confirmColor:'#f1a12b',success:r=>{if(r.confirm)updateStatus('pending');}});
}

async function exportImage() {
  try {
    if (craft.value.calculation?.errors.length) return notify("请先补全尺寸与密度，再导出工艺图");
    const path = await drawing.value.exportImage();
    // #ifdef MP-WEIXIN
    await uni.saveImageToPhotosAlbum({ filePath: path });
    notify("已保存到相册");
    // #endif
    // #ifdef H5
    const a = document.createElement("a");
    a.href = path;
    a.download = craft.value.name + "-工艺图.png";
    a.click();
    // #endif
  } catch (e) {
    notify("导出未完成");
  }
}
</script>
<style scoped>
.sizes-empty {
  background: var(--input);
  min-height: 160rpx;
  border: 2rpx dashed var(--line);
  border-radius: 12rpx;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27rpx;
}
.detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.detail-top > text:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 32rpx;
  font-weight: 700;
}
.detail-meta {
  overflow-wrap: anywhere;
  display: block;
  color: var(--subtle);
  font-size: 24rpx;
  margin: 14rpx 0 0;
}
.detail-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 13rpx 0;
  border-bottom: 1px solid var(--line);
  font-size: 27rpx;
}
.detail-info:last-child {
  border: 0;
}
.detail-info > text:first-child {
  color: var(--muted);
  flex-shrink: 0;
}
.detail-info > text:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
}
.detail-sizes .panel-title {
  margin-bottom: 18rpx;
}
.detail-sizes .bar-heading {
  font-size: 29rpx;
  margin: 0;
}
.dimension-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 62rpx;
  border-bottom: 1px solid var(--line);
  font-size: 28rpx;
}
.dimension-line:last-child {
  border: 0;
  margin-bottom: 16rpx;
}
.dimension-line text:last-child {
  font-size: 32rpx;
  font-weight: 700;
  color: #f4a529;
}
.detail-table {
  border: 1px solid var(--line);
  border-radius: 14rpx;
  background: var(--input);
  overflow: hidden;
}
.detail-table-row {
  display: grid;
  grid-template-columns: 24% 34% 42%;
  border-bottom: 1px solid var(--line);
  padding: 16rpx;
  font-size: 24rpx;
  line-height: 1.4;
}
.detail-table-row:last-child {
  border: 0;
}
.detail-table-row > text {
  min-width: 0;
  overflow-wrap: anywhere;
  padding-right: 12rpx;
}
.detail-table-row > text:nth-child(2) {
  color: #f4a529;
}
.detail-table-row > text:last-child {
  color: var(--muted);
}
.detail-table-row.table-head {
  background: #1a2130;
  color: var(--muted);
}
.detail-table-row.table-head > text {
  color: var(--muted);
}
.model-heading {
  display: flex;
  justify-content: space-between;
}
.model-heading button {
  color: #f4a529;
  font-size: 25rpx;
}
.model-caption {
  display: block;
  text-align: center;
  color: var(--muted);
  font-size: 24rpx;
  margin-top: 14rpx;
}
.detail-actions {
  display: flex;
  gap: 18rpx;
  padding: 0 8rpx;
}
.detail-actions .secondary {
  min-width: 0;
  padding-left: 12rpx;
  padding-right: 12rpx;
  font-weight: 500;
}
.primary[disabled] {
  background: linear-gradient(100deg, #ffa600, #e28300);
  opacity: 0.45;
  color: #31271b;
}
.adjustment-notes { color: var(--muted); font-size: 22rpx; line-height: 1.7; margin-bottom: 20rpx; }
.adjustment-notes text { display: block; overflow-wrap: anywhere; }
</style>
