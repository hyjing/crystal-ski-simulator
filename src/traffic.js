import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {nearestOnRoute,clamp} from './physics.js';
import {trafficPoint,sweptContact} from './traffic-brain.js';
import {crowdRoutes,lodgeAnchors,lodgeActivity,insideFootprint,poseInterval,SKIER_COUNT,CROWD_LIMIT,VISIBLE_CROWD_LIMIT} from './crowd-activities.js';
import {fitSnowContact} from './ground-contact.js';
export {trafficPoint} from './traffic-brain.js';
export const TRAFFIC_LIMIT=CROWD_LIMIT;
export class SkiTraffic{
 constructor(scene,terrain,actors,options={}){this.terrain=terrain;this.actors=actors.slice(0,TRAFFIC_LIMIT);this.states=this.actors.map((actor,i)=>({kind:i<SKIER_COUNT?'ski':'lodge',progress:0,time:i*1.7,poseAge:i*.02,speed:0,heading:0}));this.lodges=lodgeAnchors(terrain,options.stationAreas,options.infrastructure);this.route=null;this.elapsed=0;this.lastPoseMs=0;this.lastVisibleCount=0;this.up=new THREE.Vector3();this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.basis=new THREE.Matrix4();this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();this.sphere=new THREE.Sphere(new THREE.Vector3(),2.2);this.viewPoint={x:0,z:0};}
 reset(route,player,routes=[]){
  this.route=route;const plans=crowdRoutes(route,player,routes),top=route.points[0],bottom=route.points.at(-1),anchors=this.lodges.anchors;
  const closest=p=>[...anchors].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  const upper=closest(top),lower=closest(bottom),ordered=[upper,lower,...anchors.filter(a=>a!==upper&&a!==lower)].filter(Boolean);
  this.states.forEach((s,i)=>{const actor=this.actors[i];actor.userData.plant={};actor.userData.lean=0;actor.userData.counterYaw=undefined;for(const arm of actor.userData.arms||[])arm.npcHand=null;s.speed=0;s.time=i*1.7;s.poseAge=1;s.avoid=0;s.fall=0;s.cooldown=0;s.decisionAge=1;s.roll=0;s.tuck=0;s.walkPhase=0;s.phase=0;s.walkAmount=0;s.activity='ski';
   if(s.kind==='ski'){s.route=plans[i];const start=nearestOnRoute(player,s.route.points).progress;s.progress=i<6?Math.min(s.route.length-25,start+25+i*32):s.route.length*(.15+.70*((i*.381966)%1));s.point=trafficPoint(s.route,s.progress,s.time,i);}
   else{const j=i-SKIER_COUNT,anchor=ordered[Math.floor(j/2)%Math.max(1,ordered.length)]||{x:(j<3?top:bottom).x+24,z:(j<3?top:bottom).z+8};s.anchor={x:anchor.x+(j%2)*4,z:anchor.z+(j%2)*2};const activity=lodgeActivity(s.anchor,s.time,j);s.point={x:s.anchor.x,z:s.anchor.z,heading:j%2?Math.PI*.6:Math.PI*1.6};s.activity=activity.activity;s.gesture=activity.gesture;}
   s.heading=s.point.heading;s.previousHeading=s.heading;
  });
 }
 step(dt,player,enabled=true,obstacles=()=>[]){
  this.enabled=enabled;if(!this.route||!enabled)return;this.elapsed+=dt;
  for(let i=0;i<this.states.length;i++){
   const s=this.states[i];s.poseAge+=dt;s.time+=dt;s.cooldown=Math.max(0,s.cooldown-dt);if(s.fall>0){s.fall=Math.max(0,s.fall-dt);continue;}
   if(s.kind==='lodge'){this.stepVisitor(s,i,dt,player,obstacles);continue;}
   const old=s.point,distance=Math.hypot(old.x-player.x,old.z-player.z);s.decisionAge+=dt;
   if(s.decisionAge>=(distance<250?.10:.5)){
    s.decisionAge=0;const g=this.terrain.gradient(old.x,old.z);s.slope=Math.max(0,-g.x*Math.sin(old.heading)-g.z*Math.cos(old.heading));let brake=1,avoid=0;
    if(distance<350){const neighbors=[player,...this.states.filter(n=>n!==s&&n.point).map(n=>n.point),...obstacles(old.x,old.z)];
     for(const n of neighbors){const dx=n.x-old.x,dz=n.z-old.z,along=dx*Math.sin(old.heading)+dz*Math.cos(old.heading),across=dx*Math.cos(old.heading)-dz*Math.sin(old.heading);if(along>-2&&along<20&&Math.abs(across)<5){brake=Math.min(brake,clamp((along-2)/18,.08,1));avoid+=(across>0?-1:across<0?1:(i%2?1:-1))*3.5;}}}
    s.brake=brake;s.avoidTarget=clamp(avoid,-5,5);s.target=clamp(3.2+s.slope*16+(i%6)*.45,3.2,11.5)*brake;
   }
   s.avoid+=(s.avoidTarget-s.avoid)*(1-Math.exp(-dt*2));const remaining=s.route.length-22-s.progress,target=remaining<10?0:s.target;
   s.speed+=(target-s.speed)*(1-Math.exp(-dt*(s.brake<.7?4:1.2)));s.progress=Math.min(s.route.length-22,s.progress+s.speed*dt);s.point=trafficPoint(s.route,s.progress,s.time,i,s.avoid);
   const dx=s.point.x-old.x,dz=s.point.z-old.z;if(Math.hypot(dx,dz)>.00001)s.point.heading=Math.atan2(dx,dz);
   const yaw=Math.atan2(Math.sin(s.point.heading-s.heading),Math.cos(s.point.heading-s.heading));s.heading+=yaw*(1-Math.exp(-dt*10));const rate=Math.atan2(Math.sin(s.heading-s.previousHeading),Math.cos(s.heading-s.previousHeading))/Math.max(dt,.001);s.previousHeading=s.heading;
   s.roll+=(clamp(-Math.atan(rate*s.speed/9.81),-.55,.55)-s.roll)*(1-Math.exp(-dt*6));s.tuck+=((s.speed>8.5&&Math.abs(s.roll)<.12?.5:.08)-s.tuck)*(1-Math.exp(-dt*2));s.poling=s.speed<3&&s.slope<.10?.65:0;s.phase=(s.phase+dt*1.15)%1;
  }
 }
 stepVisitor(s,i,dt,player,obstacles){
  const desired=lodgeActivity(s.anchor,s.time,i-SKIER_COUNT),dx=desired.x-s.point.x,dz=desired.z-s.point.z,d=Math.hypot(dx,dz),travel=Math.min(d,dt*1.2),next={x:s.point.x+dx/Math.max(d,.0001)*travel,z:s.point.z+dz/Math.max(d,.0001)*travel};
  const blocked=this.lodges.buildings.some(b=>insideFootprint(next,b.polygon))||obstacles(next.x,next.z).some(t=>Math.hypot(t.x-next.x,t.z-next.z)<1.2)||Math.hypot(next.x-player.x,next.z-player.z)<1.5||this.states.some(n=>n!==s&&n.point&&Math.hypot(n.point.x-next.x,n.point.z-next.z)<.8);
  s.speed=blocked?0:travel/Math.max(dt,.001);if(!blocked&&travel>.001){s.point.x=next.x;s.point.z=next.z;const target=Math.atan2(dx,dz);s.heading+=Math.atan2(Math.sin(target-s.heading),Math.cos(target-s.heading))*(1-Math.exp(-dt*6));}s.point.heading=s.heading;s.walkAmount+=(clamp(s.speed/.8,0,1)-s.walkAmount)*(1-Math.exp(-dt*8));s.walkPhase+=s.speed*dt*6;s.activity=s.speed>.1?'walk':'rest';s.gesture=s.activity==='walk'?'':desired.gesture||'chat';
 }
 collide(from,player){
  if(!this.enabled||player.crashRemaining>0||player.trafficGrace>0)return null;
  for(let i=0;i<this.states.length;i++){const s=this.states[i],p=s.point;if(!p||s.cooldown>0||s.fall>0||Math.hypot(player.x-p.x,player.z-p.z)>Math.hypot(player.x-from.x,player.z-from.z)+2)continue;
   const separation=(player.airborne?player.airY:this.terrain.surface(player.x,player.z))-this.terrain.surface(p.x,p.z);
   if(Math.abs(separation)<1.6&&sweptContact(from,player,p,s.kind==='lodge'?.75:.9)){s.fall=1.5;s.cooldown=4;s.speed=0;return i;}
  }return null;
 }
 update(dt,player,active,enabled=true,camera){
  if(!this.route)return;if(!active||!enabled){for(const a of this.actors)a.visible=false;this.lastPoseMs=0;this.lastVisibleCount=0;return;}const start=performance.now();if(dt>0)this.step(dt,player,enabled);const {up,forward,right,basis}=this;this.viewPoint={x:camera?.position.x??player.x,z:camera?.position.z??player.z};if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
  const visible=[];
  for(let i=0;i<this.actors.length;i++){const actor=this.actors[i],s=this.states[i],p=s.point,wasVisible=actor.visible,distance=Math.hypot(p.x-this.viewPoint.x,p.z-this.viewPoint.z);actor.visible=false;if(distance>480)continue;this.sphere.center.set(p.x,this.terrain.surface(p.x,p.z)-1200+.8,p.z);if(camera&&!this.frustum.intersectsSphere(this.sphere))continue;visible.push({i,distance,priority:distance-(wasVisible?30:0)});}
  visible.sort((a,b)=>a.priority-b.priority);this.lastVisibleCount=Math.min(visible.length,VISIBLE_CROWD_LIMIT);
  for(const {i,distance} of visible.slice(0,VISIBLE_CROWD_LIMIT)){
   const actor=this.actors[i],s=this.states[i],p=s.point,walking=s.kind==='lodge';actor.visible=true;actor.position.set(p.x,this.terrain.surface(p.x,p.z)-1200-.07,p.z);
   const gradient=walking?{x:0,z:0}:this.terrain.gradient(p.x,p.z),heading=s.heading;
   up.set(-gradient.x,1,-gradient.z).normalize();forward.set(Math.sin(heading),gradient.x*Math.sin(heading)+gradient.z*Math.cos(heading),Math.cos(heading)).normalize();right.crossVectors(up,forward).normalize();basis.makeBasis(right,up,forward);actor.quaternion.setFromRotationMatrix(basis);if(s.fall>0)actor.rotateZ(Math.min(1,s.fall/.4)*1.25);
   const interval=poseInterval(distance),tick=Math.floor((this.elapsed+i*.013)/interval);if(s.poseAge>=interval||tick!==s.poseTick){s.poseTick=tick;if(s.poseAge>.5)actor.userData.plant={};updateAthletePose(actor,{speed:s.speed,heading,downhillHeading:Math.atan2(-gradient.x,-gradient.z),vx:Math.sin(heading)*s.speed,vz:Math.cos(heading)*s.speed,turn:s.roll,steerInput:clamp(s.roll*3,-1,1),edgeRoll:s.roll,edgeAngle:Math.abs(s.roll),tuck:s.tuck,poling:s.poling||0,polePhase:s.phase,walkAmount:s.walkAmount,walkPhase:s.walkPhase,idleShift:walking?Math.sin(s.time*.5+i)*.35:0,headLook:walking?Math.sin(s.time*.32+i)*.3:0,idleGesture:walking?s.gesture:'',activityTime:s.time,softHands:true,crashRemaining:s.fall},Math.min(s.poseAge,.2),(x,z)=>this.terrain.surface(x,z)-1200);s.poseAge=0;}
   if(actor.userData.skiRig){actor.userData.skiRig.visible=!walking;for(const arm of actor.userData.arms){arm.pole.visible=!walking;arm.basket.visible=false;}}fitSnowContact(actor,(x,z)=>this.terrain.surface(x,z),walking);
  }
  this.lastPoseMs=performance.now()-start;
 }
}
export async function createSkiTraffic(scene,terrain,options={}){
 const actors=[];for(let i=0;i<TRAFFIC_LIMIT;i++){const actor=createAthleteRig(scene);actor.visible=false;await loadHumanoid(actor,'npc');applyGear(actor,{...Object.values(GEAR_PRESETS)[i%3],helmet:i%2?'#2c343a':'#e8e7df'});actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});for(const arm of actor.userData.arms)arm.basket.visible=false;actors.push(actor);}
 return new SkiTraffic(scene,terrain,actors,options);
}
