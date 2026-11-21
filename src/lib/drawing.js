// Canvas geometry traced from the original visible garment structure diagram.
export function paintStructure(
  ctx,
  w,
  h,
  {
    craft = {},
    showText = true,
    showDimensions = true,
    offsetX = 0,
    offsetY = 0,
  } = {},
) {
  const sx = w / 714,
    sy = h / 928;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.setFillStyle("#181c25");
  ctx.fillRect(0, 0, 714, 928);
  ctx.setFillStyle("#111216");
  ctx.fillRect(0, 0, 714, 840);
  ctx.setStrokeStyle("#24231f");
  ctx.setLineWidth(1);
  for (let x = 0; x < 714; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 840);
    ctx.stroke();
  }
  for (let y = 0; y < 840; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(714, y);
    ctx.stroke();
  }
  const text = (t, x, y, size = 24, color = "#f6a126") => {
    ctx.setFontSize(size);
    ctx.setFillStyle(color);
    ctx.fillText(t, x, y);
  };
  const line = (points, close = false) => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    if (close) ctx.closePath();
    ctx.stroke();
  };
  const cardigan = craft.style === "开衫",
    vneck = craft.neck === "V领" || !craft.neck;
  ctx.translate(offsetX, offsetY);
  ctx.setStrokeStyle("#f6a126");
  ctx.setLineWidth(3.5);
  line(
    [
      [67, 128],
      [110, 174],
      [255, 174],
      [297, 128],
      [297, 710],
      [67, 710],
    ],
    true,
  );
  if (vneck)
    line([
      [110, 174],
      [183, 303],
      [255, 174],
    ]);
  else {
    ctx.beginPath();
    ctx.moveTo(110, 174);
    ctx.quadraticCurveTo(183, 255, 255, 174);
    ctx.stroke();
  }
  if (cardigan) ctx.strokeRect(316, 128, 29, 582);
  line(
    [
      [399, 151],
      [428, 195],
      [535, 195],
      [564, 151],
      [564, 687],
      [399, 687],
    ],
    true,
  );
  if (vneck)
    line([
      [428, 195],
      [482, 216],
      [535, 195],
    ]);
  else {
    ctx.beginPath();
    ctx.moveTo(428, 195);
    ctx.quadraticCurveTo(482, 205, 535, 195);
    ctx.stroke();
  }
  line(
    [
      [501, 89],
      [541, 89],
      [650, 377],
      [607, 429],
    ],
    true,
  );
  ctx.setLineDash([6, 6]);
  line([
    [74, 686],
    [289, 686],
  ]);
  ctx.setLineDash([]);
  if (showDimensions) {
    const arrow = (x1, y1, x2, y2) => {
      ctx.setLineWidth(2);
      ctx.setLineDash([8, 6]);
      line([
        [x1, y1],
        [x2, y2],
      ]);
      ctx.setLineDash([]);
      const a = Math.atan2(y2 - y1, x2 - x1);
      for (const [x, y, ang] of [
        [x1, y1, a],
        [x2, y2, a + Math.PI],
      ])
        line([
          [x + 13 * Math.cos(ang - 0.5), y + 13 * Math.sin(ang - 0.5)],
          [x, y],
          [x + 13 * Math.cos(ang + 0.5), y + 13 * Math.sin(ang + 0.5)],
        ]);
    };
    arrow(67, 104, 297, 104);
    arrow(47, 128, 47, 710);
    arrow(662, 89, 662, 429);
    const sizes = craft.baseSizes || craft.sizes || {};
    text("胸围 " + (sizes.chest || 96) + "cm", 145, 92, 21);
    text("衣长 " + (sizes.bodyLength || 55) + "cm", 19, 116, 21);
    text("袖长 " + (sizes.sleeveLength || 52) + "cm", 510, 74, 21);
  }
  if (showText) {
    text(
      "工艺结构图 - " + (craft.name || "墨绿V领开衫"),
      24,
      43,
      28,
      "#e8ecf4",
    );
    text(
      (craft.style || "开衫") + " / " + (craft.neck || "V领"),
      459,
      44,
      22,
      "#8b95a7",
    );
    text("前片", 76, 742, 27);
    text("后片", 408, 720, 27);
    text("袖", 509, 456, 27);
    if (cardigan) text("门襟", 307, 742, 21);
    if (craft.parts?.length || !craft.id) {
      text(
        "365 针 · 286 行" + (cardigan ? " 含门襟 12 针" : ""),
        76,
        777,
        20,
        "#8b95a7",
      );
      text("340 针 · 286 行", 408, 755, 20, "#8b95a7");
      text("116 针起针", 509, 488, 20, "#8b95a7");
      text("领口：领宽 122 针 · 领深 37 行", 26, 813, 24);
    }
    text(
      "毛衣姑娘·工艺图  " +
        (craft.updatedAt
          ? craft.updatedAt.slice(0, 10)
          : new Date().toLocaleDateString()),
      395,
      814,
      20,
      "#626d7f",
    );
  }
  ctx.restore();
  ctx.draw();
}
export function paintGarment(ctx, w, h, craft = {}) {
  ctx.save();
  ctx.scale(w / 714, h / 420);
  ctx.setFillStyle("#181c25");
  ctx.fillRect(0, 0, 714, 420);
  ctx.setFillStyle("#111216");
  ctx.fillRect(0, 0, 714, 378);
  ctx.setStrokeStyle("#24231f");
  ctx.setLineWidth(1);
  for (let x = 0; x < 714; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 378);
    ctx.stroke();
  }
  for (let y = 0; y < 378; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(714, y);
    ctx.stroke();
  }
  ctx.setStrokeStyle("#f6a126");
  ctx.setLineWidth(4);
  ctx.setFillStyle("#dbc5a4");
  const p = (points) => {
    ctx.beginPath();
    points.forEach((x, i) => (i ? ctx.lineTo(...x) : ctx.moveTo(...x)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  if (craft.style !== '背心' && craft.sleeve !== '无袖') {
  p([
    [222, 96],
    [craft.sleeve === '短袖' ? 192 : 155, craft.sleeve === '短袖' ? 189 : 273],
    [craft.sleeve === '短袖' ? 223 : 203, craft.sleeve === '短袖' ? 205 : 284],
    [223, 177],
  ]);
  p([
    [464, 96],
    [craft.sleeve === '短袖' ? 496 : 532, craft.sleeve === '短袖' ? 189 : 273],
    [craft.sleeve === '短袖' ? 465 : 483, craft.sleeve === '短袖' ? 205 : 284],
    [464, 177],
  ]);
  }
  p([
    [223, 111],
    [295, 95],
    [390, 95],
    [464, 111],
    [464, 317],
    [223, 317],
  ]);
  ctx.setFillStyle("#111216");
  ctx.beginPath();
  ctx.moveTo(295, 95);
  if (craft.neck === "V领") {
    ctx.lineTo(343, 176);
    ctx.lineTo(390, 95);
  } else {
    ctx.quadraticCurveTo(343, 169, 390, 95);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (craft.style === "开衫") {
    ctx.beginPath();
    ctx.moveTo(343, 103);
    ctx.lineTo(343, 317);
    ctx.stroke();
    for (const y of [160, 220, 280]) {
      ctx.beginPath();
      ctx.arc(359, y, 7, 0, Math.PI * 2);
      ctx.setFillStyle("#f6a126");
      ctx.fill();
    }
  }
  ctx.setFontSize(23);
  ctx.setFillStyle("#8b95a7");
  ctx.fillText(
    (craft.color || "未指定") +
      " · " +
      (craft.material || "未指定") +
      " · " +
      (craft.gauge || "未指定"),
    27,
    355,
  );
  ctx.restore();
  ctx.draw();
}
