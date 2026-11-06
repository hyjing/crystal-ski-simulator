import {pointAlongRoute} from './terrain.js';
import {nearestOnRoute,clamp} from './physics.js';
import {pisteHalfWidth} from './pistes.js';
export const TRAFFIC_PENALTY=100;
export function chooseTrafficRoutes(route,player,routes=[]){
 const alternatives=routes.filter(r=>r!==route&&r.liftId&&r.liftId===route.liftId&&nearestOnRoute(player,r.points).distance<180);
 return [route,alternatives[0]||route,route,alternatives[1]||alternatives[0]||route];
}
export function trafficPoint(route,progress,time,index,avoid=0){
 const at=d=>pointAlongRoute(route,clamp(d,0,route.length)),p=at(progress),q=at(progress+5),r=at(progress-3),dx=q.x-r.x,dz=q.z-r.z,len=Math.max(.01,Math.hypot(dx,dz));
 const style=index%6,width=Math.max(1,pisteHalfWidth(route.name||'',route.difficulty)-4),amplitude=Math.min(width*.70,3.2+style*.6),wavelength=8+style*1.4,wave=(progress/wavelength)+index*1.8;
 const offset=clamp(Math.sin(wave)*amplitude+avoid,-width,width),derivative=Math.cos(wave)*amplitude/wavelength;
 return{x:p.x+dz/len*offset,z:p.z-dx/len*offset,heading:Math.atan2(dx+dz*derivative,dz-dx*derivative),progress:clamp(progress,0,route.length)};
}
// Commit to one passing side for an encounter; transient center-line crossings
// must not reverse the target lane on each decision tick.
export function planAvoidance(state,neighbors,heading,index,dt){
 let brake=1,nearest=null,nearestAlong=Infinity;
 for(const n of neighbors){const dx=n.x-state.point.x,dz=n.z-state.point.z,along=dx*Math.sin(heading)+dz*Math.cos(heading),across=dx*Math.cos(heading)-dz*Math.sin(heading);if(along>-2&&along<20&&Math.abs(across)<5){brake=Math.min(brake,clamp((along-2)/18,.08,1));if(along<nearestAlong){nearestAlong=along;nearest={across};}}}
 if(nearest){state.avoidClear=0;if(!state.avoidSide)state.avoidSide=Math.abs(nearest.across)>.3?-Math.sign(nearest.across):(index%2?1:-1);}
 else{state.avoidClear=(state.avoidClear||0)+dt;if(state.avoidClear>1.2)state.avoidSide=0;}
 return{brake,avoid:(state.avoidSide||0)*3.5};
}
export function sweptContact(from,to,body,radius=.9){
 const dx=to.x-from.x,dz=to.z-from.z,l2=dx*dx+dz*dz,t=l2?clamp(((body.x-from.x)*dx+(body.z-from.z)*dz)/l2,0,1):0;
 return Math.hypot(from.x+dx*t-body.x,from.z+dz*t-body.z)<radius;
}
export function safeRecovery(route,player,terrain,blocked=()=>false){
 const along=nearestOnRoute(player,route.points).progress,heading=player.heading||0;
 for(const back of [8,15,24,35])for(const side of [0,-4,4,-7,7]){
  const p=pointAlongRoute(route,Math.max(route.spawn?.distance||0,along-back)),q=pointAlongRoute(route,Math.max(0,along-back)+4),a=Math.atan2(q.x-p.x,q.z-p.z),x=p.x+Math.cos(a)*side,z=p.z-Math.sin(a)*side,g=terrain.gradient(x,z);
  if(!blocked(x,z)&&Math.hypot(g.x,g.z)<.65)return{x,z,heading:a};
 }
 const p=pointAlongRoute(route,Math.max(0,along-12));return{...p,heading};
}
