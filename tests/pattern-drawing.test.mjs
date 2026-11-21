import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCraft } from '../src/lib/knitting.mjs';
import { paintPattern } from '../src/lib/pattern-drawing.js';
import { patternHeight, patternHeaderHeight, pieceBandHeight, pieceNotes, patternTextLines } from '../src/lib/pattern-geometry.mjs';

const sample=()=>({name:'QA管理-分页样单2',style:'套头',neck:'圆领',sleeve:'长袖',measurementBasis:'flat',density:30,rowDensity:40,sizes:{chest:50,bodyLength:60,shoulder:37,armhole:23,shoulderSlope:3,neckWidth:20,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:3,backNeckFlat:15,bodyRib:6,underarmFlat:2,sleeveLength:55,sleeveWidth:34,sleeveCuffWidth:20,sleeveCapWidth:10,sleeveCapHeight:15,sleeveRib:6}});
// Record the real paint calls, retaining a conservative full-em text envelope.
// This is a renderer range test, not browser font/visual acceptance evidence.
function recorder(){
 const texts=[],stack=[];let state={sx:1,sy:1,tx:0,ty:0,size:20};
 const ctx={
  save(){stack.push({...state});},restore(){state=stack.pop();},
  scale(x,y){state.sx*=x;state.sy*=y;},translate(x,y){state.tx+=x;state.ty+=y;},
  setFontSize(size){state.size=size;},
  fillText(value,x,y){texts.push({value,x,y,size:state.size,left:(x+state.tx)*state.sx,right:(x+state.tx+Array.from(value).length*state.size)*state.sx,top:(y+state.ty-state.size)*state.sy,bottom:(y+state.ty)*state.sy});},
 };
 for(const key of ['setFillStyle','fillRect','setStrokeStyle','setLineWidth','beginPath','moveTo','lineTo','stroke','quadraticCurveTo','closePath','setLineDash','draw'])ctx[key]=()=>{};
 return {ctx,texts};
}
function render(craft,width){
 const result=calculateCraft(craft);assert.deepEqual(result.errors,[]);
 const height=width*patternHeight(result)/714,{ctx,texts}=recorder();
 paintPattern(ctx,width,height,{craft:{...craft,calculation:result}});
 return {result,texts,height};
}

test('右栏斜肩中文排程完整换行，保留240逻辑像素的安全范围',()=>{
 const text='斜肩 2-3-6（行-引返针-次数）',lines=patternTextLines(text,240,20);
 assert.ok(lines.length>1);assert.equal(lines.join(''),text);
 for(const line of lines)assert.ok(Array.from(line).length*20<=240);
 assert.equal(patternTextLines('行'.repeat(12),240,20).length,1);
 assert.equal(patternTextLines('行'.repeat(13),240,20).length,2);
});

test('高密度排程382次不拆成38与2，临界列宽仍保留完整数字',()=>{
 const note='2-4-1；2-3-382（行-收针-次数）';
 for(const width of [120,140,240]){
  const lines=patternTextLines(note,width,20);
  assert.equal(lines.join(''),note);
  assert.ok(lines.some(line=>line.includes('382')));
  assert.ok(lines.every(line=>Array.from(line).length*20<=width));
  if(width>=140)assert.ok(lines.some(line=>line.includes('2-3-382')));
 }
 const longGroup='10000-10000-10000（行-收针-次数）';
 const lines=patternTextLines(longGroup,240,20);
 assert.equal(lines.join(''),longGroup);
 assert.equal(lines.flatMap(line=>line.match(/\d+/g)||[]).join(','),'10000,10000,10000');
});

test('不同画布宽度和所有衣片的实际绘图文字均在范围内，长数字不裁切',()=>{
 const variants=[];
 const pullover=sample();variants.push(pullover);
 const vest=sample();Object.assign(vest,{style:'背心',sleeve:'无袖'});variants.push(vest);
 const cardigan=sample();Object.assign(cardigan,{style:'开衫',neck:'V领',density:1000,rowDensity:1000});Object.assign(cardigan.sizes,{placketWidth:3,placketLength:60});variants.push(cardigan);
 for(const craft of variants)for(const width of [260,315,354,414]){
  const {texts,height}=render(craft,width);
  for(const text of texts){
   assert.ok(text.left>=0&&text.right<=width+1e-8,`${width}px horizontal: ${text.value}`);
   assert.ok(text.top>=0&&text.bottom<=height,`${width}px vertical: ${text.value}`);
  }
  // A schedule group fitting the column must remain readable as one group,
  // even when a previous group or Chinese label precedes it on the same note.
  const groups=calculateCraft(craft).pieces.flatMap(piece=>pieceNotes(piece).flatMap(note=>note.match(/\d+-\d+-\d+/g)||[]));
  for(const group of groups)if(group.length<=12)assert.ok(texts.some(text=>text.value.includes(group)),`split schedule group: ${group}`);
 }
});

test('真实绘图保留全部针行说明，分行后的说明不进入下一衣片',()=>{
 const {result,texts}=render(sample(),354);let base=patternHeaderHeight(result);
 for(const piece of result.pieces){
  const band=pieceBandHeight(piece),notes=texts.filter(t=>t.x===450&&t.y>=base&&t.y<base+band);
  assert.equal(notes.map(t=>t.value).join(''),pieceNotes(piece).join(''));
  assert.ok(notes.every(t=>t.y<base+band-12));
  for(let i=1;i<notes.length;i++)assert.ok(notes[i].y-notes[i-1].y>=28);
  base+=band;
 }
 assert.ok(texts.some(t=>t.value.startsWith('斜肩')));
});

test('60字中文或连续英文标题不丢字，头部高度覆盖完整标题',()=>{
 for(const name of ['工艺长名称'.repeat(12),'W'.repeat(60),'🧶毛衣'.repeat(20)]){
  const craft={...sample(),name},{result,texts}=render(craft,260),base=patternHeaderHeight(result);
  const title=texts.filter(t=>t.x===24&&t.y<base&&t.size===24);
  assert.equal(title.map(t=>t.value).join(''),name);
  assert.ok(title.every(t=>t.right<=260&&t.y+24<base+22));
 }
});

test('缺尺寸的错误说明也在画布范围内，没有生成示例衣片',()=>{
 const {ctx,texts}=recorder();paintPattern(ctx,260,480*260/714,{craft:{}});
 assert.ok(texts.some(t=>t.value==='填写尺寸与密度后生成工艺图'));
 assert.ok(texts.every(t=>t.left>=0&&t.right<=260));
 assert.ok(!texts.some(t=>t.value==='前片'||t.value==='后片'));
});
