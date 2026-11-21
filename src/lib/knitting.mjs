import { allFields, toCm, isDecimalNumber } from './domain.mjs';

export const CALCULATION_VERSION = 'video-v1';
const round = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
const present = v => v !== '' && v != null;
const even = n => Math.max(0, Math.round(n / 2) * 2);
const groupRuns = steps => steps.reduce((out, s) => {
  const last = out.at(-1);
  if (last && last.interval === s.interval && last.needles === s.needles) last.times++;
  else out.push({ ...s, times: 1 });
  return out;
}, []);
const distribute = (total, count) => count ? Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0)) : [];

// All schedules conserve both needles and rows. Intervals are full outward/return pairs.
export function shapingSchedule(needles, rows, preferred = 2) {
  if (!Number.isInteger(needles) || !Number.isInteger(rows) || needles < 0 || rows < 0 || rows % 2) throw new Error('收针参数必须为非负整数，行数必须为双数');
  if (!needles) return { groups: [], needles: 0, rows, straightRows: rows, remaining: 0 };
  if (rows < 2) throw new Error('收针段至少需要2行');
  const events = Math.min(Math.ceil(needles / preferred), rows / 2);
  const amounts = distribute(needles, events), intervals = distribute(rows / 2, events).map(n => n * 2);
  return { groups: groupRuns(amounts.map((n, i) => ({ interval: intervals[i], needles: n }))), needles, rows, straightRows: 0, remaining: 0 };
}
export function shoulderSchedule(needles, rows) {
  if (!rows || !needles) return { groups: [], needles: 0, rows: 0, straightRows: 0, remaining: needles };
  // The demonstrated 25 needles / 6 turns uses 3 per turn and leaves 7, not 1.
  const events = Math.min(rows / 2, Math.max(0, needles - 2));
  if (!events) return { groups: [], needles: 0, rows, straightRows: rows, remaining: needles };
  const amount = Math.floor((needles - 2) / events);
  return { groups: groupRuns(distribute(rows / 2, events).map(n => ({ interval: n * 2, needles: amount }))), needles: amount * events, rows, straightRows: 0, remaining: needles - amount * events };
}
export function scheduleText(schedule, action = '收') {
  const operation = action.endsWith('针') ? action : action + '针';
  if (!schedule.groups.length) return schedule.straightRows ? `直织 ${schedule.straightRows} 行` : '无需' + operation;
  return schedule.groups.map(g => `${g.interval}-${g.needles}-${g.times}`).join('；') + `（行-${operation}-次数）`;
}

export function calculateCraft(craft = {}, unit = 'cm') {
  const errors = [], fieldErrors = {}, adjustments = [];
  const fail = (key, message) => { if (!fieldErrors[key]) { fieldErrors[key] = message; errors.push(message); } };
  const style = craft.style || '套头', neck = craft.neck || '圆领', sleeve = style === '背心' ? '无袖' : (craft.sleeve || '长袖');
  if (!['套头', '开衫', '背心'].includes(style)) fail('style', '请选择有效款式');
  if (!['圆领', 'V领'].includes(neck)) fail('neck', '请选择有效领型');
  if (!['长袖', '短袖', '无袖'].includes(sleeve)) fail('sleeve', '请选择有效袖型');
  const hasSleeve = sleeve !== '无袖';
  const sizes = {};
  for (const [key, label] of allFields) {
    const irrelevant = (!hasSleeve && key.startsWith('sleeve')) || (style !== '开衫' && key.startsWith('placket')) || (neck === 'V领' && key === 'frontNeckFlat');
    const raw = irrelevant ? '' : craft.sizes?.[key];
    if (!present(raw)) { sizes[key] = 0; continue; }
    const v = toCm(raw, unit);
    if (!isDecimalNumber(raw) || !Number.isFinite(v) || v < 0 || v > 500) fail(key, `${label}请输入0至500cm之间的数值`);
    sizes[key] = round(v);
  }
  const stitchDensity = Number(craft.density) / 10, rowDensity = Number(craft.rowDensity) / 10;
  if (!isDecimalNumber(craft.density) || !(stitchDensity > 0 && stitchDensity <= 100) || !Number.isFinite(stitchDensity)) fail('density', '密度请输入大于0且不超过1000的针数/10cm');
  if (!isDecimalNumber(craft.rowDensity) || !(rowDensity > 0 && rowDensity <= 100) || !Number.isFinite(rowDensity)) fail('rowDensity', '行密度请输入大于0且不超过1000的行数/10cm');
  const basis = craft.measurementBasis || (craft.id ? 'circumference' : 'flat');
  if (!['flat', 'circumference'].includes(basis)) fail('measurementBasis', '胸围计量口径不正确');
  if (basis === 'circumference') sizes.chest /= 2;
  for (const [key, label] of allFields) {
    const required = ['chest', 'bodyLength', 'shoulder', 'armhole', 'neckWidth', 'frontNeckDepth'].includes(key) || (hasSleeve && ['sleeveLength', 'sleeveWidth', 'sleeveCuffWidth', 'sleeveCapHeight', 'sleeveCapWidth'].includes(key));
    if (required && !(sizes[key] > 0)) fail(key, `请填写正确的${label}`);
  }
  const s = sizes;
  if (s.chest < s.shoulder) fail('shoulder', '肩宽不能大于单片胸宽');
  if (s.shoulder <= s.neckWidth) fail('neckWidth', '领宽必须小于肩宽');
  if (s.bodyLength <= s.armhole + s.bodyRib) fail('bodyLength', '衣长必须大于挂肩与下摆螺纹长度之和');
  if (s.armhole <= s.shoulderSlope) fail('shoulderSlope', '斜肩高度必须小于挂肩');
  if (s.underarmFlat * 2 > s.chest - s.shoulder) fail('underarmFlat', '两侧腋下平收不能超过胸宽与肩宽的差');
  for (const k of ['frontNeckFlat', 'backNeckFlat']) if (s[k] > s.neckWidth) fail(k, '领口平留不能大于领宽');
  if (s.frontNeckDepth > s.bodyLength - s.bodyRib) fail('frontNeckDepth', '前领深超出衣片可用高度');
  if (s.backNeckDepth > s.armhole) fail('backNeckDepth', '后领深不能大于挂肩');
  if (s.armholeDecrease > s.armhole - s.shoulderSlope) fail('armholeDecrease', '袖框收针高度不能超过挂肩减斜肩的高度');
  if (hasSleeve) {
    if (s.sleeveLength <= s.sleeveCapHeight + s.sleeveRib) fail('sleeveLength', '袖长必须大于袖山高与袖口螺纹之和');
    if (s.sleeveCuffWidth > s.sleeveWidth) fail('sleeveCuffWidth', '袖口宽不能大于袖宽');
    if (s.sleeveCapWidth > s.sleeveWidth) fail('sleeveCapWidth', '袖山宽不能大于袖宽');
  }
  if (style === '开衫' && (!!s.placketWidth !== !!s.placketLength)) fail('placketWidth', '门襟宽与门襟长请一起填写，或一起留空');
  const result = { version: CALCULATION_VERSION, errors, fieldErrors, adjustments, input: { name: String(craft.name || ''), length: craft.length || '常规', style, neck, sleeve, sizes, density: Number(craft.density), rowDensity: Number(craft.rowDensity), measurementBasis: 'flat', calculationVersion: CALCULATION_VERSION }, rows: [], parts: [], pieces: [], totals: {}, schedules: {}, timeline: {} };
  if (errors.length) return result;
  const adjusted = (label, raw, value, reason) => {
    if (Math.abs(raw - value) > 0.0001) adjustments.push(`${label} ${round(raw)} → ${value}（${reason}）`);
    return value;
  };
  const st = (key, mode = 'nearest') => adjusted(allFields.find(f => f[0] === key)?.[1] || key, s[key] * stitchDensity, mode === 'down' ? Math.floor(s[key] * stitchDensity / 2) * 2 : mode === 'up' ? Math.ceil(s[key] * stitchDensity / 2) * 2 : even(s[key] * stitchDensity), mode === 'down' ? '向下双数针' : mode === 'up' ? '向上双数针' : '最接近双数针');
  const rw = (key) => adjusted(allFields.find(f => f[0] === key)?.[1] || key, s[key] * rowDensity, even(s[key] * rowDensity), '最接近双数行');
  const castOn = st('chest'), shoulder = st('shoulder', 'down'), neckNeedles = st('neckWidth');
  const flat = adjusted('单侧腋下平收', s.underarmFlat * stitchDensity, Math.round(s.underarmFlat * stitchDensity), '整针');
  const totalRows = rw('bodyLength'), ribRows = rw('bodyRib'), armRows = rw('armhole'), slopeRows = rw('shoulderSlope');
  const armNeedles = (castOn - shoulder - 2 * flat) / 2, shoulderNeedles = (shoulder - neckNeedles) / 2;
  const shapingHeight = s.armholeDecrease || s.armhole / 3;
  const shapingRows = Math.min(armRows - slopeRows, adjusted('袖框收针段', shapingHeight * rowDensity, even(shapingHeight * rowDensity), s.armholeDecrease ? '指定高度折算双数行' : '挂肩1/3，折算双数行'));
  if (armNeedles < 0 || shoulderNeedles < 1) fail('shoulder', '调针后肩部针数不足，请调整肩宽、领宽或腋下平收');
  if (armNeedles > 0 && shapingRows < 2) fail('armholeDecrease', '当前密度下，收针段不足2行');
  if (totalRows <= armRows + ribRows || armRows < slopeRows || slopeRows > 0 && shoulderNeedles < 3) fail('bodyLength', '当前密度下可织行数或肩部针数不足，请调整尺寸');
  if (errors.length) return result;
  const arm = shapingSchedule(armNeedles, shapingRows), slope = shoulderSchedule(shoulderNeedles, slopeRows);
  const frontRows = rw('frontNeckDepth'), backRows = rw('backNeckDepth');
  if (frontRows < 2) fail('frontNeckDepth', '当前密度下，前领不足2行，请调整尺寸');
  if (s.backNeckDepth > 0 && backRows < 2) fail('backNeckDepth', '当前密度下，后领不足2行，请调整尺寸');
  if (s.shoulderSlope > 0 && slopeRows < 2) fail('shoulderSlope', '当前密度下，斜肩不足2行，请调整尺寸');
  if (errors.length) return result;
  const frontFlat = neck === 'V领' ? 0 : Math.min(neckNeedles, st('frontNeckFlat', 'up'));
  const backFlat = Math.min(neckNeedles, st('backNeckFlat', 'up'));
  const neckPlan = (center, height, key) => {
    const needles = (neckNeedles - center) / 2;
    if (!height) return { groups: [], needles: 0, rows: 0, straightRows: 0, remaining: needles, center: neckNeedles, startRow: totalRows };
    const schedule = shapingSchedule(needles, height, 1);
    return { ...schedule, center, startRow: totalRows - height, endRow: totalRows, action: key === 'front' && neck === 'V领' ? '收针' : '引返' };
  };
  const frontNeck = neckPlan(frontFlat, frontRows, 'front'), backNeck = neckPlan(backFlat, backRows, 'back');
  const rows = result.rows;
  const row = (label, output, detail = '') => rows.push({ label, output, detail });
  row(style === '开衫' ? '后片起针' : '单片起针', `${castOn} 针`, `胸宽 ${s.chest}cm × 横密 ${stitchDensity}针/cm`);
  if(style === '开衫') row('前片起针', `每片 ${castOn / 2} 针`, '左、右前片各织1片；门襟单列');
  row('肩宽针数', `${shoulder} 针`); row('衣身总行数', `${totalRows} 行`);
  row('下摆螺纹', `${ribRows} 行`, `${s.bodyRib}cm`);
  row('腋下直织', `${totalRows - armRows - ribRows} 行`, '不含下摆螺纹');
  row('腋下平收', `两侧各 ${flat} 针`, `${s.underarmFlat}cm/侧`);
  row('挂肩收针', scheduleText(arm), `每侧 ${armNeedles} 针 / ${shapingRows} 行`);
  row('收针后直织', `${armRows - slopeRows - shapingRows} 行`, `袖框总行数 ${armRows - slopeRows} 行`);
  for (const [label, plan] of [['前领', frontNeck], ['后领', backNeck]]) row(label + (plan.action || '平收'), scheduleText(plan, plan.action || '收'), `中间平留 ${plan.center} 针；每侧 ${plan.needles} 针；从第 ${plan.startRow} 行开始`);
  row('斜肩引返', scheduleText(slope, '引返'), `每肩 ${shoulderNeedles} 针，最后余 ${slope.remaining} 针；与领口同步`);
  const common = { kind: 'body', widthCm: s.chest, heightCm: s.bodyLength, shoulderCm: s.shoulder, armholeCm: s.armhole, slopeCm: s.shoulderSlope, flatCm: s.underarmFlat, ribCm: s.bodyRib, neckWidthCm: s.neckWidth, rows: totalRows, castOn, armNeedles, flat, shapingRows, straightRows: armRows - slopeRows - shapingRows, armSchedule: arm, shoulderSchedule: slope };
  const front = { ...common, key: 'front', label: '前片', neck, neckDepthCm: s.frontNeckDepth, neckPlan: frontNeck };
  if (style === '开衫') {
    result.pieces.push({ ...front, key: 'front-left', label: '左前片', half: 'left', castOn: castOn / 2 }, { ...front, key: 'front-right', label: '右前片', half: 'right', castOn: castOn / 2 });
  } else result.pieces.push(front);
  result.pieces.push({ ...common, key: 'back', label: '后片', neck: '圆领', neckDepthCm: s.backNeckDepth, neckPlan: backNeck });
  Object.assign(result.totals, { castOn, shoulder, neckNeedles, flat, armNeedles, shoulderNeedles, totalRows, ribRows, armRows, slopeRows, shapingRows, underarmRows: totalRows - armRows - ribRows, straightRows: armRows - slopeRows - shapingRows });
  Object.assign(result.schedules, { arm, shoulder: slope, frontNeck, backNeck });
  Object.assign(result.timeline, { ribEnd: ribRows, armholeStart: totalRows - armRows, shapingEnd: totalRows - armRows + shapingRows, shoulderStart: totalRows - slopeRows, frontNeckStart: frontNeck.startRow, backNeckStart: backNeck.startRow, end: totalRows });
  if (hasSleeve) {
    const cuff = st('sleeveCuffWidth'), upper = st('sleeveWidth'), cap = st('sleeveCapWidth'), sleeveRows = rw('sleeveLength'), sleeveRib = rw('sleeveRib'), capRows = rw('sleeveCapHeight');
    const increaseNeedles = (upper - cuff) / 2, capNeedles = (upper - cap) / 2, increaseRows = sleeveRows - sleeveRib - capRows;
    if (increaseRows < 2 || capRows < 2 || cuff < 2 || cap < 2) fail('sleeveLength', '当前密度下袖子可织针数或行数不足');
    if (errors.length) { result.pieces = []; result.rows = []; return result; }
    const increase = shapingSchedule(increaseNeedles, increaseRows, 1), decrease = shapingSchedule(capNeedles, capRows, 2);
    result.pieces.push({ key: 'sleeve', kind: 'sleeve', label: '袖片（织2片）', widthCm: s.sleeveWidth, heightCm: s.sleeveLength, cuffCm: s.sleeveCuffWidth, capWidthCm: s.sleeveCapWidth, capHeightCm: s.sleeveCapHeight, ribCm: s.sleeveRib, castOn: cuff, upper, cap, rows: sleeveRows, ribRows: sleeveRib, increase, decrease });
    Object.assign(result.totals, { sleeveCastOn: cuff, sleeveUpper: upper, sleeveCap: cap, sleeveRows, sleeveRibRows: sleeveRib });
    Object.assign(result.schedules, { sleeveIncrease: increase, sleeveCap: decrease });
    row('袖口起针', `${cuff} 针`, `袖口宽 ${s.sleeveCuffWidth}cm`); row('袖口螺纹', `${sleeveRib} 行`);
    row('袖身加针', scheduleText(increase, '加'), `两侧各加 ${increaseNeedles} 针，到 ${upper} 针`);
    row('袖山收针', scheduleText(decrease), `两侧各收 ${capNeedles} 针，余 ${cap} 针平收`);
  }
  if (style === '开衫' && s.placketWidth && s.placketLength) {
    const stitches = st('placketWidth'), placketRows = rw('placketLength');
    result.pieces.push({ key: 'placket', kind: 'strip', label: '门襟', widthCm: s.placketWidth, heightCm: s.placketLength, castOn: stitches, rows: placketRows });
    row('门襟', `${stitches} 针 / ${placketRows} 行`, `${s.placketWidth} × ${s.placketLength}cm`);
  }
  result.parts = rows.map(r => [r.label, r.output, r.detail]);
  return result;
}

export function withCalculation(craft) {
  if (!craft) return null;
  const calculation = calculateCraft(craft);
  return { ...craft, calculation, parts: calculation.errors.length ? [] : calculation.parts };
}
