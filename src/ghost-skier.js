import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {ghostMotion} from './run-ghost.js';

export class GhostSkier {
  constructor(scene){
    this.actor=createAthleteRig(scene);
    this.actor.visible=false;
    this.material=new THREE.MeshStandardMaterial({
      color:'#62bfff',emissive:'#197fc5',emissiveIntensity:.8,roughness:.85,
      transparent:true,opacity:.42,depthWrite:false,
    });
    this.shade();
    loadHumanoid(this.actor).then(()=>this.shade()).catch(()=>{});
    this.heading=0;
    this.poseAge=0;
    this.normal=new THREE.Vector3();
    this.forward=new THREE.Vector3();
    this.right=new THREE.Vector3();
    this.basis=new THREE.Matrix4();
  }

  shade(){
    this.actor.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.material=this.material;
      mesh.castShadow=mesh.receiveShadow=false;
    });
    this.poseAge=1;
  }

  update(ghost,time,dt,player,surface,gradient){
    const pose=ghostMotion(ghost,time,this.heading);
    const distance=pose?Math.hypot(pose.x-player.x,pose.z-player.z):0;
    const wasVisible=this.actor.visible;
    this.actor.visible=distance>2;
    if(!pose)return null;
    this.heading=pose.heading;
    if(!this.actor.visible)return pose;
    this.material.opacity=.42*THREE.MathUtils.smoothstep(distance,2,5);
    const ground=surface(pose.x,pose.z);
    const airClearance=Math.max(0,pose.y-ground);
    const airborne=airClearance>.45;
    const g=airborne?{x:0,z:0}:gradient(pose.x,pose.z);
    const fx=Math.sin(pose.heading),fz=Math.cos(pose.heading);
    this.actor.position.set(pose.x,Math.max(ground,pose.y)-.07,pose.z);
    this.normal.set(-g.x,1,-g.z).normalize();
    this.forward.set(fx,g.x*fx+g.z*fz,fz).normalize();
    this.right.crossVectors(this.normal,this.forward);
    this.actor.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right,this.normal,this.forward));
    this.poseAge+=dt;
    if(!wasVisible||this.poseAge>=1/24){
      updateAthletePose(this.actor,{
        heading:pose.heading,speed:pose.speed,
        tuck:THREE.MathUtils.smoothstep(pose.speed,6,23)*.55,
        turn:THREE.MathUtils.clamp(pose.turn*3,-1,1),
        edgeRoll:THREE.MathUtils.clamp(-pose.turn*1.5,-.58,.58),
        airborne,airClearance,
      },Math.min(this.poseAge,.08),surface);
      this.poseAge=0;
    }
    return pose;
  }
}
