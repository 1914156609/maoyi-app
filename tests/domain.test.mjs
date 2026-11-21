import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  buildOriginalResults,
  emptyCraft,
  convertUnit,
  toCm,
  validateCraft,
  allFields,
  craftText,
} from "../src/lib/domain.mjs";
test("字段共21项，含两处螺纹、实际袖口和开衫门襟", () => {
  assert.equal(allFields.length, 21);
  assert.ok(allFields.some((f) => f[0] === "bodyRib"));
  assert.ok(allFields.some((f) => f[0] === "sleeveRib"));
  assert.equal(allFields.find((f) => f[0] === "underarmFlat")[1], "腋下平收");
});
test("针行换算、整围针数与四舍五入", () => {
  const c = emptyCraft();
  Object.assign(c.sizes, {
    bodyLength: "62",
    chest: "100",
    backNeckDepth: "2.5",
    underarmFlat: "2",
    bodyRib: "6",
  });
  const r = calculate(c.sizes, "68", "46");
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.bodyLength, 285);
  assert.equal(r.totals.chest, 680);
  assert.equal(r.totals.backNeckDepth, 12);
  assert.equal(r.totals.underarmFlat, 14);
  assert.equal(r.totals.bodyRib, 28);
});
test("原版寸换算：30寸=99.9cm，68针密度得到679针", () => {
  assert.equal(convertUnit("", "cm", "寸"), "");
  assert.equal(convertUnit("99.9", "cm", "寸"), "30");
  assert.equal(convertUnit("30", "寸", "cm"), "99.9");
  assert.equal(toCm(3, "寸"), 9.99);
  const c = emptyCraft();
  c.sizes.chest = "30";
  assert.equal(calculate(c.sizes, 68, 46, "寸").totals.chest, 679);
  c.sizes.bodyLength = "18.6";
  assert.equal(calculate(c.sizes, 68, 46, "寸").totals.bodyLength, 285);
});
test("拒绝缺失密度、负数、非数与空尺寸", () => {
  const c = emptyCraft();
  assert.equal(calculate(c.sizes, "", "").errors.length, 3);
  c.sizes.chest = "-2";
  assert.ok(calculate(c.sizes, 68, 46).errors.length);
  c.sizes.chest = "abc";
  assert.ok(calculate(c.sizes, 68, 46).errors.length);
  c.sizes.chest = "0";
  assert.equal(calculate(c.sizes, 68, 46).totals.chest, 0);
});
test("草稿只要求名称，可独立补全尺寸", () => {
  const c = emptyCraft();
  assert.equal(validateCraft(c).name, "请填写工艺单名称");
  c.name = "样衣";
  assert.deepEqual(validateCraft(c), {});
  c.density = "-2";
  assert.ok(validateCraft(c).density);
  c.sizes.bodyLength = "-1";
  assert.ok(validateCraft(c).bodyLength);
});
test("导出包含新增尺寸与行单位，不导出删除的字段", () => {
  const c = emptyCraft();
  c.name = "圆领背心";
  c.sizes.sleeveRib = "3";
  const text = craftText(c);
  assert.ok(text.includes("行/10cm"));
  assert.ok(text.includes("螺纹长度：3 cm"));
  assert.ok(!text.includes("针数（机号）"));
});

test("原版实测样例：68针/46行，整围与单片起针分开，收放针结果匹配", () => {
  const c = emptyCraft();
  Object.assign(c.sizes, {
    bodyLength: "60",
    chest: "100",
    shoulder: "40",
    armhole: "22",
    armholeDecrease: "12",
    shoulderSlope: "4",
    neckWidth: "18",
    frontNeckDepth: "7",
    frontNeckFlat: "4",
    backNeckDepth: "2.5",
    backNeckFlat: "8",
    sleeveLength: "55",
    sleeveCapHeight: "15",
    sleeveCapWidth: "17",
    sleeveWidth: "17",
    underarmFlat: "2",
  });
  const r = buildOriginalResults(c.sizes, 68, 46);
  assert.deepEqual(r.errors, []);
  const out = Object.fromEntries(r.rows.map((x) => [x.label, x.output]));
  assert.equal(out["前片起针"], "340 针");
  assert.equal(out["挂肩收针"], "每 5 行收 2 针 × 20 次");
  assert.equal(out["袖子起针"], "81 针");
  assert.equal(out["袖子加针"], "每 14 行两边各加 1 针 × 18 次");
  assert.equal(out["领口收针"], "122 针 · 44 行");
  assert.equal(out["袖山收针"], "平收 9 针后每 2 行收 2 针");
});
test("原版第二组实测：120胸围、65衣长、45肩宽、60针/40行", () => {
  const c = emptyCraft();
  Object.assign(c.sizes, {
    chest: "120",
    bodyLength: "65",
    shoulder: "45",
    sleeveLength: "50",
    sleeveWidth: "20",
    neckWidth: "24",
    frontNeckDepth: "8",
    bodyRib: "6",
  });
  const r = buildOriginalResults(c.sizes, 60, 40);
  assert.deepEqual(r.errors, []);
  const out = Object.fromEntries(r.rows.map((x) => [x.label, x.output]));
  assert.equal(out["前片起针"], "360 针");
  assert.equal(out["挂肩收针"], "每 3 行收 2 针 × 22 次");
  assert.equal(out["领口收针"], "144 针 · 32 行");
  assert.equal(out["袖子起针"], "84 针");
  assert.equal(out["袖子加针"], "每 11 行两边各加 1 针 × 18 次");
  assert.equal(out["下摆螺纹"], "24 行");
});
test("原版计算必须填写关键尺寸，删除机号后不再校验机号", () => {
  const c = emptyCraft();
  Object.assign(c.sizes, { chest: "120", bodyLength: "65", shoulder: "45" });
  assert.deepEqual(buildOriginalResults(c.sizes, 60, 40).errors, [
    "请填写正确的袖长",
  ]);
});

test("原版第三组实测：胸围100且挂肩留空时，挂肩69行", () => {
  const c = emptyCraft();
  Object.assign(c.sizes, {
    chest: "100",
    bodyLength: "60",
    shoulder: "40",
    sleeveLength: "55",
    sleeveWidth: "17",
    neckWidth: "18",
    frontNeckDepth: "7",
  });
  const r = buildOriginalResults(c.sizes, 68, 46);
  const arm = r.rows.find((x) => x.label === "挂肩收针");
  assert.equal(arm.detail, "挂肩 69 行，共收 40 针");
  assert.equal(arm.output, "每 3 行收 2 针 × 20 次");
});
