import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCraft, withCalculation, shapingSchedule } from '../src/lib/knitting.mjs';
import { pieceOutline, patternHeight } from '../src/lib/pattern-geometry.mjs';
import { convertUnit } from '../src/lib/domain.mjs';
export const video = () => ({ name:'视频样例', style:'背心', neck:'圆领', sleeve:'无袖', measurementBasis:'flat', density:30,rowDensity:40,sizes:{chest:50,bodyLength:60,shoulder:37,armhole:23,shoulderSlope:3,neckWidth:20,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:3,backNeckFlat:15,bodyRib:6,underarmFlat:2} });
const valid=c=>{const r=calculateCraft(c);assert.deepEqual(r.errors,[]);return r;};
const sum=(p,k)=>p.groups.reduce((n,g)=>n+g[k]*g.times,0);
test('视频11/13原始数值：平铺150针、14针/30行、后领7针与同步斜肩25针',()=>{
 const r=valid(video());
 assert.deepEqual(r.totals,{castOn:150,shoulder:110,neckNeedles:60,flat:6,armNeedles:14,shoulderNeedles:25,totalRows:240,ribRows:24,armRows:92,slopeRows:12,shapingRows:30,underarmRows:124,straightRows:50});
 assert.deepEqual(r.schedules.arm.groups,[{interval:6,needles:2,times:1},{interval:4,needles:2,times:6}]);
 assert.equal(r.schedules.backNeck.center,46);assert.equal(r.schedules.backNeck.needles,7);assert.equal(r.schedules.backNeck.rows,12);
 assert.deepEqual(r.schedules.backNeck.groups,[{interval:2,needles:2,times:1},{interval:2,needles:1,times:5}]);
 assert.deepEqual(r.schedules.shoulder.groups,[{interval:2,needles:3,times:6}]);assert.equal(r.schedules.shoulder.remaining,7);
 assert.equal(r.timeline.backNeckStart,r.timeline.shoulderStart);assert.equal(r.timeline.end,240);
 assert.equal(r.totals.ribRows+r.totals.underarmRows+r.totals.shapingRows+r.totals.straightRows+r.totals.slopeRows,240);
 assert.ok(r.adjustments.some(s=>s.includes('111 → 110')));assert.ok(r.adjustments.some(s=>s.includes('45 → 46')));
});
test('收放针排程在40000组针行组合中严格守恒，无负数或单行间隔',()=>{
 for(let needles=0;needles<=200;needles++) for(let rows=2;rows<=400;rows+=2){const r=shapingSchedule(needles,rows);assert.equal(sum(r,'needles'),needles);assert.equal(sum(r,'interval')+r.straightRows,rows);for(const g of r.groups){assert.ok(g.interval>=2&&g.interval%2===0);assert.ok(g.needles>0&&g.times>0);}}
 assert.throws(()=>shapingSchedule(1,0));assert.throws(()=>shapingSchedule(2,3));
});
test('旧整围100与新平铺50等价；多次回读不会重复除二或嵌套旧结果',()=>{
 const a=video(),b={...video(),id:'old',measurementBasis:'circumference',sizes:{...a.sizes,chest:100}};
 assert.deepEqual(valid(a).parts,valid(b).parts);delete b.measurementBasis;assert.deepEqual(valid(b).parts,valid(a).parts);
 const forged={...b,parts:[['假数据']],calculation:{totals:{castOn:999}}};const r=withCalculation(forged);assert.equal(r.calculation.totals.castOn,150);assert.equal(r.calculation.input.calculation,undefined);
 const again=withCalculation(r);assert.deepEqual(again.calculation,r.calculation);
});
test('cm/寸保持物理尺寸和针行结果，计算不改写输入',()=>{
 const a=video(),old=structuredClone(a);const b={...a,sizes:Object.fromEntries(Object.entries(a.sizes).map(([k,v])=>[k,convertUnit(v,'cm','寸')]))};
 assert.deepEqual(calculateCraft(b,'寸').totals,valid(a).totals);assert.deepEqual(a,old);
});
test('非法密度和尺寸、缺必要值、关系冲突均拒绝生成图形',()=>{
 for(const val of [true,false,-1,0,1001,'abc',Infinity,NaN,'',' ']){const a=video();a.density=val;const r=calculateCraft(a);assert.ok(r.errors.length,String(val));assert.equal(r.pieces.length,0);}
 for(const val of [true,-1,501,'abc',Infinity,NaN,' ']){const a=video();a.sizes.chest=val;assert.ok(calculateCraft(a).errors.length,String(val));}
 for(const pair of [['shoulder',51],['neckWidth',37],['bodyLength',29],['underarmFlat',7],['frontNeckFlat',21],['armholeDecrease',21],['frontNeckDepth',55],['frontNeckDepth',0.01]]){const a=video();a.sizes[pair[0]]=pair[1];assert.ok(calculateCraft(a).errors.length,pair.join(':'));}
});
test('袖口宽真实决定起针，袖片加针与袖山减针守恒',()=>{
 const a=video();Object.assign(a,{style:'套头',sleeve:'长袖'});Object.assign(a.sizes,{sleeveLength:55,sleeveWidth:34,sleeveCuffWidth:20,sleeveCapWidth:10,sleeveCapHeight:15,sleeveRib:6});
 const r=valid(a);assert.equal(r.totals.sleeveCastOn,60);assert.equal(r.totals.sleeveUpper,102);assert.equal(r.totals.sleeveCap,30);
 assert.equal(r.totals.sleeveCastOn+sum(r.schedules.sleeveIncrease,'needles')*2,r.totals.sleeveUpper);
 assert.equal(r.totals.sleeveUpper-sum(r.schedules.sleeveCap,'needles')*2,r.totals.sleeveCap);
 a.sizes.sleeveCuffWidth=22;assert.equal(valid(a).totals.sleeveCastOn,66);
 a.sizes.sleeveCuffWidth=35;assert.ok(calculateCraft(a).errors.length);
});
test('后领和斜肩错误定位到实际非法字段，不误标前领',()=>{
 for(const [key,value] of [['backNeckDepth',24],['backNeckDepth',0.01],['shoulderSlope',0.01]]){
  const a=video();a.sizes[key]=value;const r=calculateCraft(a);
  assert.ok(r.fieldErrors[key]);assert.equal(r.fieldErrors.frontNeckDepth,undefined);assert.equal(r.pieces.length,0);
 }
});
test('款式、领型与实际尺寸改变轮廓；背心忽略不适用袖/门襟数据',()=>{
 const a=video(),r=valid(a);a.sizes.sleeveLength=-1;a.sizes.placketWidth=-1;assert.equal(valid(a).pieces.length,2);
 const b=video();b.neck='V领';b.sizes.frontNeckFlat=1000;const v=valid(b);assert.notDeepEqual(pieceOutline(v.pieces[0]),pieceOutline(r.pieces[0]));assert.equal(v.schedules.frontNeck.center,0);
 b.sizes.chest=60;const widened=valid(b);assert.equal(widened.totals.castOn,180);assert.notDeepEqual(pieceOutline(widened.pieces[0]),pieceOutline(v.pieces[0]));
 b.style='开衫';b.sizes.placketWidth=3;b.sizes.placketLength=60;const c=valid(b);assert.deepEqual(c.pieces.map(p=>p.key),['front-left','front-right','back','placket']);assert.equal(c.pieces[0].castOn+c.pieces[1].castOn,c.totals.castOn);assert.equal(c.pieces[3].castOn,10);
 for(const p of c.pieces)for(const [cmd,...coords]of pieceOutline(p))assert.ok(coords.every(Number.isFinite));
 b.sizes.placketWidth=0;assert.ok(calculateCraft(b).errors.length);
});
test('图形长标题和多部位留足画布高度，分享重算与本地相同',()=>{
 const a=video(),r=valid(a);a.name='长名称'.repeat(20);assert.ok(patternHeight(valid(a))>patternHeight(r));assert.deepEqual(withCalculation(JSON.parse(JSON.stringify(a))).parts,r.parts);
});
