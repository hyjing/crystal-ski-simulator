export function qualityScale(mode,pixelRatio,touch,viewportPixels){
  const cap=mode==='smooth'?.82:mode==='sharp'?1.5:touch?1:1.15;
  const budget=mode==='smooth'?1_400_000:mode==='sharp'?5_000_000:3_000_000;
  return Math.min(pixelRatio,cap,Math.sqrt(budget/Math.max(1,viewportPixels)));
}

export function adaptQuality(scale,ceiling,p95){
  if(p95>22)return Math.min(ceiling,Math.max(Math.min(.7,ceiling),scale-.12));
  if(p95<17.8)return Math.min(ceiling,scale+.06);
  return scale;
}
