// World +Z points south. The camera's forward direction becomes map-up.
export function mapProjection(width,height,center,heading,metersWide){
  const scale=width/metersWide,cos=Math.cos(heading),sin=Math.sin(heading);
  return {
    scale, cos, sin,
    point(p){
      const dx=p.x-center.x,dz=p.z-center.z;
      return {x:width/2+scale*(-cos*dx+sin*dz),y:height/2+scale*(-sin*dx-cos*dz)};
    },
  };
}
