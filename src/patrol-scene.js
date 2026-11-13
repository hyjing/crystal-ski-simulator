import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {PATROL_ITEMS} from './patrol-mode.js';

export class PatrolScene {
  constructor(scene,surface,gradient){
    this.root=new THREE.Group();
    scene.add(this.root);
    this.surface=surface;
    this.gradient=gradient;
    this.actors=[];
    this.tokens=[];
    this.phase=0;
    this.clock=0;
    this.tokenGeometry=new THREE.OctahedronGeometry(.72);
    this.materials=Object.fromEntries(Object.entries(PATROL_ITEMS).map(([id,item])=>[
      id,new THREE.MeshStandardMaterial({color:item.color,emissive:item.color,emissiveIntensity:.34,roughness:.4}),
    ]));
    this.beacon=new THREE.Mesh(this.tokenGeometry,this.materials.decoy);
    this.beacon.visible=false;
    this.root.add(this.beacon);
    this.pulse=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),new THREE.MeshBasicMaterial({
      color:PATROL_ITEMS.pulse.color,side:THREE.DoubleSide,transparent:true,depthWrite:false,
    }));
    this.pulse.geometry.rotateX(-Math.PI/2);
    const positions=this.pulse.geometry.attributes.position;
    this.pulseShape=positions.array.slice();
    positions.setUsage(THREE.DynamicDrawUsage);
    this.pulse.frustumCulled=false;
    this.pulse.visible=false;
    this.root.add(this.pulse);
    for(let i=0;i<5;i++){
      const actor=createAthleteRig(this.root);
      actor.visible=false;
      this.actors.push(actor);
      loadHumanoid(actor,'npc').then(()=>{
        applyGear(actor,{...GEAR_PRESETS.rust,jacket:'#bd243d',pants:'#202938',helmet:'#f2f2ef'});
        actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      }).catch(()=>{});
      const tag=new THREE.Mesh(new THREE.BoxGeometry(.4,.24,.10),new THREE.MeshBasicMaterial({color:'#f03652'}));
      tag.position.set(0,3.65,0);
      const mark=new THREE.MeshBasicMaterial({color:'#ffffff'});
      for(const [width,height] of [[.16,.045],[.045,.16]]){
        const cross=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mark);
        cross.position.z=-.052;
        cross.rotation.y=Math.PI;
        tag.add(cross);
      }
      actor.add(tag);
    }
  }

  select(run){
    this.run=run;
    this.root.visible=Boolean(run);
    for(const token of this.tokens)this.root.remove(token);
    this.tokens=run?run.pickups.map(p=>{
      const token=new THREE.Mesh(this.tokenGeometry,this.materials[p.type]);
      this.root.add(token);
      return token;
    }):[];
  }

  update(dt,active){
    if(!this.run)return;
    this.root.visible=active;
    if(!active)return;
    this.phase+=dt;
    this.beacon.visible=this.run.effect?.type==='decoy';
    if(this.beacon.visible){
      const {x,z}=this.run.effect;
      this.beacon.position.set(x,this.surface(x,z)+1.3,z);
      this.beacon.rotation.y=this.phase*2;
    }
    this.pulse.visible=this.run.effect?.type==='pulse';
    if(this.pulse.visible){
      const {x,z,until}=this.run.effect;
      const progress=1-Math.max(0,Math.min(1,(until-this.run.time)/.62));
      const ground=this.surface(x,z),radius=1+progress*14;
      this.pulse.position.set(x,ground,z);
      const positions=this.pulse.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const dx=this.pulseShape[i*3]*radius,dz=this.pulseShape[i*3+2]*radius;
        positions.setXYZ(i,dx,this.surface(x+dx,z+dz)-ground+.16,dz);
      }
      positions.needsUpdate=true;
      this.pulse.material.opacity=(1-progress)*.75;
    }
    this.clock+=dt;
    const pose=this.clock>=.05;
    if(pose)this.clock=0;
    for(const [i,actor] of this.actors.entries()){
      const agent=this.run.agents[i];
      const appeared=!actor.visible;
      actor.visible=Boolean(agent);
      if(!agent)continue;
      const {x,z,heading,speed,bank}=agent;
      const g=this.gradient(x,z),fx=Math.sin(heading),fz=Math.cos(heading);
      const up=new THREE.Vector3(-g.x,1,-g.z).normalize();
      const forward=new THREE.Vector3(fx,g.x*fx+g.z*fz,fz).normalize();
      const right=new THREE.Vector3().crossVectors(up,forward).normalize();
      actor.position.set(x,this.surface(x,z)-.12,z);
      actor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
      if(pose||appeared)updateAthletePose(actor,{speed,heading,edgeRoll:bank,tuck:speed>15?.42:0},.05,this.surface);
    }
    for(const [i,token] of this.tokens.entries()){
      const p=this.run.pickups[i];
      token.visible=!p.taken;
      token.position.set(p.x,this.surface(p.x,p.z)+1.05+Math.sin(this.phase*3+i)*.23,p.z);
      token.rotation.set(.15,this.phase*1.5,0);
    }
  }
}
