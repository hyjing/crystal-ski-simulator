import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {fallAnimation} from './npc-routines.js';
import {PATROL_ITEMS,MEDKIT} from './patrol-mode.js';
import {poseKickedSkier} from './kick.js';

function statusIcon(symbol,color){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#142639';
  ctx.beginPath();ctx.arc(32,32,26,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 30px system-ui';ctx.fillText(symbol,32,33);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

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
    this.materials=Object.fromEntries(Object.entries({...PATROL_ITEMS,medkit:MEDKIT}).map(([id,item])=>[
      id,new THREE.MeshStandardMaterial({color:item.color,emissive:item.color,emissiveIntensity:.34,roughness:.4}),
    ]));
    this.medkitGeometry=new THREE.BoxGeometry(1.15,.76,.46);
    this.crossGeometry=new THREE.BoxGeometry(.44,.14,.04);
    this.crossMaterial=new THREE.MeshBasicMaterial({color:'#fff8ee'});
    this.peel=new THREE.Group();
    const peelGeometry=new THREE.CapsuleGeometry(.085,.52,3,5);
    for(let i=0;i<3;i++){
      const petal=new THREE.Mesh(peelGeometry,this.materials.banana),angle=i*Math.PI*2/3;
      petal.position.set(Math.sin(angle)*.25,.17,Math.cos(angle)*.25);
      petal.rotation.set(Math.cos(angle)*.95,0,-Math.sin(angle)*.95);
      this.peel.add(petal);
    }
    this.peels=[];
    this.projectiles=[];
    this.beacon=new THREE.Mesh(this.tokenGeometry,this.materials.decoy);
    this.beacon.visible=false;
    this.root.add(this.beacon);
    this.rings=[];
    this.ringGeometry=new THREE.RingGeometry(.78,1,64,2).rotateX(-Math.PI/2);
    this.pulseShape=this.ringGeometry.attributes.position.array;
    const size=32, pixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,edge=Math.hypot(x-15.5,y-15.5)/15.5;
      pixels.set([255,255,255,Math.round(255*Math.max(0,1-edge)**2)],i);
    }
    const mistTexture=new THREE.DataTexture(pixels,size,size);
    mistTexture.needsUpdate=true;
    this.mistPuffs=Array.from({length:9},()=>{
      const puff=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTexture,color:'#d5e4ff',transparent:true,depthWrite:false}));
      this.root.add(puff);
      return puff;
    });
    this.shield=new THREE.Mesh(new THREE.SphereGeometry(1.05,20,12),
      new THREE.MeshBasicMaterial({color:PATROL_ITEMS.shield.color,wireframe:true,transparent:true,opacity:.25,depthWrite:false}));
    this.root.add(this.shield);
    this.statusIcons={
      chase:statusIcon('◆','#ff8192'),dash:statusIcon('!', '#ffc26c'),
      slow:statusIcon('❄','#92e6ff'),stunned:statusIcon('×','#fff4ad'),down:statusIcon('KO','#ff9d87'),
    };
    for(let i=0;i<5;i++){
      const actor=createAthleteRig(this.root);
      actor.visible=false;
      this.actors.push(actor);
      loadHumanoid(actor,'npc').then(()=>{
        applyGear(actor,{...GEAR_PRESETS.rust,jacket:'#bd243d',pants:'#202938',helmet:'#f2f2ef'});
        actor.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      }).catch(()=>{});
      const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:this.statusIcons.chase,depthWrite:false,toneMapped:false}));
      tag.visible=false;
      this.root.add(tag);
      actor.userData.chaseMarker=tag;
    }
  }

  select(run){
    this.run=run;
    this.root.visible=Boolean(run);
    for(const token of this.tokens)this.root.remove(token);
    this.tokens=run?run.pickups.map(p=>{
      const token=new THREE.Mesh(p.type==='medkit'?this.medkitGeometry:this.tokenGeometry,this.materials[p.type]);
      if(p.type==='medkit')for(const z of [-.24,.24]){
        const bar=new THREE.Mesh(this.crossGeometry,this.crossMaterial),stem=bar.clone();
        bar.position.z=stem.position.z=z;
        stem.rotation.z=Math.PI/2;
        token.add(bar,stem);
      }
      this.root.add(token);
      return token;
    }):[];
  }

  updateInstances(pool,items,create,update){
    for(let i=0;i<items.length;i++){
      if(!pool[i]){pool[i]=create();this.root.add(pool[i]);}
      pool[i].visible=true;
      update(pool[i],items[i]);
    }
    for(let i=items.length;i<pool.length;i++)pool[i].visible=false;
  }

  update(dt,active,player){
    if(!this.run)return;
    this.root.visible=active;
    if(!active)return;
    this.phase+=dt;
    const {traps,bombs,blasts,waves,effects,time}=this.run;
    this.updateInstances(this.peels,traps,()=>this.peel.clone(),(mesh,trap)=>{
      mesh.position.set(trap.x,this.surface(trap.x,trap.z)+.12,trap.z);
    });
    this.updateInstances(this.projectiles,bombs,()=>new THREE.Mesh(this.tokenGeometry,this.materials.avalanche),(mesh,bomb)=>{
      const t=THREE.MathUtils.clamp((time-bomb.start)/(bomb.until-bomb.start),0,1);
      const x=THREE.MathUtils.lerp(bomb.x,bomb.end.x,t),z=THREE.MathUtils.lerp(bomb.z,bomb.end.z,t);
      mesh.position.set(x,this.surface(x,z)+.24+(1-t)*(bomb.height+1.2+10*t),z);
      mesh.rotation.set(t*6,0,t*3);
      mesh.scale.setScalar(bomb.type==='snowball'?.42:.69);
      mesh.material=this.materials[bomb.type];
    });
    this.shield.visible=Boolean(player&&effects.shield);
    if(this.shield.visible){
      const {x,z}=player;
      const remaining=(effects.shield.until-time)/effects.shield.duration;
      this.shield.position.set(x,this.surface(x,z)+.83+(player.airborne?player.airClearance||0:0),z);
      this.shield.rotation.y=this.phase*6;
      this.shield.scale.setScalar(1+.18*Math.sin(this.phase*19));
      this.shield.material.opacity=.45*Math.min(1,remaining*5);
    }
    this.beacon.visible=Boolean(effects.decoy);
    if(this.beacon.visible){
      const {x,z}=effects.decoy;
      this.beacon.position.set(x,this.surface(x,z)+1.3,z);
      this.beacon.rotation.y=this.phase*8;
      this.beacon.scale.setScalar(1.35+.3*Math.sin(this.phase*16));
    }
    const mist=effects.mist;
    this.mistPuffs.forEach((puff,i)=>{
      puff.visible=Boolean(mist);
      if(!mist)return;
      const age=time-mist.start,angle=i*2.4;
      const offset=(i%4)*2.7;
      puff.position.set(mist.x+Math.cos(angle)*offset+age*.75,this.surface(mist.x,mist.z)+1.7+i%3*.7,mist.z+Math.sin(angle)*offset);
      puff.scale.set(10+age*2,5+age,1);
      puff.material.opacity=.83*Math.min(1,(mist.until-time)*3);
    });
    this.updateInstances(this.rings,[...waves,...blasts],()=>{
      const geometry=this.ringGeometry.clone();
      geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
      const ring=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
        side:THREE.DoubleSide,transparent:true,depthWrite:false,toneMapped:false,
      }));
      ring.frustumCulled=false;
      return ring;
    },(ring,wave)=>{
      const blast=wave.type!=='pulse';
      const {x,z,radius:maxRadius,duration,start}=wave;
      const progress=THREE.MathUtils.clamp((time-start)/duration,0,1);
      const radius=maxRadius*(blast?1-(1-progress)**2:progress);
      const ground=this.surface(x,z);
      ring.position.set(x,ground,z);
      const positions=ring.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const dx=this.pulseShape[i*3]*radius,dz=this.pulseShape[i*3+2]*radius;
        positions.setXYZ(i,dx,this.surface(x+dx,z+dz)-ground+.55+(1-progress)*.48,dz);
      }
      positions.needsUpdate=true;
      ring.material.color.set(wave.type==='avalanche'?'#fff1d2':'#65deff');
      ring.material.opacity=(1-progress)*.85+.11;
    });
    this.clock+=dt;
    const pose=this.clock>=.05;
    if(pose)this.clock=0;
    for(const [i,actor] of this.actors.entries()){
      const agent=this.run.agents[i];
      const appeared=actor.userData.chaseAgent!==agent;
      actor.userData.chaseAgent=agent;
      actor.visible=Boolean(agent);
      const marker=actor.userData.chaseMarker;
      marker.visible=Boolean(agent);
      if(!agent)continue;
      const {x,z,heading,speed,bank,launch}=agent;
      const charging=this.run.dash?.agent===agent;
      const stunned=agent.stunUntil>time;
      const status=launch||stunned&&agent.fallDuration?'down':stunned?'stunned':charging?'dash':agent.slowUntil>time?'slow':'chase';
      marker.material.map=this.statusIcons[status];
      const scale=charging?1.05+.15*Math.sin(this.phase*21):status==='chase'?.58:.85;
      marker.scale.setScalar(scale);
      const anchor=launch??agent;
      marker.position.set(anchor.x,this.surface(anchor.x,anchor.z)+(launch?.height??0)+(status==='down'?1.55:2.35),anchor.z);
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
