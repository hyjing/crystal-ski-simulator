export function createTerrain(data) {
  const { width, height, spacing, heights } = data;
  const world = (x, z) => ({ x: (x - (width - 1) / 2) * spacing, z: (z - (height - 1) / 2) * spacing });
  function sample(x, z) {
    const u = Math.max(0, Math.min(width - 1.001, x / spacing + (width - 1) / 2));
    const v = Math.max(0, Math.min(height - 1.001, z / spacing + (height - 1) / 2));
    const ix = Math.floor(u), iz = Math.floor(v), fx = u - ix, fz = v - iz;
    const a = heights[iz * width + ix], b = heights[iz * width + ix + 1];
    const c = heights[(iz + 1) * width + ix], d = heights[(iz + 1) * width + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }
  const gradient = (x, z) => {
    const e = spacing * .65;
    return { x: (sample(x + e, z) - sample(x - e, z)) / (2 * e), z: (sample(x, z + e) - sample(x, z - e)) / (2 * e) };
  };
  // Match the two actual render triangles for decals, tracks and foot placement.
  function surface(x,z){
    const u=Math.max(0,Math.min(width-1.001,x/spacing+(width-1)/2));
    const v=Math.max(0,Math.min(height-1.001,z/spacing+(height-1)/2));
    const ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
    const a=heights[iz*width+ix],b=heights[iz*width+ix+1],c=heights[(iz+1)*width+ix],d=heights[(iz+1)*width+ix+1];
    return fx+fz<=1?a*(1-fx-fz)+b*fx+c*fz:d*(fx+fz-1)+b*(1-fz)+c*(1-fx);
  }
  return { ...data, world, sample, surface, gradient };
}

export const routeDefinitions = [
  { id: 'green-valley', osmWayId:'127128250', skipStart:1, name:'Green Valley', subtitle:'绿谷', label:'蓝道 · 坡面入口',color:'#79d7ed' },
  { id: 'lucky-shot', osmWayId:'127128246', name:'Lucky Shot', subtitle:'幸运一击', label:'蓝道 · 已映射路段',color:'#79d7ed' },
  { id: 'tinkerbell', osmWayId:'127128768', name:'Tinkerbell', subtitle:'小叮当', label:'绿道 · OSM 路线',color:'#b9f578' },
];

export function lonLatToUTM(lon,lat){
  const p=lat*Math.PI/180,dl=(lon+123)*Math.PI/180,e2=.00669437999014,ep=e2/(1-e2),k=.9996;
  const N=6378137/Math.sqrt(1-e2*Math.sin(p)**2),T=Math.tan(p)**2,C=ep*Math.cos(p)**2,A=Math.cos(p)*dl;
  const M=6378137*((1-e2/4-3*e2**2/64-5*e2**3/256)*p-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*p)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*p)-35*e2**3/3072*Math.sin(6*p));
  return {e:500000+k*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep)*A**5/120),n:k*(M+N*Math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep)*A**6/720))};
}

export function getRoutes(terrain,trailData) {
  return routeDefinitions.map(route => {
    const feature=trailData.features.find(f=>String(f.id)===route.osmWayId);
    if(!feature)throw new Error(`Missing trail geometry: ${route.name}`);
    const centerE=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,centerN=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
    let points=feature.geometry.coordinates.map(([lon,lat])=>{const p=lonLatToUTM(lon,lat);return{x:p.e-centerE,z:centerN-p.n};});
    if(terrain.sample(points[0].x,points[0].z)<terrain.sample(points.at(-1).x,points.at(-1).z))points.reverse();
    points=points.slice(route.skipStart||0);
    const length = points.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
    return { ...route, points, length, sourceUrl:feature.properties.sourceUrl,drop: terrain.sample(points[0].x,points[0].z)-terrain.sample(points.at(-1).x,points.at(-1).z) };
  });
}
