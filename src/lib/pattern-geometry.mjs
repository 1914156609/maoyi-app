import { scheduleText } from './knitting.mjs';
export const patternTextLayout = Object.freeze({ left:24, right:690, notesX:450, noteSize:20, titleSize:24, lineHeight:28 });
// Reserve one full em per Unicode code point. This deliberately conservative
// width works for Chinese and mixed needle/row notation without relying on
// platform-specific canvas text measurement. Use the same rows for height and paint.
export function patternTextLines(value, width, fontSize) {
 const capacity=Math.max(1,Math.floor(width/fontSize));
 return String(value).split(/\r?\n/).flatMap(paragraph=>{
  const rows=[];let row='';
  const append=part=>{
   if(row&&Array.from(row).length+Array.from(part).length>capacity){rows.push(row);row='';}
   row+=part;
  };
  // Keep a complete row-needle-repeat group together when it fits. Very long
  // groups may break at a hyphen, but never split one of their numeric values.
  const tokens=paragraph.match(/\d+(?:\.\d+)?(?:[-–]\d+(?:\.\d+)?)*|[^\d]/gu)||[];
  for(const token of tokens){
   const parts=Array.from(token).length>capacity&&/[-–]/.test(token)?token.match(/\d+(?:\.\d+)?[-–]?/g):[token];
   for(const part of parts){
    const chars=Array.from(part);
    // An unbroken title longer than the whole column still has to wrap.
    if(chars.length>capacity)for(let i=0;i<chars.length;i+=capacity)append(chars.slice(i,i+capacity).join(''));
    else append(part);
   }
  }
  if(row)rows.push(row);
  return rows.length?rows:[''];
 });
}
// Physical-centimetre geometry. Drawing and geometry tests use exactly these paths.
export function pieceOutline(p) {
  const W=p.widthCm,H=p.heightCm;
  if(p.kind==='strip')return [['M',-W/2,H],['L',-W/2,0],['L',W/2,0],['L',W/2,H],['Z']];
  if(p.kind==='sleeve')return [['M',-p.cuffCm/2,H],['L',-W/2,p.capHeightCm],['Q',-W/2,0,-p.capWidthCm/2,0],['L',p.capWidthCm/2,0],['Q',W/2,0,W/2,p.capHeightCm],['L',p.cuffCm/2,H],['Z']];
  const a=H-p.armholeCm,c=W/2,sh=p.shoulderCm/2,n=p.neckWidthCm/2,d=p.neckDepthCm,sl=p.slopeCm,f=p.flatCm;
  const left=[['M',-c,H],['L',-c,a],['L',-c+f,a],['Q',-sh,a,-sh,sl],['L',-n,0]];
  const right=[['L',sh,sl],['Q',sh,a,c-f,a],['L',c,a],['L',c,H]];
  const leftNeck=p.neck==='V领'?[['L',0,d]]:[['Q',-n,d,0,d]];
  const rightNeck=p.neck==='V领'?[['L',n,0]]:[['Q',n,d,n,0]];
  if(p.half==='left')return [...left,...leftNeck,['L',0,H],['Z']];
  if(p.half==='right')return [['M',0,H],['L',0,d],...rightNeck,...right,['Z']];
  return [...left,...leftNeck,...rightNeck,...right,['Z']];
}
export function pieceNotes(p){
 const notes=[`起 ${p.castOn} 针`,`共 ${p.rows} 行`];
 if(p.kind==='body')notes.push(`${p.half?'腋下平收':'腋下各平收'} ${p.flat} 针`,`${p.half?'袖窿侧收':'每侧收'} ${p.armNeedles} 针`,scheduleText(p.armSchedule),`再直织 ${p.straightRows} 行`,`${p.half?'领口平留':'领中留'} ${p.half?p.neckPlan.center/2:p.neckPlan.center} 针`,scheduleText(p.neckPlan,p.neckPlan.action||'收'),`斜肩 ${scheduleText(p.shoulderSchedule,'引返')}`,`肩余 ${p.shoulderSchedule.remaining} 针`);
 if(p.kind==='sleeve')notes.push(`螺纹 ${p.ribRows} 行`,`加至 ${p.upper} 针`,scheduleText(p.increase,'加'),`袖山 ${scheduleText(p.decrease)}`,`余 ${p.cap} 针平收`);
 return notes;
}
export const pieceBandHeight=p=>Math.max(490,100+pieceNotes(p).reduce((n,t)=>n+patternTextLines(t,patternTextLayout.right-patternTextLayout.notesX,patternTextLayout.noteSize).length*patternTextLayout.lineHeight+7,0));
export const patternHeaderHeight=result=>Math.max(80,32+patternTextLines(result?.input?.name||'工艺结构图',patternTextLayout.right-patternTextLayout.left,patternTextLayout.titleSize).length*patternTextLayout.lineHeight);
export const patternHeight=result=>Math.max(480,patternHeaderHeight(result)+(result?.pieces||[]).reduce((n,p)=>n+pieceBandHeight(p),0));
