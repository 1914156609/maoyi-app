import { emptyCraft } from "./domain.mjs";
// Transcribed from visible original screens, only loaded by the explicit review mode.
const base = (id, name, status, style, neck, date) => ({
  ...emptyCraft(),
  id,
  code: id,
  name,
  status,
  style,
  neck,
  owner: "我",
  createdAt: date,
  updatedAt: date,
  history: [],
  material: "未指定",
  color: "未指定",
  gauge: "未指定",
});
export function referenceCrafts() {
  const a = drawingSample();
  const b = base(
    "GY-20261016-01",
    "圆领套头基础款",
    "approved",
    "套头",
    "圆领",
    "2026-10-16T11:47:00",
  );
  b.density = "34";
  b.rowDensity = "23";
  Object.assign(b.sizes, {
    bodyLength: "57",
    chest: "50",
    shoulder: "37",
    armhole: "23",
    shoulderSlope: "3",
    neckWidth: "20",
    frontNeckDepth: "8",
    frontNeckFlat: "8",
    backNeckDepth: "3",
    backNeckFlat: "15",
    sleeveLength: "0",
    sleeveCapHeight: "13",
    sleeveCapWidth: "14",
    armholeDecrease: "7.3",
    underarmFlat: "3",
  });
  b.baseSizes = { chest: 50, bodyLength: 57, sleeveLength: 55 };
  b.parts = [];
  const c = base(
    "GY-20261009-01",
    "圆领套头衫",
    "draft",
    "套头",
    "圆领",
    "2026-10-09T14:56:00",
  );
  c.owner = "张工艺";
  c.density = "3";
  c.rowDensity = "4";
  c.baseSizes = { chest: 50, bodyLength: 57, sleeveLength: 55 };
  c.hasSizes = false;
  c.parts = [];
  return [a, b, c];
}

export function drawingSample() {
  const a = base(
    "GY-20261030-DEF8EBDD64",
    "墨绿V领开衫",
    "draft",
    "开衫",
    "V领",
    "2026-10-30T08:26:00",
  );
  a.baseSizes = { chest: 96, bodyLength: 55, sleeveLength: 52 };
  a.sizes.chest = "96";
  a.parts = [
    ["前片", "365 针 · 286 行", "含门襟 12 针"],
    ["后片", "340 针 · 286 行", "罗纹 3 行"],
    ["袖", "116 针起针", "加至 140 针"],
    ["领", "领宽 122 针 · 领深 37 行", "V领两边对称收"],
    ["门襟", "12 针", "单罗纹，钉纽扣 6 粒"],
  ];

  return a;
}
