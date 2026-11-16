import * as THREE from 'three';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {applyGear,GEAR_PRESETS} from './wardrobe.js';
import {fallAnimation} from './npc-routines.js';
import {GLIDER_POP_TIME} from './airborne.js';
import {PURSUER_SKILLS,pursuerLaserOrigin} from './pursuer-skills.js';
import {createPursuerSnowmobile,createPursuerHelicopter} from './pursuer-vehicles.js';
import {PATROL_ITEMS,PURSUER_ROLES,MEDKIT,SUPPLY,MAX_PURSUERS,PURSUER_HEALTH} from './patrol-mode.js';
import {ChaseTrailEffects} from './chase-trail-effects.js';
import {poseKickedSkier} from './kick.js';
import {createRearShotEffect,updateRearShotEffect} from './rear-shot-effect.js';

function skillLine(color){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,depthWrite:false}));
  line.frustumCulled=false;
  line.visible=false;
  return line;
}

function drawSkillLine(line,from,to,opacity){
  const points=line.geometry.attributes.position;
  points.setXYZ(0,from.x,from.y,from.z);
  points.setXYZ(1,to.x,to.y,to.z);
  points.needsUpdate=true;
  line.material.opacity=opacity;
  line.visible=true;
}

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
    this.vehicles=[];
    this.tokens=[];
    this.phase=0;
    this.clock=0;
    this.tokenGeometry=new THREE.OctahedronGeometry(.72);
    this.materials=Object.fromEntries(Object.entries({...PATROL_ITEMS,medkit:MEDKIT,supply:SUPPLY}).map(([id,item])=>[
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
    this.allies=[];
    this.shotMeshes=[];
    this.laserSweep=createRearShotEffect();
    this.reflectedSweep=createRearShotEffect();
    this.laserSweep.visible=this.reflectedSweep.visible=false;
    this.root.add(this.laserSweep,this.reflectedSweep);
    this.snowballMeshes=[];
    this.iceTrails=new ChaseTrailEffects(this.root,['frosttrail']);
    this.laserAim=skillLine(PURSUER_SKILLS.laser.color);
    this.escortLine=skillLine(PURSUER_SKILLS.escort.color);
    this.snowTarget=new THREE.Mesh(new THREE.RingGeometry(.88,1,36).rotateX(-Math.PI/2),
      new THREE.MeshBasicMaterial({color:PURSUER_SKILLS.snowball.color,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    this.snowTarget.visible=false;
    this.root.add(this.laserAim,this.escortLine,this.snowTarget);
    this.allyMaterial=new THREE.MeshStandardMaterial({
      color:'#53cdb1',emissive:'#21856d',emissiveIntensity:.7,roughness:.7,
    });
    const wingGeometry=new THREE.BufferGeometry();
    wingGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
      0,0,.5,-2.7,.25,-.95,-.85,-.10,-.72,0,-.15,-1.02,
      0,0,.5,2.7,.25,-.95,.85,-.10,-.72,0,-.15,-1.02,
    ],3));
    wingGeometry.setIndex([0,1,2,0,2,3,4,6,5,4,7,6]);
    this.glider=new THREE.Mesh(wingGeometry,new THREE.MeshBasicMaterial({
      color:PATROL_ITEMS.glider.color,side:THREE.DoubleSide,transparent:true,opacity:.72,depthWrite:false,
    }));
    const ribs=new THREE.LineSegments(new THREE.EdgesGeometry(wingGeometry),
      new THREE.LineBasicMaterial({color:'#e5fff3',transparent:true,opacity:.8}));
    this.glider.add(ribs);
    this.glider.visible=false;
    this.root.add(this.glider);
    this.trailEffects=new ChaseTrailEffects(this.root);
    this.bombTarget=new THREE.Mesh(new THREE.RingGeometry(.90,1,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({
      color:'#ffd17e',side:THREE.DoubleSide,transparent:true,opacity:.72,depthWrite:false,
    }));
    this.bombTarget.visible=false;
    this.bombNormal=new THREE.Vector3();
    this.up=new THREE.Vector3(0,1,0);
    this.root.add(this.bombTarget);
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
    this.shield.visible=false;
    this.root.add(this.shield);
    const guardMaterial=this.shield.material.clone();
    this.statusIcons={
      chase:statusIcon('◆','#ff8192'),dash:statusIcon('!', '#ffc26c'),
      ...Object.fromEntries(Object.entries(PURSUER_ROLES).map(([role,v])=>[role,statusIcon(v.symbol,v.color)])),
      tuck:statusIcon('»','#ffce83'),
      guard:statusIcon('⬡','#83dcff'),blocked:statusIcon('⬡','#fff4ad'),
      slow:statusIcon('❄','#92e6ff'),burn:statusIcon('♨','#ff9c66'),mirage:statusIcon('◇','#c08aff'),stunned:statusIcon('×','#fff4ad'),down:statusIcon('KO','#ff9d87'),
    };
    this.interceptIcon=new THREE.Sprite(new THREE.SpriteMaterial({map:this.statusIcons.scout,depthWrite:false,toneMapped:false}));
    this.interceptIcon.visible=false;
    this.root.add(this.interceptIcon);
    for(let i=0;i<MAX_PURSUERS;i++){
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
      const health=new THREE.Group();
      const bar=(color,width,height)=>{
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({color,depthWrite:false,toneMapped:false}));
        sprite.scale.set(width,height,1);
        health.add(sprite);
        return sprite;
      };
      bar('#241923',1.32,.18);
      const fill=bar('#f55e77',1.20,.10);
      fill.renderOrder=1;
      health.visible=false;
      this.root.add(health);
      actor.userData.healthBar={group:health,fill};
      const guard=new THREE.Mesh(this.shield.geometry,guardMaterial);
      guard.visible=false;
      this.root.add(guard);
      actor.userData.guard=guard;
    }
  }

  select(run){
    this.run=run;
    this.shield.visible=false;
    this.glider.visible=false;
    this.bombTarget.visible=false;
    this.trailEffects.update([],this.surface,0);
    this.iceTrails.update([],this.surface,0);
    this.laserAim.visible=this.escortLine.visible=this.snowTarget.visible=false;
    this.laserSweep.visible=this.reflectedSweep.visible=false;
    for(const actor of this.actors)actor.userData.guard.visible=false;
    for(const vehicle of this.vehicles)if(vehicle)vehicle.visible=false;
    this.root.visible=Boolean(run);
    for(const token of this.tokens)this.root.remove(token);
    this.tokens=run?run.pickups.map(p=>{
      const token=new THREE.Mesh(p.type==='medkit'||p.type==='supply'?this.medkitGeometry:this.tokenGeometry,this.materials[p.type]);
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

  updatePursuerEffects(time){
    const {dash,agents,snowballs,laserBeam,reflectedBeam}=this.run;
    const renderSweep=(fx,beam)=>{
      if(!beam){fx.visible=false;return;}
      updateRearShotEffect(fx,{...beam,start:time-.09,impact:time,until:time+.1},time);
    };
    renderSweep(this.laserSweep,laserBeam);
    renderSweep(this.reflectedSweep,reflectedBeam);
    this.laserAim.visible=this.escortLine.visible=false;
    const raised=(point,lift)=>({x:point.x,z:point.z,y:this.surface(point.x,point.z)+lift});
    if(dash?.kind==='laser'&&!dash.fired){
      const pulse=.48+.25*Math.sin(time*22);
      drawSkillLine(this.laserAim,pursuerLaserOrigin(dash.agent,this.surface),dash.point,pulse);
    }
    const linked=agents.find(agent=>agent.escort&&agent.guardUntil>time);
    if(linked)drawSkillLine(this.escortLine,raised(linked.escort,1.25),raised(linked,1.25),.86);
    const warned=dash?.kind==='snowball'&&!dash.fired?dash.point:snowballs.find(ball=>!ball.resolved)?.point;
    this.snowTarget.visible=Boolean(warned);
    if(warned){
      this.snowTarget.position.set(warned.x,this.surface(warned.x,warned.z)+.18,warned.z);
      const g=this.gradient(warned.x,warned.z);
      this.snowTarget.quaternion.setFromUnitVectors(this.up,this.bombNormal.set(-g.x,1,-g.z).normalize());
      this.snowTarget.scale.setScalar(4.6);
      this.snowTarget.material.opacity=.64+.20*Math.sin(time*24);
    }
    this.updateInstances(this.snowballMeshes,snowballs,()=>new THREE.Mesh(this.snowballGeometry??=new THREE.IcosahedronGeometry(.57,1),this.snowballMaterial??=
      new THREE.MeshStandardMaterial({color:'#effaff',emissive:'#b3daeb',emissiveIntensity:.3})),(mesh,ball)=>{
      mesh.visible=!ball.resolved;
      const t=THREE.MathUtils.clamp((time-ball.start)/(ball.impact-ball.start),0,1);
      const from=ball.from,to=raised(ball.point,0);
      mesh.position.set(THREE.MathUtils.lerp(from.x,to.x,t),THREE.MathUtils.lerp(from.y,to.y,t)+12*t*(1-t),THREE.MathUtils.lerp(from.z,to.z,t));
      mesh.rotation.set(t*5,t*6,0);
    });
  }

  updateVehicle(slot,agent,time){
    let model=this.vehicles[slot];
    if(model)model.visible=false;
    if(!agent?.mount||agent.launch)return null;
    const mounted=agent.mount==='helicopter'||agent.health!==0&&!(agent.fallDuration>0&&agent.stunUntil>time);
    if(!mounted)return null;
    if(model?.userData.mount!==agent.mount){
      if(model)this.root.remove(model);
      model=agent.mount==='helicopter'?createPursuerHelicopter():createPursuerSnowmobile();
      model.userData.mount=agent.mount;
      this.vehicles[slot]=model;
      this.root.add(model);
    }
    model.visible=true;
    if(agent.mount==='helicopter'){
      model.position.set(agent.x,agent.flightY??(this.surface(agent.x,agent.z)+12),agent.z);
      const down=agent.health===0;
      model.rotation.set(down?.18:0,agent.heading,down?-.60:agent.bank,'YXZ');
      model.userData.rotor.rotation.y=time*(down?13:61);
      model.userData.tailRotor.rotation.x=time*(down?18:83);
    }
    return model;
  }

  update(dt,active,player){
    if(!this.run)return;
    this.root.visible=active;
    if(!active)return;
    this.phase+=dt;
    const {traps,bombs,blasts,waves,effects,time,allies,shots}=this.run;
    this.trailEffects.update(this.run.trailSegments,this.surface,time);
    this.iceTrails.update(this.run.enemyIce.flatMap(patch=>patch.segments),this.surface,time);
    this.updatePursuerEffects(time);
    const latestBomb=bombs.at(-1);
    this.bombTarget.visible=Boolean(latestBomb);
    if(latestBomb){
      const {x,z}=latestBomb.end;
      this.bombTarget.position.set(x,this.surface(x,z)+.28,z);
      const g=this.gradient(x,z);
      this.bombTarget.quaternion.setFromUnitVectors(this.up,this.bombNormal.set(-g.x,1,-g.z).normalize());
      this.bombTarget.scale.setScalar(2.4+.35*Math.sin(this.phase*17));
    }
    this.updateInstances(this.peels,traps,()=>this.peel.clone(),(mesh,trap)=>{
      mesh.position.set(trap.x,this.surface(trap.x,trap.z)+.12,trap.z);
    });
    this.updateInstances(this.projectiles,bombs,()=>new THREE.Mesh(this.tokenGeometry,this.materials.avalanche),(mesh,bomb)=>{
      const t=THREE.MathUtils.clamp((time-bomb.start)/(bomb.until-bomb.start),0,1);
      const x=THREE.MathUtils.lerp(bomb.x,bomb.end.x,t),z=THREE.MathUtils.lerp(bomb.z,bomb.end.z,t);
      mesh.position.set(x,this.surface(x,z)+.24+(1-t)*(bomb.height+1.2+10*t),z);
      mesh.rotation.set(t*6,0,t*3);
      mesh.scale.setScalar(.69);
      mesh.material=this.materials[bomb.type];
    });
    this.updateInstances(this.shotMeshes,shots,createRearShotEffect,(fx,shot)=>updateRearShotEffect(fx,shot,time));
    this.updateInstances(this.allies,allies,()=>{
      const actor=createAthleteRig(this.root);
      actor.traverse(mesh=>{
        if(mesh.isMesh){mesh.material=this.allyMaterial;mesh.castShadow=false;}
      });
      return actor;
    },(actor,ally)=>{
      actor.visible=ally.until>time;
      actor.position.set(ally.x,this.surface(ally.x,ally.z)-.08,ally.z);
      actor.rotation.set(0,ally.heading,.25*Math.sin(this.phase*2+ally.x));
      if(this.clock+dt>=.05||actor.userData.ally!==ally){
        actor.userData.ally=ally;
        updateAthletePose(actor,{speed:ally.speed,heading:ally.heading,tuck:.32},.05,this.surface);
      }
    });
    this.glider.visible=Boolean(player?.airborne&&player.gliderRemaining>0);
    if(this.glider.visible){
      this.glider.position.set(player.x,player.airY-1200+1.25,player.z);
      this.glider.rotation.set(0,player.heading,.35*(player.steerInput||0));
      const pop=(player.gliderPopRemaining||0)/GLIDER_POP_TIME;
      this.glider.scale.set(THREE.MathUtils.clamp(player.gliderRemaining*4,.15,1)*(1-.62*pop),1,1+.3*pop);
      this.glider.material.opacity=.72+.23*pop;
    }
    this.shield.visible=Boolean(player&&effects.shield);
    if(this.shield.visible){
      const {x,z}=player;
      const remaining=(effects.shield.until-time)/effects.shield.duration;
      this.shield.position.set(x,this.surface(x,z)+.83+(player.airborne?player.airClearance||0:0),z);
      this.shield.rotation.y=this.phase*6;
      const flash=Math.max(0,1-(time-(effects.shield.reflectedAt??-Infinity))/.30);
      this.shield.scale.setScalar(1+.18*Math.sin(this.phase*19)+flash*.35);
      this.shield.material.opacity=.45*Math.min(1,remaining*5)+flash*.4;
    }
    const mist=effects.mist;
    this.mistPuffs.forEach((puff,i)=>{
      puff.visible=Boolean(mist);
      if(!mist)return;
      const age=time-mist.start,angle=i*2.4;
      const size=mist.radius/PATROL_ITEMS.mist.radius;
      const offset=(i%4)*2.7*size;
      puff.position.set(mist.x+Math.cos(angle)*offset+age*.75,this.surface(mist.x,mist.z)+1.7+i%3*.7,mist.z+Math.sin(angle)*offset);
      puff.scale.set((10+age*2)*size,(5+age)*Math.sqrt(size),1);
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
      const vehicle=this.updateVehicle(i,agent,time);
      const aircraft=agent?.mount==='helicopter';
      actor.visible=Boolean(agent&&!aircraft);
      const marker=actor.userData.chaseMarker;
      marker.visible=Boolean(agent);
      const guard=actor.userData.guard;
      guard.visible=Boolean(agent&&!agent.launch&&(agent.guardUntil>time||agent.guardFlashUntil>time));
      const {group:healthBar,fill}=actor.userData.healthBar;
      healthBar.visible=Boolean(agent&&player&&!agent.launch&&agent.health!==0&&
        Math.hypot(agent.x-player.x,agent.z-player.z)<60);
      if(!agent)continue;
      const {x,z,heading,speed,bank,launch}=agent;
      const blocked=agent.guardFlashUntil>time;
      if(guard.visible){
        guard.position.set(x,this.surface(x,z)+1,z);
        guard.scale.setScalar(blocked?1.28:1);
      }
      const charging=this.run.dash?.agent===agent;
      const stunned=agent.stunUntil>time;
      const status=launch||agent.health===0?'down':stunned?'stunned':blocked?'blocked':
        guard.visible?'guard':charging?(this.run.dash.kind==='cut'?'cutter':PURSUER_SKILLS[this.run.dash.kind]?agent.role:'dash'):agent.mirage?.until>time?'mirage':agent.burn?.until>time?'burn':
        agent.fogSlowed||agent.chillUntil>time?'slow':agent.tucking?'tuck':agent.role??'chase';
      marker.material.map=this.statusIcons[status];
      const scale=charging?1.05+.15*Math.sin(this.phase*21):(status==='chase'||status===agent.role)?.65:.85;
      marker.scale.setScalar(scale);
      const anchor=launch??agent;
      const anchorY=aircraft?(agent.flightY??this.surface(anchor.x,anchor.z)+12):this.surface(anchor.x,anchor.z)+(launch?.height??0);
      marker.position.set(anchor.x,anchorY+(status==='down'?1.55:aircraft?1.85:2.35),anchor.z);
      if(healthBar.visible){
        const ratio=(agent.health??PURSUER_HEALTH)/PURSUER_HEALTH;
        healthBar.position.copy(marker.position);
        healthBar.position.y-=.49;
        fill.scale.x=1.2*ratio;
        fill.center.x=.5/ratio;
      }
      if(aircraft)continue;
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
      actor.position.set(x,this.surface(x,z)+(vehicle?.userData.mount==='snowmobile'?.06:-.12),z);
      actor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
      const remaining=agent.fallDuration?Math.max(0,agent.stunUntil-this.run.time):0;
      const fall=fallAnimation(remaining,agent.fallDuration);
      const repelled=!remaining&&agent.stunUntil>this.run.time?Math.min(1,(agent.stunUntil-this.run.time)*2):0;
      actor.rotateZ((i%2?1:-1)*(fall.amount*1.25+repelled*.23));
      if(vehicle){
        vehicle.position.copy(actor.position);
        vehicle.position.y-=.06;
        vehicle.quaternion.copy(actor.quaternion);
      }
      if(pose||appeared)updateAthletePose(actor,{speed,heading,edgeRoll:bank,tuck:agent.tucking?.92:speed>15?.42:0,
        pedestrian:Boolean(vehicle),sitAmount:vehicle?.visible ? .98 : 0,holding:vehicle?'ride':null,snowmobile:Boolean(vehicle),
        crashRemaining:remaining,fallAmount:fall.amount,fallCrouch:fall.crouch,fallBrace:fall.brace,fallPhase:fall.phase},.05,this.surface);
    }
    const warning=this.run.intercept,dash=this.run.dash;
    const groundCue=dash?.kind==='cut'||dash?.kind==='ice'?dash:null;
    const target=warning?.point??groundCue?.point;
    this.interceptIcon.visible=Boolean(target);
    if(target){
      const {x,z}=target;
      this.interceptIcon.material.map=this.statusIcons[warning?'scout':groundCue.kind==='ice'?'ice':'cutter'];
      this.interceptIcon.position.set(x,this.surface(x,z)+2.7,z);
      this.interceptIcon.scale.setScalar(1.4+.25*Math.sin(this.phase*18));
    }
    for(const [i,token] of this.tokens.entries()){
      const p=this.run.pickups[i];
      token.visible=!p.taken;
      token.position.set(p.x,this.surface(p.x,p.z)+1.05+Math.sin(this.phase*3+i)*.23,p.z);
      token.rotation.set(.15,this.phase*1.5,0);
    }
  }
}
