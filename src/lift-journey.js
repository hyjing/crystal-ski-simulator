import {stationPoint} from './lift-station-layout.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
export function carrierSeat(c){const p=c.collider.position,q=c.collider.quaternion,h=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));return{x:p.x-.30*Math.cos(h)-.10*Math.sin(h),z:p.z+.30*Math.sin(h)-.10*Math.cos(h),y:p.y-.35,heading:h,sit:1,quaternion:q};}
// Reservation and boarding use the same ascending carrier that is rendered.
export class LiftJourney{
 constructor(){this.phase='idle';this.active=false;}
 begin(station,upper,route,start){if(!station||!upper||!route)return false;this.cancel();Object.assign(this,{lower:station,upper,route,start:{...start},phase:'queue',active:true,age:0,previousProgress:0,visualHeading:start.heading??station.heading,frame:{...start,y:0,heading:station.heading,sit:0},queueEntry:stationPoint(station,-11,33),queueDuration:Math.max(2,Math.hypot(start.x-stationPoint(station,-11,33).x,start.z-stationPoint(station,-11,33).z)/4)+4});return true;}
 update(dt,carriers,surface){if(!this.active)return null;this.age+=Math.max(0,Math.min(dt,.1));
  if(this.phase==='queue'){const p=stationPoint(this.lower,-11,17),first=this.queueDuration-4,inside=this.age>first,from=inside?this.queueEntry:this.start,to=inside?p:this.queueEntry,t=smooth(inside?(this.age-first)/4:this.age/first);this.frame={x:lerp(from.x,to.x,t),z:lerp(from.z,to.z,t),heading:Math.atan2(to.x-from.x,to.z-from.z),sit:0};this.frame.y=surface(this.frame.x,this.frame.z)-1200-.07;if(this.age>=this.queueDuration){this.phase='approaching';this.approachStart={...this.frame};this.age=0;}}
  if(this.phase==='approaching'){const middle=stationPoint(this.lower,-5,13),p=stationPoint(this.lower,-4,3),inside=this.age>2,from=inside?middle:this.approachStart,to=inside?p:middle,t=smooth(inside?(this.age-2)/3:this.age/2);this.frame={x:lerp(from.x,to.x,t),z:lerp(from.z,to.z,t),heading:Math.atan2(to.x-from.x,to.z-from.z),sit:0};this.frame.y=surface(this.frame.x,this.frame.z)-1200-.07;if(this.age>=5){this.phase='waiting';this.age=0;}}
  if(this.phase==='waiting'){const c=carriers.find(c=>String(c.liftId)===String(this.lower.liftId)&&c.ascending===true&&!c.playerReserved&&Number.isFinite(c.travelProgress)&&c.travelProgress<9);if(c){this.carrier=c;c.playerReserved=true;this.boardStart={...this.frame};this.phase='boarding';this.age=0;}}
  if(this.phase==='boarding'){const to=carrierSeat(this.carrier),t=smooth(this.age/1.2);this.frame={...to,x:lerp(this.boardStart.x,to.x,t),z:lerp(this.boardStart.z,to.z,t),y:lerp(this.boardStart.y,to.y,t),sit:t};if(this.age>=1.2){this.phase='riding';this.age=0;}}
  if(this.phase==='riding'){const c=this.carrier;this.frame=carrierSeat(c);if(c.travelProgress>=c.total-12||(this.previousProgress>c.total*.8&&c.travelProgress<this.previousProgress))this.unload(surface);this.previousProgress=c.travelProgress;}
  if(this.phase==='unloading'){const t=smooth(this.age/this.unloadDuration),to=this.route.spawn;this.frame={x:lerp(this.unloadStart.x,to.x,t),z:lerp(this.unloadStart.z,to.z,t),y:0,heading:to.heading??Math.atan2(to.x-this.upper.x,to.z-this.upper.z),sit:1-smooth(this.age/.9)};const ground=surface(this.frame.x,this.frame.z)-1200-.07;this.frame.y=lerp(this.unloadStart.y,ground,smooth(this.age/.8));if(this.age>=this.unloadDuration){this.active=false;this.phase='complete';}}
  const delta=Math.atan2(Math.sin(this.frame.heading-this.visualHeading),Math.cos(this.frame.heading-this.visualHeading));this.visualHeading+=delta*(1-Math.exp(-Math.max(0,dt)*10));this.frame.heading=this.visualHeading;
  return this.frame;
 }
 unload(surface,skip=false){if(this.carrier)this.carrier.playerReserved=false;this.unloadStart=skip||!this.carrier?{x:this.upper.x,z:this.upper.z,y:surface(this.upper.x,this.upper.z)-1200+.4}:{...this.frame};this.age=0;this.phase='unloading';this.unloadDuration=Math.max(3,Math.min(10,Math.hypot(this.route.spawn.x-this.upper.x,this.route.spawn.z-this.upper.z)/4));}
 skip(surface){if(this.active)this.unload(surface,true);}
 cancel(){if(this.carrier)this.carrier.playerReserved=false;this.carrier=null;this.active=false;this.phase='idle';}
}
