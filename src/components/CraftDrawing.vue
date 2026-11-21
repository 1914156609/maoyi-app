<template>
  <canvas
    :id="canvasId"
    :canvas-id="canvasId"
    class="drawing"
    :style="{ width: width + 'px', height: height + 'px' }"
    @touchstart="start"
    @touchmove.stop.prevent="move"
    @touchend="dragging = false"
  />
</template>
<script setup>
import { ref, watch, nextTick, getCurrentInstance, onMounted, onBeforeUnmount } from "vue";
import { paintStructure, paintGarment } from "../lib/drawing.js";
import { paintPattern, patternHeight } from "../lib/pattern-drawing.js";
import { calculateCraft } from "../lib/knitting.mjs";
const props = defineProps({
  craft: { type: Object, default: () => ({}) },
  showText: { type: Boolean, default: true },
  showDimensions: { type: Boolean, default: true },
  locked: { type: Boolean, default: true },
  garment: Boolean,
});
const instance = getCurrentInstance();
const canvasId = "craft-drawing-" + instance.uid,
  width = ref(350),
  height = ref(455);
let resizeTimer;
let ctx,
  dragging = false,
  origin = [0, 0],
  offset = [0, 0];
function draw() {
  if (!ctx) return;
  const calculation = props.craft.calculation || calculateCraft(props.craft);
  const legacySample = !props.craft.measurementBasis && props.craft.parts?.length && !props.craft.density;
  const desired = props.garment ? 420 : legacySample ? 928 : patternHeight(calculation);
  const nextHeight = width.value * desired / 714;
  if (Math.abs(height.value - nextHeight) > 0.1) {
    height.value = nextHeight;
    nextTick(() => {
      clearTimeout(resizeTimer);
      // uni-canvas updates its backing bitmap asynchronously after CSS resize.
      resizeTimer = setTimeout(draw, 100);
    });
    return;
  }
  props.garment
    ? paintGarment(ctx, width.value, height.value, props.craft)
    : (legacySample ? paintStructure : paintPattern)(ctx, width.value, height.value, {
        craft: props.craft,
        showText: props.showText,
        showDimensions: props.showDimensions,
        offsetX: offset[0],
        offsetY: offset[1],
      });
}
function measure() {
  uni.createSelectorQuery().in(instance.proxy).select("#" + canvasId).boundingClientRect((r) => {
    if (!r || !r.width) return;
    width.value = r.width;
    if (!ctx) ctx = uni.createCanvasContext(canvasId, instance.proxy);
    nextTick(draw);
  }).exec();
}
onMounted(async () => { await nextTick(); measure(); uni.onWindowResize?.(measure); });
onBeforeUnmount(() => { clearTimeout(resizeTimer); uni.offWindowResize?.(measure); });

watch(
  () => [props.craft, props.showText, props.showDimensions],
  () => nextTick(draw),
  { deep: true },
);
function start(e) {
  if (props.locked) return;
  const t = e.touches[0];
  dragging = true;
  origin = [t.x - offset[0], t.y - offset[1]];
}
function move(e) {
  if (!dragging || props.locked) return;
  const t = e.touches[0];
  offset = [t.x - origin[0], t.y - origin[1]];
  draw();
}
function exportImage() {
  return new Promise((resolve, reject) =>
    uni.canvasToTempFilePath(
      { canvasId, destWidth: Math.round(width.value * 3), destHeight: Math.round(height.value * 3), success: (r) => resolve(r.tempFilePath), fail: reject },
      instance.proxy,
    ),
  );
}
defineExpose({ exportImage });
</script>
<style scoped>
.drawing {
  display: block;
  width: 100% !important;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 14rpx;
  overflow: hidden;
}
</style>
