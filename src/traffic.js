import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {nearestOnRoute,clamp} from './physics.js';
import {trafficPoint,sweptContact,planAvoidance} from './traffic-brain.js';
import {crowdRoutes,lodgeAnchors,insideFootprint,poseInterval,SKIER_COUNT,CROWD_LIMIT,VISIBLE_CROWD_LIMIT} from './crowd-activities.js';
import {makeVisitorSite,siteLocal,sitePoint,beginVisitor,advanceVisitor,visitorSurface,advanceSkierRoutine,fallAnimation} from './npc-routines.js';
import {createRestArea,setVisitorProp,updateVisitorProp} from './rest-area.js';
import {targetNpcPose,blendNpcPose} from './npc-pose.js';
import {fitSnowContact} from './ground-contact.js';
export {trafficPoint} from './traffic-brain.js';
export const TRAFFIC_LIMIT=CROWD_LIMIT;
export class SkiTraffic{
 constructor(scene,terrain,actors,options={}){this.scene=scene;this.onStructuresChanged=options.onStructuresChanged;this.restAreas=[];this.sites=[];this.terrain=terrain;this.actors=actors.slice(0,TRAFFIC_LIMIT);this.states=this.actors.map((actor,i)=>({kind:i<SKIER_COUNT?'ski':'lodge',progress:0,time:i*1.7,poseAge:i*.02,speed:0,heading:0}));this.lodges=lodgeAnchors(terrain,options.stationAreas,options.infrastructure);this.route=null;this.elapsed=0;this.lastPoseMs=0;this.lastVisibleCount=0;this.up=new THREE.Vector3();this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.basis=new THREE.Matrix4();this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();this.sphere=new THREE.Sphere(new THREE.Vector3(),2.2);this.viewPoint={x:0,z:0};}
 reset(route,player,routes=[]){
  this.route=route;const plans=crowdRoutes(route,player,routes),top=route.points[0],bottom=route.points.at(-1),anchors=this.lodges.anchors;
  const closest=p=>[...anchors].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  const upper=closest(top),lower=closest(bottom),ordered=[upper,lower,...anchors.filter(a=>a!==upper&&a!==lower)].filter(Boolean),unique=[];for(const a of ordered)if(unique.every(b=>Math.hypot(a.x-b.x,a.z-b.z)>18))unique.push(a);
  for(const area of this.restAreas)area.dispose();this.sites=Array.from({length:3},(_,i)=>makeVisitorSite(unique[i]||{x:(i===1?bottom:top).x+(i===2?-28:28),z:(i===1?bottom:top).z+8},this.terrain,i));this.restAreas=this.sites.map(site=>createRestArea(this.scene,this.terrain,site));this.onStructuresChanged?.();
  this.states.forEach((s,i)=>{const actor=this.actors[i];actor.userData.plant={};actor.userData.lean=0;actor.userData.counterYaw=undefined;for(const arm of actor.userData.arms||[])arm.npcHand=null;s.speed=0;s.time=i*1.7;s.poseAge=1;s.avoid=0;s.avoidSide=0;s.avoidClear=0;s.fall=0;s.cooldown=0;s.decisionAge=1;s.roll=0;s.tuck=0;s.walkPhase=0;s.phase=0;s.walkAmount=0;s.activity='ski';s.routineClock=i<6?0:(i*3)%40;s.nextPause=undefined;s.nextFall=undefined;
   if(s.kind==='ski'){s.route=plans[i];const start=nearestOnRoute(player,s.route.points).progress;s.progress=i<6?Math.min(s.route.length-25,start+25+i*32):s.route.length*(.15+.70*((i*.381966)%1));s.point=trafficPoint(s.route,s.progress,s.time,i);}
   else{const j=i-SKIER_COUNT;beginVisitor(s,this.sites[Math.floor(j/2)],j);s.seatGround=this.terrain.surface(s.point.x,s.point.z);setVisitorProp(actor,s.prop);}
   s.heading=s.point.heading;s.previousHeading=s.heading;
  });
 }
 step(dt,player,enabled=true,obstacles=()=>[]){
  this.enabled=enabled;if(!this.route||!enabled)return;this.elapsed+=dt;
  for(let i=0;i<this.states.length;i++){
   const s=this.states[i];s.poseAge+=dt;s.time+=dt;s.cooldown=Math.max(0,s.cooldown-dt);if(s.fall>0){s.fall=Math.max(0,s.fall-dt);continue;}
   if(s.kind==='lodge'){this.stepVisitor(s,i,dt,player,obstacles);continue;}
   const old=s.point,distance=Math.hypot(old.x-player.x,old.z-player.z),profile=advanceSkierRoutine(s,i,dt);if(s.fall>0)continue;s.decisionAge+=dt;
   if(s.decisionAge>=(distance<250?.10:.5)){
    const decisionDt=s.decisionAge;s.decisionAge=0;const path=trafficPoint(s.route,s.progress,s.time,i),g=this.terrain.gradient(old.x,old.z);s.slope=Math.max(0,-g.x*Math.sin(path.heading)-g.z*Math.cos(path.heading));
    const neighbors=distance<350?[player,...this.states.filter(n=>n!==s&&n.point&&!n.indoor).map(n=>n.point),...obstacles(old.x,old.z)]:[];
    const plan=planAvoidance(s,neighbors,path.heading,i,decisionDt);s.brake=plan.brake;s.avoidTarget=plan.avoid;s.target=clamp((3.2+s.slope*16)*profile.speed,2.2,18)*plan.brake;
   }
   if(s.activity==='pull-over'||s.activity==='pause'){s.avoidTarget=s.parkingSide*12;s.target=s.activity==='pause'?0:1.8;}
   const lateralLimit=(.25+s.speed*.30)*dt;s.avoid+=clamp((s.avoidTarget-s.avoid)*(1-Math.exp(-dt*1.5)),-lateralLimit,lateralLimit);const remaining=s.route.length-22-s.progress,target=remaining<10?0:s.target;
   s.speed+=(target-s.speed)*(1-Math.exp(-dt*(s.brake<.7?4:1.2)));s.progress=Math.min(s.route.length-22,s.progress+s.speed*dt);s.point=trafficPoint(s.route,s.progress,s.time,i,s.avoid);
   const stepLength=Math.hypot(s.point.x-old.x,s.point.z-old.z),maxStep=s.speed*dt*1.3;if(stepLength>maxStep&&stepLength>0){s.point.x=old.x+(s.point.x-old.x)*maxStep/stepLength;s.point.z=old.z+(s.point.z-old.z)*maxStep/stepLength;}
   const dx=s.point.x-old.x,dz=s.point.z-old.z;if(Math.hypot(dx,dz)>.00001)s.point.heading=Math.atan2(dx,dz);
   if(s.activity==='pause'&&s.speed<.15){s.point={...old};}else if(Math.hypot(dx,dz)<.001)s.point.heading=s.heading;
   const yaw=Math.atan2(Math.sin(s.point.heading-s.heading),Math.cos(s.point.heading-s.heading));s.heading+=clamp(yaw*(1-Math.exp(-dt*6)),-dt*1.8,dt*1.8);const rate=Math.atan2(Math.sin(s.heading-s.previousHeading),Math.cos(s.heading-s.previousHeading))/Math.max(dt,.001);s.previousHeading=s.heading;
   s.roll+=(clamp(-Math.atan(rate*s.speed/9.81),-.55,.55)-s.roll)*(1-Math.exp(-dt*6));s.tuck+=((s.speed>8.5&&Math.abs(s.roll)<.12?.5:.08)-s.tuck)*(1-Math.exp(-dt*2));s.poling=s.activity==='ski'&&s.speed<3&&s.slope<.10?.65:0;s.phase=(s.phase+dt*1.15)%1;
  }
  for(let i=0;i<this.sites.length;i++){const site=this.sites[i],open=this.states.some(s=>s.kind==='lodge'&&s.site===site&&(s.wantDoor||(!s.indoor&&Math.hypot(s.point.x-sitePoint(site,0,-2.5).x,s.point.z-sitePoint(site,0,-2.5).z)<1.5)));site.doorOpen+=((open?1:0)-site.doorOpen)*(1-Math.exp(-dt*6));this.restAreas[i]?.update();}
 }
 stepVisitor(s,i,dt,player,obstacles){
  advanceVisitor(s,dt,(next,throughDoor)=>{
   if(this.lodges.buildings.some(b=>insideFootprint(next,b.polygon)))return false;
   for(const site of this.sites){const p=siteLocal(site,next);if(Math.abs(p.x)<2.7&&p.z< -2.3&&p.z> -6.7&&!(site===s.site&&throughDoor&&Math.abs(p.x)<.55))return false;}
   return !obstacles(next.x,next.z).some(t=>Math.hypot(t.x-next.x,t.z-next.z)<1.2)&&Math.hypot(next.x-player.x,next.z-player.z)>=1.5&&!this.states.some(n=>n!==s&&!n.indoor&&n.point&&Math.hypot(n.point.x-next.x,n.point.z-next.z)<.65);
  });
  s.activity=s.action;s.gesture='';
 }

 collide(from,player){
  if(!this.enabled||player.crashRemaining>0||player.trafficGrace>0)return null;
  for(let i=0;i<this.states.length;i++){const s=this.states[i],p=s.point;if(!p||s.indoor||s.cooldown>0||s.fall>0||Math.hypot(player.x-p.x,player.z-p.z)>Math.hypot(player.x-from.x,player.z-from.z)+2)continue;
   const separation=(player.airborne?player.airY:this.terrain.surface(player.x,player.z))-this.terrain.surface(p.x,p.z);
   if(Math.abs(separation)<1.6&&sweptContact(from,player,p,s.kind==='lodge'?.75:.9)){s.fall=1.5;s.fallDuration=1.5;s.cooldown=4;s.speed=0;return i;}
  }return null;
 }
 update(dt,player,active,enabled=true,camera,frameDt=dt){
  if(!this.route)return;if(!active||!enabled){for(const a of this.actors)a.visible=false;this.lastPoseMs=0;this.lastVisibleCount=0;return;}const start=performance.now();if(dt>0)this.step(dt,player,enabled);const {up,forward,right,basis}=this;this.viewPoint={x:camera?.position.x??player.x,z:camera?.position.z??player.z};if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
  const visible=[];
  for(let i=0;i<this.actors.length;i++){const actor=this.actors[i],s=this.states[i],p=s.point,wasVisible=actor.visible,distance=Math.hypot(p.x-this.viewPoint.x,p.z-this.viewPoint.z);actor.visible=false;if(s.indoor||distance>(wasVisible?500:470))continue;this.sphere.center.set(p.x,this.terrain.surface(p.x,p.z)-1200+.8,p.z);this.sphere.radius=wasVisible?4:2.2;if(camera&&!this.frustum.intersectsSphere(this.sphere))continue;visible.push({i,distance,wasVisible,priority:distance-(wasVisible?60:0)});}
  visible.sort((a,b)=>a.priority-b.priority);this.lastVisibleCount=Math.min(visible.length,VISIBLE_CROWD_LIMIT);
  for(const {i,distance,wasVisible} of visible.slice(0,VISIBLE_CROWD_LIMIT)){
   const actor=this.actors[i],s=this.states[i],p=s.point,walking=s.kind==='lodge';actor.visible=true;const snow=(x,z)=>walking?visitorSurface(s.site,x,z,(u,v)=>this.terrain.surface(u,v)):this.terrain.surface(x,z),base=snow(p.x,p.z),ground=walking?base+((s.seatGround??base)-base)*(s.sit||0):base;actor.position.set(p.x,ground-1200-.07,p.z);
   const gradient=walking?{x:0,z:0}:this.terrain.gradient(p.x,p.z),heading=s.heading;
   up.set(-gradient.x,1,-gradient.z).normalize();forward.set(Math.sin(heading),gradient.x*Math.sin(heading)+gradient.z*Math.cos(heading),Math.cos(heading)).normalize();right.crossVectors(up,forward).normalize();basis.makeBasis(right,up,forward);const rootTarget=new THREE.Quaternion().setFromRotationMatrix(basis);const fall=fallAnimation(s.fall,s.fallDuration||1.5);if(s.fall>0)rootTarget.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),fall.amount*1.25));if(!wasVisible||!frameDt)actor.quaternion.copy(rootTarget);else actor.quaternion.slerp(rootTarget,1-Math.exp(-frameDt*10));
   const interval=poseInterval(distance),tick=Math.floor((this.elapsed+i*.013)/interval);if(!wasVisible||s.poseAge>=interval||tick!==s.poseTick){s.poseTick=tick;if(s.poseAge>.5)actor.userData.plant={};targetNpcPose(actor,()=>updateAthletePose(actor,{speed:s.speed,heading,downhillHeading:Math.atan2(-gradient.x,-gradient.z),vx:Math.sin(heading)*s.speed,vz:Math.cos(heading)*s.speed,turn:s.roll,steerInput:clamp(s.roll*3,-1,1),edgeRoll:s.roll,edgeAngle:Math.abs(s.roll),tuck:s.tuck,poling:s.poling||0,polePhase:s.phase,walkAmount:s.walkAmount,walkPhase:s.walkPhase,idleShift:walking?Math.sin(s.time*.5+i)*.35:0,headLook:walking?Math.sin(s.time*.32+i)*.3:0,idleGesture:'',pedestrian:walking,sitAmount:walking?s.sit:0,riseLean:s.riseLean||0,holding:walking?s.prop:null,consumeAmount:s.consume||0,fallAmount:fall.amount,fallBrace:fall.brace,activityTime:s.time,softHands:true,crashRemaining:s.fall},Math.min(s.poseAge,.2),(x,z)=>snow(x,z)-1200));s.poseAge=0;}blendNpcPose(actor,frameDt,!wasVisible);
   if(actor.userData.skiRig){actor.userData.skiRig.visible=!walking;for(const arm of actor.userData.arms){arm.pole.visible=!walking;arm.basket.visible=false;}}if(!walking||s.sit<.95)fitSnowContact(actor,snow,walking);if(walking)updateVisitorProp(actor,s.fall<=0,s.consume||0);
  }
  this.lastPoseMs=performance.now()-start;
 }
}
export async function createSkiTraffic(scene,terrain,options={}){
 const actors=[];for(let i=0;i<TRAFFIC_LIMIT;i++){const actor=createAthleteRig(scene);actor.visible=false;await loadHumanoid(actor,'npc');applyGear(actor,{...Object.values(GEAR_PRESETS)[i%3],helmet:i%2?'#2c343a':'#e8e7df'});actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});for(const arm of actor.userData.arms)arm.basket.visible=false;actors.push(actor);}
 return new SkiTraffic(scene,terrain,actors,options);
}
