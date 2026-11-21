import { calculateCraft } from './knitting.mjs';
import { pieceOutline, patternHeight, pieceNotes, pieceBandHeight, patternHeaderHeight, patternTextLines, patternTextLayout } from './pattern-geometry.mjs';
export { patternHeight };
export function paintPattern(ctx,w,h,{craft={},showText=true,showDimensions=true,offsetX=0,offsetY=0}={}) {
 const r=craft.calculation||calculateCraft(craft), logicalH=patternHeight(r);
 ctx.save();ctx.scale(w/714,h/logicalH);ctx.setFillStyle('#111216');ctx.fillRect(0,0,714,logicalH);
 const text=(t,x,y,size=22,color='#f6a126')=>{ctx.setFillStyle(color);ctx.setFontSize(size);ctx.fillText(String(t),x,y);};
 const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 const wrap=(t,x,y,width,size=20,color='#a7afbf')=>{const rows=patternTextLines(t,width,size);rows.forEach((row,i)=>text(row,x,y+i*patternTextLayout.lineHeight,size,color));return rows.length*patternTextLayout.lineHeight;};
 ctx.setStrokeStyle('#24231f');ctx.setLineWidth(1);
 for(let x=0;x<714;x+=48)line(x,0,x,logicalH);for(let y=0;y<logicalH;y+=48)line(0,y,714,y);
 if(r.errors.length){text('填写尺寸与密度后生成工艺图',24,58,25,'#e8ecf4');wrap(r.errors[0],24,105,patternTextLayout.right-24);ctx.restore();ctx.draw();return;}
 ctx.translate(offsetX,offsetY);wrap(craft.name||'工艺结构图',24,36,patternTextLayout.right-24,patternTextLayout.titleSize,'#e8ecf4');
 const scale=Math.min(355/Math.max(...r.pieces.map(p=>p.widthCm)),342/Math.max(...r.pieces.map(p=>p.heightCm)));
 let base=patternHeaderHeight(r);
 r.pieces.forEach((p,index)=>{
  const band=pieceBandHeight(p),ox=228,oy=base+52;
  text(p.label,24,base+22,25,'#e8ecf4');ctx.setStrokeStyle('#f6a126');ctx.setLineWidth(2.5);
  ctx.beginPath();
  for(const [cmd,...v] of pieceOutline(p)){
   const vals=v.map((n,i)=>n*scale+(i%2?oy:ox));
   if(cmd==='M')ctx.moveTo(...vals);else if(cmd==='L')ctx.lineTo(...vals);else if(cmd==='Q')ctx.quadraticCurveTo(...vals);else ctx.closePath();
  }ctx.stroke();
  if(p.ribCm){ctx.setLineDash([7,5]);const ribW=p.kind==='sleeve'?p.cuffCm:p.widthCm;line(ox-(p.half==='right'?0:ribW/2)*scale,oy+(p.heightCm-p.ribCm)*scale,ox+(p.half==='left'?0:ribW/2)*scale,oy+(p.heightCm-p.ribCm)*scale);ctx.setLineDash([]);}
  if(p.half){ctx.setLineDash([6,4]);line(ox,oy+p.neckDepthCm*scale,ox,oy+p.heightCm*scale);ctx.setLineDash([]);}
  if(showDimensions){
   const width=p.half?p.widthCm/2:p.kind==='sleeve'?p.cuffCm:p.widthCm;
   text(`${width}cm`,ox-(p.half==='left'?width*scale/2:p.half==='right'?-width*scale/2:0)-25,oy+p.heightCm*scale+30,21);
   text(`${p.heightCm}cm`,24,oy+p.heightCm*scale/2,20);
   if(p.kind==='sleeve') { text(`袖宽 ${p.widthCm}cm`,ox-p.widthCm*scale/2,oy+p.capHeightCm*scale-9,19); text(`袖山宽 ${p.capWidthCm}cm`,ox-45,oy-12,19); }
  }
  if(showText){
   const notes=pieceNotes(p);
   let y=base+62;for(const note of notes)y+=wrap(note,patternTextLayout.notesX,y,patternTextLayout.right-patternTextLayout.notesX,patternTextLayout.noteSize)+7;
   if(p.kind==='body')text(`下摆螺纹 ${r.totals.ribRows} 行`,90,base+452,21,'#a7afbf');
  }
  ctx.setStrokeStyle('#282f3c');ctx.setLineWidth(1);line(24,base+band-12,690,base+band-12);base+=band;
 });
 ctx.restore();ctx.draw();
}
