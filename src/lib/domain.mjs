export const groups = [
  {
    label: "大身尺寸",
    fields: [
      ["bodyLength", "衣长", "62", "rows"],
      ["chest", "胸宽（平铺）", "50", "stitches"],
      ["shoulder", "肩宽", "40", "stitches"],
      ["armhole", "挂肩", "22", "rows"],
      ["armholeDecrease", "袖框收针高度", "12", "rows"],
      ["shoulderSlope", "斜肩", "4", "rows"],
      ["bodyRib", "螺纹长度", "6", "rows"],
    ],
  },
  {
    label: "领口尺寸",
    fields: [
      ["neckWidth", "领宽", "18", "stitches"],
      ["frontNeckDepth", "前领深", "7", "rows"],
      ["frontNeckFlat", "前领平留", "4", "stitches"],
      ["backNeckDepth", "后领深", "2.5", "rows"],
      ["backNeckFlat", "后领平留", "8", "stitches"],
    ],
  },
  {
    label: "袖子尺寸",
    fields: [
      ["sleeveLength", "袖长", "55", "rows"],
      ["sleeveCapHeight", "袖山高", "15", "rows"],
      ["sleeveCapWidth", "袖山宽", "17", "stitches"],
      ["sleeveWidth", "袖宽", "34", "stitches"],
      ["sleeveCuffWidth", "袖口宽", "20", "stitches"],
      ["sleeveRib", "螺纹长度", "6", "rows"],
    ],
  },
  {
    label: "门襟尺寸（开衫选填）",
    fields: [["placketWidth", "门襟宽", "3", "stitches"], ["placketLength", "门襟长", "60", "rows"]],
  },
  {
    label: "收针方式",
    fields: [["underarmFlat", "腋下平收", "2", "stitches"]],
  },
];
export const allFields = groups.flatMap((g) => g.fields);
export const statusLabels = {
  draft: "草稿",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};
export const choiceGroups = [
  { key: "style", label: "款式", values: ["套头", "开衫", "背心"] },
  { key: "neck", label: "领型", values: ["圆领", "V领"] },
  { key: "sleeve", label: "袖型", values: ["长袖", "短袖", "无袖"] },
  { key: "length", label: "长度", values: ["短款", "常规", "加长"] },
];
export function emptyCraft() {
  return {
    name: "",
    measurementBasis: "flat",
    calculationVersion: "video-v1",
    style: "套头",
    neck: "圆领",
    sleeve: "长袖",
    length: "常规",
    density: "",
    rowDensity: "",
    sizes: Object.fromEntries(allFields.map((f) => [f[0], ""])),
  };
}
export function toCm(value, unit = "cm") {
  return Number(value) * (unit === "寸" ? 3.33 : 1);
}
export function convertUnit(value, from, to) {
  if (value === "" || value == null || from === to) return value;
  return Number(
    (toCm(value, from) / (to === "寸" ? 3.33 : 1)).toFixed(4),
  ).toString();
}
export function isDecimalNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string'
    && value.trim() === value
    && /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value)
    && Number.isFinite(Number(value));
}
export function validateCraft(craft) {
  const errors = {};
  if (!craft.name?.trim()) errors.name = "请填写工艺单名称";
  else if (craft.name.trim().length > 60) errors.name = "工艺单名称不能超过60字";
  for (const key of ["density", "rowDensity"])
    if (
      craft[key] !== "" && craft[key] != null &&
      (!isDecimalNumber(craft[key]) || Number(craft[key]) <= 0 || Number(craft[key]) > 1000)
    )
      errors[key] = "请输入大于 0 且不超过 1000 的数值";
  for (const [key, label] of allFields) {
    const value = craft.sizes?.[key];
    if (
      value !== "" &&
      value != null &&
      (!isDecimalNumber(value) || Number(value) < 0 || Number(value) > 500)
    )
      errors[key] = `${label}请输入0至500之间的数值`;
  }
  return errors;
}
export function calculate(sizes, density, rowDensity, unit = "cm") {
  const errors = [];
  const stitchDensity = Number(density),
    rowsDensity = Number(rowDensity);
  if (!isDecimalNumber(density) || stitchDensity <= 0 || stitchDensity > 1000)
    errors.push("请填写有效的密度（针/10cm）");
  if (!isDecimalNumber(rowDensity) || rowsDensity <= 0 || rowsDensity > 1000)
    errors.push("请填写有效的行密度（行/10cm）");
  const populated = allFields.filter(
    ([key]) => sizes[key] !== "" && sizes[key] != null,
  );
  if (!populated.length) errors.push("请至少填写一项工艺尺寸");
  populated.forEach(([key, label]) => {
    if (!isDecimalNumber(sizes[key]) || Number(sizes[key]) < 0 || toCm(sizes[key], unit) > 500)
      errors.push(`${label}请输入不小于 0 的数值`);
  });
  if (errors.length) return { errors, groups: [], totals: {} };
  const output = groups
    .map((g) => ({
      label: g.label,
      rows: g.fields
        .filter(([key]) => sizes[key] !== "" && sizes[key] != null)
        .map(([key, label, , kind]) => {
          const cm = toCm(sizes[key], unit);
          const gauge = kind === "rows" ? rowsDensity : stitchDensity;
          const effective = kind === "half" ? cm / 2 : cm;
          return {
            key,
            label,
            value: Number(sizes[key]),
            cm: Number(cm.toFixed(3)),
            count: Math.round((effective * gauge) / 10),
            unit: kind === "rows" ? "行" : "针",
            note: kind === "half" ? "胸围按单片一半计算" : "",
          };
        }),
    }))
    .filter((g) => g.rows.length);
  return {
    errors: [],
    groups: output,
    totals: Object.fromEntries(
      output.flatMap((g) => g.rows.map((r) => [r.key, r.count])),
    ),
  };
}
export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function craftText(craft) {
  return [
    `工艺单：${craft.name}`,
    `${craft.style} / ${craft.neck} / ${craft.sleeve} / ${craft.length}`,
    `密度：${craft.density || "—"} 针/10cm，${craft.rowDensity || "—"} 行/10cm`,
    ...groups.flatMap((g) => [
      g.label,
      ...g.fields
        .filter(
          ([key]) => craft.sizes?.[key] !== "" && craft.sizes?.[key] != null,
        )
        .map(([key, label]) => `${label}：${craft.sizes[key]} cm`),
    ]),
  ].join("\n");
}

// Scalar conversions verified against original screenshot 46–48.
// Shaping schedules reconstruct observed behavior; additional parameter combinations need production verification.
export function buildOriginalResults(sizes, density, rowDensity, unit = "cm") {
  const scalar = calculate(sizes, density, rowDensity, unit);
  if (scalar.errors.length) return scalar;
  for (const [key, label] of [
    ["chest", "胸围"],
    ["bodyLength", "衣长"],
    ["shoulder", "肩宽"],
    ["sleeveLength", "袖长"],
    ["sleeveWidth", "袖宽"],
    ["neckWidth", "领宽"],
    ["frontNeckDepth", "前领深"],
  ])
    if (!(Number(sizes[key]) > 0))
      return { ...scalar, errors: ["请填写正确的" + label] };
  const value = (key, fallback = 0) =>
    sizes[key] === "" || sizes[key] == null ? fallback : toCm(sizes[key], unit);
  const st = (n) => Math.round((n * Number(density)) / 10),
    rw = (n) => Math.round((n * Number(rowDensity)) / 10);
  const chest = value("chest", 100),
    length = value("bodyLength", 60),
    shoulder = value("shoulder", 40),
    armhole = value("armhole", chest * 0.15),
    neck = value("neckWidth", 22),
    frontDepth = value("frontNeckDepth", 7),
    backDepth = value("backNeckDepth", 0),
    sleeveLength = value("sleeveLength", 55),
    sleeveWidth = value("sleeveWidth", 17),
    sleeveCap = value("sleeveCapWidth", 0),
    sleeveCapHeight = value("sleeveCapHeight", 0),
    bodyRib = value("bodyRib", 5),
    sleeveRib = value("sleeveRib", 0),
    flat = value("underarmFlat");
  const front = st(chest / 2),
    bodyRows = rw(length),
    sleeveEnd = st(sleeveWidth),
    sleeveStart = Math.round(sleeveEnd * 0.7),
    sleeveTimes = Math.max(1, Math.round((sleeveEnd - sleeveStart) / 2)),
    armTimes = Math.max(1, Math.round((front * 0.12) / 2));
  const rows = [
    ...groups.map((g) => ({
      label: "【" + g.label + "】",
      detail: "",
      output: g.fields
        .map(([key, label, , kind]) => {
          const v = value(key);
          return (
            label +
            " " +
            Number(v.toFixed(3)) +
            "cm" +
            (v ? "→" + (kind === "rows" ? rw(v) + " 行" : st(v) + " 针") : "")
          );
        })
        .join(" · "),
    })),
    {
      label: "前片起针",
      detail: "下摆螺纹 " + rw(bodyRib) + " 行",
      output: front + " 针",
    },
    {
      label: "后片起针",
      detail: "下摆螺纹 " + rw(bodyRib) + " 行",
      output: front + " 针",
    },
    {
      label: "肩宽针数",
      detail: "肩宽 " + shoulder + "cm",
      output: st(shoulder) + " 针",
    },
    {
      label: "衣身行数",
      detail: "衣长 " + length + "cm",
      output: bodyRows + " 行",
    },
    {
      label: "挂肩收针",
      detail: "挂肩 " + rw(armhole) + " 行，共收 " + armTimes * 2 + " 针",
      output:
        "每 " +
        Math.max(1, Math.floor(rw(armhole) / armTimes)) +
        " 行收 2 针 × " +
        armTimes +
        " 次",
    },
    {
      label: "领口收针",
      detail:
        "领宽 " +
        neck +
        "cm，前领深 " +
        frontDepth +
        "cm，后领深 " +
        backDepth +
        "cm",
      output: st(neck) + " 针 · " + (rw(frontDepth) + rw(backDepth)) + " 行",
    },
    {
      label: "袖子起针",
      detail: "袖宽 " + sleeveWidth + "cm",
      output: sleeveStart + " 针",
    },
    {
      label: "袖子加针",
      detail: "加至 " + sleeveEnd + " 针，袖长 " + rw(sleeveLength) + " 行",
      output:
        "每 " +
        Math.max(1, Math.floor(rw(sleeveLength - sleeveRib) / sleeveTimes)) +
        " 行两边各加 1 针 × " +
        sleeveTimes +
        " 次",
    },
    {
      label: "袖山收针",
      detail: "收至袖山头 " + st(sleeveCap) + " 针平收",
      output: "平收 " + Math.round(sleeveEnd * 0.08) + " 针后每 2 行收 2 针",
    },
    {
      label: "下摆螺纹",
      detail: "下摆 " + bodyRib + "cm",
      output: rw(bodyRib) + " 行",
    },
  ];
  if (sleeveRib)
    rows.push({
      label: "袖口螺纹",
      detail: "袖口 " + sleeveRib + "cm",
      output: rw(sleeveRib) + " 行",
    });
  const partDetails = [
    {
      label: "前片",
      output: front + " 针 / " + bodyRows + " 行",
      detail:
        "前领深 " +
        frontDepth +
        "cm→" +
        rw(frontDepth) +
        " 行，前领平留 " +
        value("frontNeckFlat") +
        "cm→" +
        st(value("frontNeckFlat")) +
        " 针",
    },
    {
      label: "后片",
      output: front + " 针 / " + bodyRows + " 行",
      detail:
        "后领深 " +
        backDepth +
        "cm→" +
        rw(backDepth) +
        " 行，后领平留 " +
        value("backNeckFlat") +
        "cm→" +
        st(value("backNeckFlat")) +
        " 针",
    },
    {
      label: "袖",
      output: sleeveEnd + " 针 / " + rw(sleeveLength) + " 行",
      detail:
        sleeveCap || sleeveCapHeight
          ? "袖山 " + st(sleeveCap) + " 针 / " + rw(sleeveCapHeight) + " 行"
          : "",
    },
    {
      label: "领",
      output: st(neck) + " 针",
      detail:
        "前领深 " +
        rw(frontDepth) +
        " 行 · 后领深 " +
        rw(backDepth) +
        " 行 · 前领平留 " +
        st(value("frontNeckFlat")) +
        " 针 · 后领平留 " +
        st(value("backNeckFlat")) +
        " 针",
    },
    {
      label: "腋下平收",
      output: flat + "cm / " + st(flat) + " 针",
      detail:
        "腋下平收 " +
        flat +
        "cm→" +
        st(flat) +
        " 针（横密 " +
        density +
        " 针/10cm）",
    },
  ];
  return { ...scalar, rows, partDetails };
}
