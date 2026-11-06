import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {pointAlongRoute} from './terrain.js';
import {nearestOnRoute,clamp} from './physics.js';
import {trafficPoint,chooseTrafficRoutes,sweptContact} from './traffic-brain.js';
export {trafficPoint} from './traffic-brain.js';
export const TRAFFIC_LIMIT=4;
export class SkiTraffic{
 constructor(scene,terrain,actors){this.terrain=terrain;this.actors=actors.slice(0,TRAFFIC_LIMIT);this.states=this.actors.map((actor,i)=>({progress:0,time:i*3,poseAge:i*.02,speed:0,heading:0}));this.route=null;this.elapsed=0;this.lastPoseMs=0;this.up=new THREE.Vector3();this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.basis=new THREE.Matrix4();this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();this.sphere=new THREE.Sphere(new THREE.Vector3(),2.2);}
 reset(route,player,routes=[]){this.route=route;const plans=chooseTrafficRoutes(route,player,routes);this.states.forEach((s,i)=>{s.route=plans[i];const start=nearestOnRoute(player,s.route.points).progress;s.progress=Math.min(s.route.length-25,start+40+i*38);s.speed=0;s.time=i*3;s.poseAge=1;s.avoid=0;s.fall=0;s.cooldown=0;s.point=trafficPoint(s.route,s.progress,s.time,i);s.heading=s.point.heading;});}
 step(dt,player,enabled=true,obstacles=()=>[]){
  this.enabled=enabled;if(!this.route||!enabled)return;this.elapsed+=dt;
  for(let i=0;i<this.states.length;i++){
   const s=this.states[i];s.poseAge+=dt;s.cooldown=Math.max(0,(s.cooldown||0)-dt);if(s.fall>0){s.fall=Math.max(0,s.fall-dt);continue;}
   const p=s.point,g=this.terrain.gradient(p.x,p.z),slope=Math.max(0,-g.x*Math.sin(p.heading)-g.z*Math.cos(p.heading));let brake=1,avoid=0;
   const neighbors=[player,...this.states.filter(n=>n!==s&&n.point).map(n=>n.point),...obstacles(p.x,p.z)];
   for(const n of neighbors){const dx=n.x-p.x,dz=n.z-p.z,along=dx*Math.sin(p.heading)+dz*Math.cos(p.heading),across=dx*Math.cos(p.heading)-dz*Math.sin(p.heading);if(along>-2&&along<20&&Math.abs(across)<5){brake=Math.min(brake,clamp((along-2)/18,.08,1));avoid+=(across>0?-1:across<0?1:(i%2?1:-1))*3.5;}}
   s.avoid+=(clamp(avoid,-5,5)-s.avoid)*(1-Math.exp(-dt*2));const remaining=s.route.length-22-s.progress,target=remaining<10?0:clamp(3.2+slope*16+i*.65,3.2,12)*brake;
   s.speed+=(target-s.speed)*(1-Math.exp(-dt*(brake<.7?4:1.2)));s.progress=Math.min(s.route.length-22,s.progress+s.speed*dt);s.time+=dt;s.point=trafficPoint(s.route,s.progress,s.time,i,s.avoid);
  }
 }
 collide(from,player){
  if(!this.enabled||player.crashRemaining>0||player.trafficGrace>0)return null;
  for(let i=0;i<this.states.length;i++){const s=this.states[i],p=s.point;if(!p||s.cooldown>0||s.fall>0)continue;
   const separation=(player.airborne?player.airY:this.terrain.surface(player.x,player.z))-this.terrain.surface(p.x,p.z);
   if(Math.abs(separation)<1.6&&sweptContact(from,player,p)){s.fall=1.5;s.cooldown=4;s.speed=0;return i;}
  }return null;
 }
 update(dt,player,active,enabled=true,camera){
  if(!this.route)return;if(!active||!enabled){for(const a of this.actors)a.visible=false;this.lastPoseMs=0;return;}if(dt>0)this.step(dt,player,enabled);const start=performance.now(),{up,forward,right,basis}=this;if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
  for(let i=0;i<this.actors.length;i++){
   const actor=this.actors[i],s=this.states[i];actor.visible=active&&enabled;if(!actor.visible)continue;
   const p=s.point,distance=Math.hypot(p.x-player.x,p.z-player.z);actor.visible=distance<360;if(!actor.visible)continue;
   actor.position.set(p.x,this.terrain.surface(p.x,p.z)-1200-.07,p.z);if(camera){this.sphere.center.copy(actor.position).y+=.8;actor.visible=this.frustum.intersectsSphere(this.sphere);if(!actor.visible)continue;}const gradient=this.terrain.gradient(p.x,p.z),heading=p.heading;
   up.set(-gradient.x,1,-gradient.z).normalize();forward.set(Math.sin(heading),gradient.x*Math.sin(heading)+gradient.z*Math.cos(heading),Math.cos(heading)).normalize();right.crossVectors(up,forward).normalize();basis.makeBasis(right,up,forward);actor.quaternion.setFromRotationMatrix(basis);if(s.fall>0)actor.rotateZ(Math.min(1,s.fall/.4)*1.25);
   const tick=Math.floor((this.elapsed+i*.0165)/.066);if(s.poseAge>.09||tick!==s.poseTick){s.poseTick=tick;const angle=Math.atan2(Math.sin(heading-s.heading),Math.cos(heading-s.heading)),roll=clamp(-Math.atan(angle/Math.max(s.poseAge,.065)*s.speed/9.81),-.40,.40);updateAthletePose(actor,{speed:s.speed,heading,downhillHeading:Math.atan2(-gradient.x,-gradient.z),vx:Math.sin(heading)*s.speed,vz:Math.cos(heading)*s.speed,turn:roll,edgeRoll:roll,edgeAngle:Math.abs(roll),tuck:.1,poling:0},s.poseAge,()=>0);s.heading=heading;s.poseAge=0;}
  }
  this.lastPoseMs=performance.now()-start;
 }
}
export async function createSkiTraffic(scene,terrain){
 const actors=[];for(let i=0;i<TRAFFIC_LIMIT;i++){const actor=createAthleteRig(scene);actor.visible=false;await loadHumanoid(actor,'npc');applyGear(actor,{...Object.values(GEAR_PRESETS)[i%3],helmet:i%2?'#2c343a':'#e8e7df'});actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});for(const arm of actor.userData.arms)arm.basket.visible=false;actors.push(actor);}
 return new SkiTraffic(scene,terrain,actors);
}
