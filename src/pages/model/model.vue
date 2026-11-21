<template>
  <view class="screen"
    ><AppHeader title="毛衣模型" /><view class="content"
      ><view v-if="loading || loadError" class="panel"
        ><AccessEmpty compact icon="🧊" :title="loading ? '正在加载工艺…' : loadError" />
        <button v-if="loadError" class="secondary" @click="load">重新加载</button>
      </view><template v-else><view class="panel parameters"
        ><text class="panel-title">模型参数</text
        ><view class="choice-group" v-for="g in choices" :key="g.key"
          ><text class="choice-label">{{ g.label }}</text
          ><view class="choices"
            ><button
              role="button"
              tabindex="0"
              v-for="v in g.values"
              :key="v"
              :class="['pill', { selected: values[g.key] === v }]"
              @click="values[g.key] = v"
            >
              {{ v }}
            </button></view
          ></view
        ></view
      ><button
        role="button"
        tabindex="0"
        class="primary generate"
        @click="generated = true"
      >
        生成模型</button
      ><view class="panel"
        ><text class="panel-title">模型展示</text
        ><AccessEmpty
          compact
          dashed
          :icon="generated ? '🧶' : '🧊'"
          :title="
            generated
              ? '暂无可匹配的模型，请联系管理员添加模型'
              : '请先选择参数'
          " /></view
      ><view class="panel sizes"
        ><text class="panel-title">尺寸参数</text
        ><view class="slider-row" v-for="f in dimensions" :key="f.key"
          ><text>{{ f.label }}</text
          ><slider
            :aria-label="f.label"
            :value="sizes[f.key]"
            :min="f.min"
            :max="f.max"
            :step="0.5"
            :block-size="20"
            activeColor="#f9a31b"
            backgroundColor="#f9a31b"
            blockColor="#fff"
            @changing="sizes[f.key] = $event.detail.value"
            @change="sizes[f.key] = $event.detail.value"
          /><text class="slider-value">{{ sizes[f.key] }}cm</text></view
        ></view
      ></template></view
    ></view
  >
</template>
<script setup>
import { reactive, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppHeader from "../../components/AppHeader.vue";
import AccessEmpty from "../../components/AccessEmpty.vue";
import { fetchCraft } from "../../lib/store.js";
const choices = [
  { key: "style", label: "款式", values: ["套头", "开衫", "背心"] },
  { key: "neck", label: "领型", values: ["圆领", "V领", "尖领", "高领"] },
  { key: "sleeve", label: "袖型", values: ["长袖", "短袖", "无袖"] },
  { key: "length", label: "长度", values: ["短款", "常规", "加长"] },
  {
    key: "color",
    label: "颜色",
    values: ["燕麦色", "墨绿色", "米白色", "黑色", "焦糖色"],
  },
  {
    key: "material",
    label: "毛料",
    values: ["美丽诺羊毛", "羊绒混纺", "棉麻混纺", "腈纶膨体纱", "牦牛绒"],
  },
  {
    key: "gauge",
    label: "针型",
    values: ["7针", "9针", "12针", "14针", "16针"],
  },
  { key: "size", label: "尺寸", values: ["S", "M", "L", "XL"] },
];
const values = reactive({
    style: "套头",
    neck: "圆领",
    sleeve: "长袖",
    length: "常规",
    color: "燕麦色",
    material: "美丽诺羊毛",
    gauge: "12针",
    size: "M",
  }),
  generated = ref(false),
  loading = ref(false),
  loadError = ref('');
let craftId = '';
const dimensions = [
  { key: "bodyLength", label: "衣长", value: 60, min: 0, max: 120 },
  { key: "chest", label: "胸围", value: 100, min: 0, max: 140 },
  { key: "shoulder", label: "肩宽", value: 40, min: 0, max: 60 },
  { key: "armhole", label: "挂肩", value: 20, min: 0, max: 30 },
  { key: "neckWidth", label: "领宽", value: 22, min: 0, max: 30 },
  { key: "frontNeckDepth", label: "前领深", value: 7, min: 0, max: 20 },
  { key: "backNeckDepth", label: "后领深", value: 2, min: 0, max: 10 },
  { key: "sleeveLength", label: "袖长", value: 55, min: 0, max: 80 },
  { key: "sleeveCapHeight", label: "袖山高", value: 15, min: 0, max: 30 },
  { key: "sleeveCapWidth", label: "袖山宽", value: 18, min: 0, max: 30 },
];
const sizes = reactive(
  Object.fromEntries(dimensions.map((f) => [f.key, f.value])),
);
onLoad(async (o) => {
  craftId = o.id || '';
  await load();
});
async function load() {
  if (!craftId || loading.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const c = await fetchCraft(craftId);
    if (!c) throw new Error('工艺单不存在');
    for (const key of ["style", "neck", "sleeve", "length"])
      if (c[key]) values[key] = c[key];
    for (const key of ["color", "material", "gauge"])
      values[key] = c[key] || "";
    const basis = c.measurementBasis || 'circumference';
    for (const field of dimensions) {
      const raw = c.sizes?.[field.key];
      const value = raw !== '' && raw != null ? raw : c.baseSizes?.[field.key];
      const number = value !== '' && value != null ? Number(value) : 0;
      const cm = Number.isFinite(number) && number >= 0 ? number : 0;
      sizes[field.key] = field.key === 'chest' && basis === 'flat' ? cm * 2 : cm;
      field.max = Math.max(field.max, sizes[field.key]);
    }
  } catch (e) { loadError.value = e.message || '工艺加载失败'; }
  finally { loading.value = false; }
}
</script>
<style scoped>
.parameters {
  padding-bottom: 54rpx;
}
.parameters .panel-title {
  margin-bottom: 22rpx;
}
.parameters .choice-group {
  margin-top: 26rpx;
}
.parameters .choice-label {
  font-size: 25rpx;
  margin-bottom: 12rpx;
}
.parameters .pill {
  min-width: 94rpx;
  padding: 10rpx 26rpx;
  min-height: 56rpx;
  font-size: 25rpx;
}
.parameters .choices {
  gap: 8rpx 14rpx;
}
.generate {
  margin: 32rpx 0 30rpx;
}
.sizes .panel-title {
  margin-bottom: 20rpx;
}
.slider-row {
  display: flex;
  align-items: center;
  height: 42rpx;
  color: var(--muted);
  font-size: 24rpx;
}
.slider-row > text:first-child {
  width: 130rpx;
  flex-shrink: 0;
}
.slider-row slider {
  flex: 1;
  margin: 0 22rpx 0 28rpx;
}
.slider-value {
  color: #f6a324;
  width: 118rpx;
  text-align: right;
  flex-shrink: 0;
}
</style>
