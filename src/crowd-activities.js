import {lonLatToUTM} from './terrain.js';
import {nearestOnRoute,clamp} from './physics.js';
export const SKIER_COUNT=18,LODGE_COUNT=6,CROWD_LIMIT=24,VISIBLE_CROWD_LIMIT=12;
export function crowdRoutes(route,player,routes,count=SKIER_COUNT){
 const other=routes.filter(r=>r.id!==route.id),near=other.filter(r=>r.liftId===route.liftId&&nearestOnRoute(player,r.points).distance<180),plans=[];
 for(let i=0;i<count;i++)plans.push(i<6?(i%3===1&&near.length?near[Math.floor(i/3)%near.length]:route):(other[(i-6)%Math.max(1,other.length)]||route));return plans;
}
export function insideFootprint(p,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function lodgeAnchors(terrain,areas=[],infrastructure={features:[]}){
 const ce=(terrain.originUTM?.[0]||0)+(terrain.width-1)*terrain.spacing/2,cn=(terrain.originUTM?.[1]||0)-(terrain.height-1)*terrain.spacing/2;
 const buildings=infrastructure.features.filter(f=>f.geometry.type==='Polygon').map(f=>{const polygon=f.geometry.coordinates[0].map(ll=>{const p=lonLatToUTM(...ll);return{x:p.e-ce,z:cn-p.n};}),x=polygon.reduce((s,p)=>s+p.x,0)/polygon.length,z=polygon.reduce((s,p)=>s+p.z,0)/polygon.length;return{x,z,polygon,radius:Math.max(...polygon.map(p=>Math.hypot(p.x-x,p.z-z)))};});
 const anchors=areas.map(a=>{const building=buildings.filter(b=>Math.hypot(b.x-a.x,b.z-a.z)<100).sort((b,c)=>Math.hypot(b.x-a.x,b.z-a.z)-Math.hypot(c.x-a.x,c.z-a.z))[0],fx=a.fx||0,fz=a.fz||1;let p={x:a.x+fz*24+fx*8,z:a.z-fx*24+fz*8};if(building){const dx=a.x-building.x,dz=a.z-building.z,l=Math.hypot(dx,dz)||1;p={x:building.x+dx/l*(building.radius+12),z:building.z+dz/l*(building.radius+12)};}const candidates=[p,...[24,-24,34,-34].map(side=>({x:a.x+fz*side+fx*8,z:a.z-fx*side+fz*8}))];const clear=q=>(!terrain.width||(Math.abs(q.x)<(terrain.width-1)*terrain.spacing/2-10&&Math.abs(q.z)<(terrain.height-1)*terrain.spacing/2-10))&&!buildings.some(b=>insideFootprint(q,b.polygon));p=candidates.find(q=>clear(q)&&Math.hypot(terrain.gradient(q.x,q.z).x,terrain.gradient(q.x,q.z).z)<.35)||candidates.find(clear)||p;return{...p,station:a,name:building?'lodge':'station'};});
 return{anchors,buildings};
}
export function lodgeActivity(anchor,time,index){
 const t=((time+index*3)%28+28)%28,walking=t<12,u=clamp(t/12,0,1),angle=2*Math.PI*u*u*(3-2*u),radius=1.5+(index%3)*.35;
 return{x:anchor.x+(Math.cos(angle)-1)*radius,z:anchor.z+Math.sin(angle)*radius,activity:walking?'walk':'rest',gesture:walking?'':t<18?'chat':t<23?'goggles':'stretch'};
}
export function poseInterval(distance){return distance<75?1/24:distance<180?1/12:1/5;}
