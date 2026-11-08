import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {fitSnowContact} from './ground-contact.js';
import {targetNpcPose,blendNpcPose} from './npc-pose.js';
import {stationLayout,staffActivity} from './lift-station-layout.js';
export const STATION_ACTORS=6;
// A fixed pool follows the nearest stations; actors never multiply with map size.
export class StationLife{
 constructor(stations,actors,surface){this.stations=stations;this.actors=actors;this.surface=surface;this.nextSelection=0;this.selected=[];}
 update(time,player,carriers,enabled=true,dt=1/60){
  if(time>=this.nextSelection){this.nextSelection=time+1;this.selected=this.stations.map(s=>({s,d:Math.hypot(s.x-player.x,s.z-player.z)})).filter(v=>v.d<180).sort((a,b)=>(a.d-(this.selected.includes(a.s)?25:0))-(b.d-(this.selected.includes(b.s)?25:0))).slice(0,2).map(v=>v.s);}
  for(let i=0;i<this.actors.length;i++){
   const actor=this.actors[i],station=this.selected[Math.floor(i/3)],role=i%3;actor.visible=!!station&&enabled;if(!actor.visible)continue;
   const layout=stationLayout(station),p=role===2?layout.queue[1]:layout.staff[role],activity=staffActivity(station,carriers,time,role,player);
   actor.position.set(p.x,this.surface(p.x,p.z)-1200-.07,p.z);actor.rotation.set(0,station.heading+(role===2?Math.PI:0),0);
   const pose={pedestrian:true,holding:role===2?undefined:'staff',idleGesture:role===2?'goggles':undefined,headLook:Math.sin(time*.35+i)*.14,staffGesture:role===2?undefined:activity.gesture,staffPhase:activity.phase,speed:0,poseShape:{bend:activity.gesture==='shovel'?.18:0}};
   const changed=actor.userData.stationId!==station.id;actor.userData.stationId=station.id;
   const tick=Math.floor(time*20+i*.17);if(changed||actor.userData.staffTick!==tick){actor.userData.staffTick=tick;targetNpcPose(actor,()=>updateAthletePose(actor,pose,changed?0:.05,this.surface));}blendNpcPose(actor,dt,changed);fitSnowContact(actor,this.surface,role!==2);
   const shovel=actor.userData.shovel;shovel.visible=role===1&&activity.gesture==='shovel';
   if(shovel.visible){const glove=actor.userData.arms[1].glove;actor.updateWorldMatrix(true,true);shovel.position.copy(actor.worldToLocal(glove.getWorldPosition(new THREE.Vector3())));const other=actor.worldToLocal(actor.userData.arms[0].glove.getWorldPosition(new THREE.Vector3()));shovel.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),other.sub(shovel.position).normalize());}
  }
 }
}
export async function createStationLife(scene,stations,surface){
 const actors=[];for(let i=0;i<STATION_ACTORS;i++){
  const actor=createAthleteRig(scene);actor.visible=false;await loadHumanoid(actor,'npc');const worker=i%3!==2;
  applyGear(actor,worker?{...GEAR_PRESETS.blue,jacket:'#edaa32',pants:'#26394b',helmet:'#e9e4d7'}:GEAR_PRESETS.cream);
  actor.userData.skiRig.visible=!worker;for(const a of actor.userData.arms)a.pole.visible=a.basket.visible=false;
  const shovel=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:'#798b98',roughness:.6});
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,2.6,6),metal);shaft.position.y=-.55;shovel.add(shaft);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.42,.46,.07),metal);blade.position.set(0,-1.75,.05);shovel.add(blade);actor.add(shovel);actor.userData.shovel=shovel;
  actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});actors.push(actor);
 }return new StationLife(stations,actors,surface);
}
