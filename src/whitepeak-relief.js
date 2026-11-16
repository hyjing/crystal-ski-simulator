const SIZE=641,SPACING=96;

export const WHITEPEAK_RELIEF_PATH='data/whitepeak/annapurna-relief.bin';
export const WHITEPEAK_SURFACE_PATH='data/whitepeak/annapurna-surface.png';
// World-space bounds of the DEM-derived material, from the valley to the range behind it.
export const WHITEPEAK_SURFACE_BOUNDS={west:-22000,east:22000,north:1000,south:31000};

// Blend the authored ski area into the measured valleys at its outer edge.
export function stitchWhitepeakRelief(buffer,local){
  if(buffer.byteLength!==SIZE*SIZE*2)throw new Error('Whitepeak relief size is invalid');
  const source=new DataView(buffer);
  const half=(SIZE-1)*SPACING/2;
  const halfX=(local.width-1)*local.spacing/2,halfZ=(local.height-1)*local.spacing/2;
  const heights=new Float32Array(SIZE*SIZE);
  for(let row=0;row<SIZE;row++){
    const z=row*SPACING-half;
    for(let col=0;col<SIZE;col++){
      const x=col*SPACING-half,i=row*SIZE+col;
      const measured=source.getUint16(i*2,true);
      const border=Math.max(Math.abs(x)-halfX,Math.abs(z)-halfZ);
      if(border>=2100){heights[i]=measured;continue;}
      const t=Math.max(0,border/2100),fade=t*t*(3-2*t);
      const authored=local.sample(x,z);
      heights[i]=authored+(measured-authored)*fade;
    }
  }
  return {width:SIZE,height:SIZE,spacing:SPACING,originUTM:[-half,half],heights};
}
