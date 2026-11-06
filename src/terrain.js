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

export const difficultyStyles={
  easy:{label:'绿道',color:'#91bd70',symbol:'●'},
  intermediate:{label:'蓝道',color:'#368bbb',symbol:'■'},
  advanced:{label:'黑道',color:'#263c48',symbol:'◆'},
  expert:{label:'双黑道',color:'#192c37',symbol:'◆◆'},
};

// Only join actual shared OSM endpoints; never bridge disconnected segments.
export function joinTrailWays(features){
  const remaining=features.map(f=>({coordinates:f.geometry.coordinates.map(p=>[...p]),ids:[String(f.id)]})),chains=[];
  const same=(a,b)=>Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9;
  while(remaining.length){
    const chain=remaining.shift();let joined=true;
    while(joined){
      joined=false;
      for(let i=0;i<remaining.length;i++){
        const c=chain.coordinates,p=remaining[i].coordinates;
        if(same(c.at(-1),p[0]))c.push(...p.slice(1));
        else if(same(c.at(-1),p.at(-1)))c.push(...p.slice(0,-1).reverse());
        else if(same(c[0],p.at(-1)))c.unshift(...p.slice(0,-1));
        else if(same(c[0],p[0]))c.unshift(...p.slice(1).reverse());
        else continue;
        chain.ids.push(...remaining[i].ids);remaining.splice(i,1);joined=true;break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

export function filterRoutes(routes,difficulty='all',query=''){
  const normalize=s=>s.toLowerCase().replace(/[’']/g,'').trim();
  const term=normalize(query);
  return routes.filter(r=>(difficulty==='all'||r.difficulty===difficulty||(difficulty==='advanced'&&r.difficulty==='expert'))&&normalize(`${r.name} ${r.subtitle}`).includes(term));
}

export function getRoutes(terrain,trailData) {
  const groups=new Map();
  for(const f of trailData.features){
    if(f.geometry.type!=='LineString'||f.properties['area']==='yes')continue;
    const name=f.properties.name;if(!name)continue;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(f);
  }
  const centerE=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,centerN=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  const routes=[];
  for(const [name,features] of groups){
    const preset=routeDefinitions.find(r=>r.name===name)||{};
    // These two OSM difficulty tags disagree with the current official winter map.
    const difficulty=['Quicksilver','Easy Street'].includes(name)?'easy':features[0].properties['piste:difficulty'];
    const style=difficultyStyles[difficulty];if(!style)continue;
    const chains=joinTrailWays(features);
    chains.forEach((chain,part)=>{
      let points=chain.coordinates.map(([lon,lat])=>{const p=lonLatToUTM(lon,lat);return{x:p.e-centerE,z:centerN-p.n};});
      if(terrain.sample(points[0].x,points[0].z)<terrain.sample(points.at(-1).x,points.at(-1).z))points.reverse();
      points=points.slice(preset.skipStart||0);
      const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
      const drop=terrain.sample(points[0].x,points[0].z)-terrain.sample(points.at(-1).x,points.at(-1).z);
      const id=(preset.id||name.toLowerCase().replace(/['’.]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))+(part?`-${part+1}`:'');
      routes.push({...preset,id,name,subtitle:preset.subtitle||'真实地图线路',difficulty,color:style.color,symbol:style.symbol,
        label:`${style.label} · ${drop/length<.1?'连接路段':'已映射路段'}${chains.length>1?` ${part+1}/${chains.length}`:''}`,
        points,length,drop,osmWayId:chain.ids[0],osmWayIds:chain.ids,
        sourceUrl:`https://www.openstreetmap.org/way/${chain.ids[0]}`});
    });
  }
  const priority=['green-valley','lucky-shot','tinkerbell'];
  return routes.sort((a,b)=>{
    const rank=r=>priority.includes(r.id)?priority.indexOf(r.id):-1;
    return (rank(a)<0?99:rank(a))-(rank(b)<0?99:rank(b))||a.name.localeCompare(b.name);
  });
}


export function getLiftRuns(terrain,data){
  const ce=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,cn=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  return data.features.map(feature=>{
    const properties=feature.properties,preset=routeDefinitions.find(r=>r.id===feature.id)||{};
    const difficulty=properties.difficulty||(['quicksilver','tinkerbell','queens-run'].includes(feature.id)?'easy':['northway','otto-bahn'].includes(feature.id)?'advanced':'intermediate');
    const style=difficultyStyles[difficulty],points=[];
    for(const ll of feature.geometry.coordinates){const p=lonLatToUTM(...ll),point={x:p.e-ce,z:cn-p.n};if(!points.length||Math.hypot(point.x-points.at(-1).x,point.z-points.at(-1).z)>.25)points.push(point);}
    const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
    return {...preset,...properties,id:feature.id,name:properties.name,points,difficulty,...style,
      subtitle:feature.id==='queens-run'?"Queen's Run Queens 女王道":feature.id==='mr-magoo'?'Magoo mangoo 马古':feature.id==='chappelles'?'Chappelle champell 沙佩尔':preset.subtitle||properties.via?.join(' → ')||'',
      label:`${style.label} · 上站 → 下站`,length,drop:terrain.sample(points[0].x,points[0].z)-terrain.sample(points.at(-1).x,points.at(-1).z),
      sourceUrl:`https://www.openstreetmap.org/way/${properties.primaryWayId||properties.osmWayIds[0]}`,osmWayId:properties.primaryWayId||properties.osmWayIds[0]};
  }).filter(r=>r.length>=400);
}

export function pointAlongRoute(route,distance){
  let travelled=0;
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(travelled+length>=distance){const t=Math.max(0,Math.min(1,(distance-travelled)/(length||1)));return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,segment:i-1,distance};}
    travelled+=length;
  }
  return{...route.points.at(-1),segment:route.points.length-2,distance:travelled};
}
