import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {fallAnimation} from './npc-routines.js';
import {PATROL_ITEMS} from './patrol-mode.js';
import {AVALANCHE_RADIUS,poseKickedSkier} from './kick.js';

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
    this.shield=new THREE.Mesh(new THREE.SphereGeometry(1.05,20,12),
      new THREE.MeshBasicMaterial({color:PATROL_ITEMS.shield.color,wireframe:true,transparent:true,opacity:.25,depthWrite:false}));
    this.root.add(this.shield);
    for(let i=0;i<5;i++){
      const actor=createAthleteRig(this.root);
      actor.visible=false;
      this.actors.push(actor);
      loadHumanoid(actor,'npc').then(()=>{
        applyGear(actor,{...GEAR_PRESETS.rust,jacket:'#bd243d',pants:'#202938',helmet:'#f2f2ef'});
        actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      }).catch(()=>{});
      const tag=new THREE.Mesh(this.tokenGeometry,new THREE.MeshBasicMaterial({color:'#f03652'}));
      tag.position.set(0,3.65,0);
      tag.scale.set(.25,.34,.25);
      actor.add(tag);
      actor.userData.chaseMarker=tag;
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

  update(dt,active,player){
    if(!this.run)return;
    this.root.visible=active;
    if(!active)return;
    this.phase+=dt;
    this.shield.visible=Boolean(player)&&this.run.effect?.type==='shield';
    if(this.shield.visible){
      const {x,z}=player;
      const remaining=(this.run.effect.until-this.run.time)/PATROL_ITEMS.shield.duration;
      this.shield.position.set(x,this.surface(x,z)+.83,z);
      this.shield.rotation.y=this.phase*6;
      this.shield.scale.setScalar(1+.18*Math.sin(this.phase*19));
      this.shield.material.opacity=.45*Math.min(1,remaining*5);
    }
    this.beacon.visible=this.run.effect?.type==='decoy';
    if(this.beacon.visible){
      const {x,z}=this.run.effect;
      this.beacon.position.set(x,this.surface(x,z)+1.3,z);
      this.beacon.rotation.y=this.phase*8;
      this.beacon.scale.setScalar(1.35+.3*Math.sin(this.phase*16));
    }
    const blast=this.run.effect?.type==='avalanche';
    this.pulse.visible=blast||this.run.effect?.type==='pulse';
    if(this.pulse.visible){
      const {x,z,until}=this.run.effect;
      const duration=PATROL_ITEMS[this.run.effect.type].duration;
      const progress=1-THREE.MathUtils.clamp((until-this.run.time)/duration,0,1);
      const maxRadius=blast?AVALANCHE_RADIUS:PATROL_ITEMS.pulse.radius;
      const radius=1+(maxRadius-1)*(1-(1-progress)**2);
      const ground=this.surface(x,z);
      this.pulse.position.set(x,ground,z);
      const positions=this.pulse.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const dx=this.pulseShape[i*3]*radius,dz=this.pulseShape[i*3+2]*radius;
        positions.setXYZ(i,dx,this.surface(x+dx,z+dz)-ground+.16,dz);
      }
      positions.needsUpdate=true;
      this.pulse.material.color.set(blast?'#fff1d2':PATROL_ITEMS.pulse.color);
      this.pulse.material.opacity=(1-progress)*(blast?.95:.75);
    }
    this.clock+=dt;
    const pose=this.clock>=.05;
    if(pose)this.clock=0;
    for(const [i,actor] of this.actors.entries()){
      const agent=this.run.agents[i];
      const appeared=actor.userData.chaseAgent!==agent;
      actor.userData.chaseAgent=agent;
      actor.visible=Boolean(agent);
      if(!agent)continue;
      const {x,z,heading,speed,bank,launch}=agent;
      actor.userData.chaseMarker.visible=!launch;
      if(launch){
        const t=launch.progress;
        poseKickedSkier(actor,launch,this.surface);
        if(pose||appeared||t===0)updateAthletePose(actor,{
          speed:14,heading:launch.heading,airborne:t<1,flightTime:this.run.time-launch.at,
          fallAmount:.78,fallBrace:.55,fallPhase:t<1?'impact':'settle',
        },.05);
        continue;
      }
      const g=this.gradient(x,z),fx=Math.sin(heading),fz=Math.cos(heading);
      const up=new THREE.Vector3(-g.x,1,-g.z).normalize();
      const forward=new THREE.Vector3(fx,g.x*fx+g.z*fz,fz).normalize();
      const right=new THREE.Vector3().crossVectors(up,forward).normalize();
      actor.position.set(x,this.surface(x,z)-.12,z);
      actor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
      const remaining=agent.fallDuration?Math.max(0,agent.stunUntil-this.run.time):0;
      const fall=fallAnimation(remaining,agent.fallDuration);
      const repelled=!remaining&&agent.stunUntil>this.run.time?Math.min(1,(agent.stunUntil-this.run.time)*2):0;
      actor.rotateZ((i%2?1:-1)*(fall.amount*1.25+repelled*.23));
      if(pose||appeared)updateAthletePose(actor,{speed,heading,edgeRoll:bank,tuck:speed>15?.42:0,
        crashRemaining:remaining,fallAmount:fall.amount,fallCrouch:fall.crouch,fallBrace:fall.brace,fallPhase:fall.phase},.05,this.surface);
    }
    for(const [i,token] of this.tokens.entries()){
      const p=this.run.pickups[i];
      token.visible=!p.taken;
      token.position.set(p.x,this.surface(p.x,p.z)+1.05+Math.sin(this.phase*3+i)*.23,p.z);
      token.rotation.set(.15,this.phase*1.5,0);
    }
  }
}
