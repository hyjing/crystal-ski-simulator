import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {pointAlongRoute} from './terrain.js';
import {nearestOnRoute,clamp} from './physics.js';
export const TRAFFIC_LIMIT=4;
export function trafficPoint(route,progress,time,index){
 const p=pointAlongRoute(route,clamp(progress,0,route.length)),q=pointAlongRoute(route,Math.min(route.length,progress+6)),r=pointAlongRoute(route,Math.max(0,progress-3));
 const dx=q.x-r.x,dz=q.z-r.z,len=Math.max(.01,Math.hypot(dx,dz)),offset=(index%2?1:-1)*(1.2+.65*Math.sin(time*.55+index*2));
 return{x:p.x+dz/len*offset,z:p.z-dx/len*offset,heading:Math.atan2(dx,dz),progress:clamp(progress,0,route.length)};
}
export class SkiTraffic{
 constructor(scene,terrain,actors){this.terrain=terrain;this.actors=actors.slice(0,TRAFFIC_LIMIT);this.states=this.actors.map((actor,i)=>({progress:0,time:i*3,poseAge:i*.02,speed:0,heading:0}));this.route=null;this.elapsed=0;this.lastPoseMs=0;this.up=new THREE.Vector3();this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.basis=new THREE.Matrix4();this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();this.sphere=new THREE.Sphere(new THREE.Vector3(),2.2);}
 reset(route,player){this.route=route;const start=nearestOnRoute(player,route.points).progress;this.states.forEach((s,i)=>{s.progress=Math.min(route.length-25,start+55+i*48);s.speed=0;s.time=i*3;s.poseAge=1;});}
 update(dt,player,active,enabled=true,camera){
  if(!this.route)return;if(!active||!enabled){for(const a of this.actors)a.visible=false;this.lastPoseMs=0;return;}this.elapsed+=dt;const start=performance.now(),{up,forward,right,basis}=this;if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
  for(let i=0;i<this.actors.length;i++){
   const actor=this.actors[i],s=this.states[i];actor.visible=active&&enabled;if(!actor.visible)continue;
   const old=trafficPoint(this.route,s.progress,s.time,i),g=this.terrain.gradient(old.x,old.z),slope=Math.max(0,-g.x*Math.sin(old.heading)-g.z*Math.cos(old.heading)),end=Math.max(0,this.route.length-22-s.progress);
   const target=end<10?0:clamp(3.5+slope*15,3.5,10.5);s.speed+=(target-s.speed)*(1-Math.exp(-dt*1.2));s.progress=Math.min(this.route.length-22,s.progress+s.speed*dt);s.time+=dt;
   const p=trafficPoint(this.route,s.progress,s.time,i),distance=Math.hypot(p.x-player.x,p.z-player.z);actor.visible=distance<360;if(!actor.visible)continue;
   actor.position.set(p.x,this.terrain.surface(p.x,p.z)-1200-.07,p.z);if(camera){this.sphere.center.copy(actor.position).y+=.8;actor.visible=this.frustum.intersectsSphere(this.sphere);if(!actor.visible)continue;}const gradient=this.terrain.gradient(p.x,p.z),heading=p.heading+.08*Math.cos(s.time*.55+i*2);
   up.set(-gradient.x,1,-gradient.z).normalize();forward.set(Math.sin(heading),gradient.x*Math.sin(heading)+gradient.z*Math.cos(heading),Math.cos(heading)).normalize();right.crossVectors(up,forward).normalize();basis.makeBasis(right,up,forward);actor.quaternion.setFromRotationMatrix(basis);
   s.poseAge+=dt;const tick=Math.floor((this.elapsed+i*.0165)/.066);if(s.poseAge>.09||tick!==s.poseTick){s.poseTick=tick;const angle=Math.atan2(Math.sin(heading-s.heading),Math.cos(heading-s.heading)),roll=clamp(-Math.atan(angle/Math.max(s.poseAge,.065)*s.speed/9.81),-.40,.40);updateAthletePose(actor,{speed:s.speed,heading,downhillHeading:Math.atan2(-gradient.x,-gradient.z),vx:Math.sin(heading)*s.speed,vz:Math.cos(heading)*s.speed,turn:roll,edgeRoll:roll,edgeAngle:Math.abs(roll),tuck:.1,poling:0},s.poseAge,()=>0);s.heading=heading;s.poseAge=0;}
  }
  this.lastPoseMs=performance.now()-start;
 }
}
export async function createSkiTraffic(scene,terrain){
 const actors=[];for(let i=0;i<TRAFFIC_LIMIT;i++){const actor=createAthleteRig(scene);actor.visible=false;await loadHumanoid(actor,'npc');applyGear(actor,{...Object.values(GEAR_PRESETS)[i%3],helmet:i%2?'#2c343a':'#e8e7df'});actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});for(const arm of actor.userData.arms)arm.basket.visible=false;actors.push(actor);}
 return new SkiTraffic(scene,terrain,actors);
}
