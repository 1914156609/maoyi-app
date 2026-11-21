<template>
  <canvas
    class="share-qr"
    :id="id"
    :canvas-id="id"
    style="width: 220px; height: 220px"
  />
</template>
<script setup>
import { watch, onMounted, nextTick, getCurrentInstance } from "vue";
import qrcode from "qrcode-generator";
const props = defineProps({ value: String });
const instance = getCurrentInstance(),
  id = "qr-" + instance.uid;
function draw() {
  if (!props.value) return;
  const qr = qrcode(0, "M");
  qr.addData(props.value);
  qr.make();
  const n = qr.getModuleCount(),
    size = 220,
    cell = size / (n + 4),
    ctx = uni.createCanvasContext(id, instance.proxy);
  ctx.setFillStyle("#fff");
  ctx.fillRect(0, 0, size, size);
  ctx.setFillStyle("#111");
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.isDark(y, x))
        ctx.fillRect(
          Math.floor((x + 2) * cell),
          Math.floor((y + 2) * cell),
          Math.ceil(cell),
          Math.ceil(cell),
        );
  ctx.draw();
}
onMounted(() => nextTick(draw));
watch(
  () => props.value,
  () => nextTick(draw),
);
</script>
<style scoped>
.share-qr {
  margin: 32rpx auto 0;
  background: #fff;
}
</style>
