// Visual-only refinement, aligned to the existing coarse background's cell boundaries.
export function validRegionalGrid(region,background){
 const b=region?.backgroundPixelBounds,step=background.width>700?4:2;if(!b||b.step!==step)return false;
 if(![b.x0,b.x1,b.z0,b.z1].every(n=>Number.isInteger(n)&&n%step===0)||b.x0<0||b.z0<0||b.x1>=background.width||b.z1>=background.height||b.x1<=b.x0||b.z1<=b.z0)return false;
 return region.width===(b.x1-b.x0)*2+1&&region.height===(b.z1-b.z0)*2+1&&region.heights?.length===region.width*region.height&&Math.abs(region.spacing*2-background.spacing)<.001&&Math.abs(region.originUTM[0]-background.originUTM[0]-b.x0*background.spacing)<.1&&Math.abs(region.originUTM[1]-background.originUTM[1]+b.z0*background.spacing)<.1;
}
export function coarseBackgroundHeight(background,e,n){
 const {width:w,height:h,spacing:s,heights:v}=background,step=w>700?4:2,u=Math.max(0,Math.min(w-1,e/s-background.originUTM[0]/s)),z=Math.max(0,Math.min(h-1,background.originUTM[1]/s-n/s));
 const x0=Math.min(w-2,Math.floor(u/step)*step),z0=Math.min(h-2,Math.floor(z/step)*step),x1=Math.min(x0+step,w-1),z1=Math.min(z0+step,h-1),fx=(u-x0)/(x1-x0),fz=(z-z0)/(z1-z0),a=v[z0*w+x0],b=v[z0*w+x1],c=v[z1*w+x0],d=v[z1*w+x1];
 return fx+fz<=1?a*(1-fx-fz)+b*fx+c*fz:d*(fx+fz-1)+b*(1-fz)+c*(1-fx);
}
export function stitchedRegionalGrid(region,background){
 if(!validRegionalGrid(region,background))throw new Error('Regional scenery is not registered to the background grid');
 const heights=Float32Array.from(region.heights),transition=region.transitionMeters||600;
 for(let z=0;z<region.height;z++)for(let x=0;x<region.width;x++){
  const edge=Math.min(x,z,region.width-1-x,region.height-1-z)*region.spacing;if(edge>=transition)continue;
  const t=Math.max(0,Math.min(1,edge/transition)),blend=t*t*(3-2*t),base=coarseBackgroundHeight(background,region.originUTM[0]+x*region.spacing,region.originUTM[1]-z*region.spacing),i=z*region.width+x;heights[i]=base+(heights[i]-base)*blend;
 }
 return{...region,heights};
}
