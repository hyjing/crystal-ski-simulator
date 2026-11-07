import * as THREE from 'three';
import {advanceSkiGesture,skiShape} from './ski-gesture.js';
import {advanceTurnPlant} from './skier-animation.js';
import {updateHumanoid,upperBodyCounterAngle} from './humanoid.js';
const up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
function skiGeometry(){
  const vertices=[],indices=[],count=22;
  for(let i=0;i<=count;i++){const t=i/count,z=-1.35+t*3.38,w=.102+.035*Math.pow(Math.abs(t-.48)*2,2),y=.24+Math.pow(Math.max(0,(t-.82)/.18),2)*.25+Math.pow(Math.max(0,(.09-t)/.09),2)*.06;vertices.push(-w,y,z,w,y,z,-w,y-.065,z,w,y-.065,z);if(i<count){const a=i*4,b=a+4;indices.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function connect(mesh,a,b){delta.subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,delta.clone().normalize());mesh.scale.y=delta.length();}
// Tailored elliptical sections give the jacket a waist, chest and rounded shoulders.
function loft(sections,segments=32){
  const positions=[],uv=[],indices=[];
  for(let j=0;j<sections.length;j++){const [y,w,d,z=0]=sections[j];for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(Math.cos(a)*w,y,Math.sin(a)*d+z);uv.push(i/segments,j/(sections.length-1));}}
  for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function clothLimb(material,radii){
  const segments=14,sides=12,positions=new Float32Array((segments+1)*(sides+1)*3),uv=[],indices=[];
  for(let j=0;j<=segments;j++)for(let k=0;k<=sides;k++){uv.push(k/sides,j/segments);if(j<segments&&k<sides){const a=j*(sides+1)+k,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.frustumCulled=false;mesh.userData.radii=radii;return mesh;
}
function shapeLimb(mesh,a,b,c){
  const curve=new THREE.CatmullRomCurve3([a,b,c],false,'centripetal'),p=mesh.geometry.attributes.position,segments=14,sides=12;
  for(let j=0;j<=segments;j++){const t=j/segments,center=curve.getPoint(t),tangent=curve.getTangent(t).normalize(),axis=Math.abs(tangent.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(tangent,axis).normalize(),front=new THREE.Vector3().crossVectors(right,tangent).normalize(),r=mesh.userData.radii;
    const radius=(t<.5?THREE.MathUtils.lerp(r[0],r[1],t*2):THREE.MathUtils.lerp(r[1],r[2],(t-.5)*2))*(1+.018*Math.sin(t*62));
    for(let k=0;k<=sides;k++){const angle=k/sides*Math.PI*2,v=center.clone().addScaledVector(right,Math.cos(angle)*radius).addScaledVector(front,Math.sin(angle)*radius*.9);p.setXYZ(j*(sides+1)+k,v.x,v.y,v.z);}
  }
  p.needsUpdate=true;mesh.geometry.computeVertexNormals();
}

export function createAthleteRig(scene){
  const athlete=new THREE.Group(),body=new THREE.Group(),skiRig=new THREE.Group();athlete.add(body,skiRig);
  const grain=new Uint8Array(128*128*4);let seed=92;for(let i=0;i<128*128;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const value=220+(seed>>>0)%35;grain.set([value,value,value,255],i*4);}const fabric=new THREE.DataTexture(grain,128,128,THREE.RGBAFormat);fabric.wrapS=fabric.wrapT=THREE.RepeatWrapping;fabric.repeat.set(5,5);fabric.needsUpdate=true;
  const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.88,map:fabric,bumpMap:fabric,bumpScale:.006}),jacket=mat('#c86e42'),pants=mat('#243d46'),metal=mat('#3a464b'),helmet=mat('#eee8d6');
  const add=(parent,geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
  const limb=(radius,material)=>add(body,new THREE.CylinderGeometry(radius*.85,radius,1,9),material);
  const torso=new THREE.Group();body.add(torso);
  add(torso,loft([[-.53,.33,.23],[-.48,.39,.25],[-.28,.41,.27],[0,.44,.29],[.32,.49,.28],[.48,.48,.25],[.60,.36,.21],[.70,.20,.17]]),jacket,0,.1,0);
  const balaclava=add(torso,new THREE.SphereGeometry(1,24,18),mat('#263037'),0,1.0,.015);balaclava.scale.set(.21,.27,.23);
  add(torso,new THREE.SphereGeometry(.25,32,20,0,Math.PI*2,0,Math.PI*.61),helmet,0,1.05,0);
  add(torso,new THREE.SphereGeometry(.258,32,16,Math.PI*.10,Math.PI*.80,Math.PI*.38,Math.PI*.25),new THREE.MeshPhysicalMaterial({color:'#a8c6d3',metalness:.65,roughness:.12,clearcoat:.7}),0,1.02,.015);
  const pack=add(torso,loft([[-.35,.22,.08],[-.30,.31,.13],[.24,.31,.15],[.37,.23,.09]]),mat('#31414c'),0,.18,-.35);
  const collar=add(torso,new THREE.TorusGeometry(.20,.055,10,24),jacket,0,.77,0);collar.rotation.x=Math.PI/2;
  const hood=add(torso,new THREE.SphereGeometry(.25,18,12),jacket,0,.64,-.23);hood.scale.set(1,.75,.60);
  add(torso,new THREE.BoxGeometry(.018,.94,.014),metal,0,.12,.295);
  for(const sign of [-1,1]){
    const pocket=add(torso,new THREE.BoxGeometry(.19,.018,.018),metal,sign*.22,-.18,.27);pocket.rotation.z=sign*.22;
    add(torso,new THREE.BoxGeometry(.06,.55,.055),metal,sign*.27,.35,-.24);
    add(torso,new THREE.BoxGeometry(.20,.025,.018),helmet,sign*.23,.38,.26);
    const vent=add(torso,new THREE.TorusGeometry(.22,.008,5,20,Math.PI*.55),metal,sign*.045,1.08,-.015);vent.rotation.set(Math.PI/2,0,Math.PI*.22);
  }
  const pelvis=add(body,loft([[-.28,.28,.21],[-.18,.35,.24],[.12,.36,.24],[.22,.31,.22]]),pants);
  const legs=[],arms=[],skis=[];
  for(const sign of [-1,1]){
    const singleSki=new THREE.Group();singleSki.position.set(sign*.32,.24,0);skiRig.add(singleSki);skis.push(singleSki);
    const legMesh=clothLimb(pants,[.18,.16,.125]);body.add(legMesh);legs.push({sign,mesh:legMesh});
    const sleeve=clothLimb(jacket,[.15,.14,.105]);body.add(sleeve);arms.push({sign,mesh:sleeve,glove:add(body,new THREE.SphereGeometry(.115,14,10),metal),pole:limb(.017,metal),basket:add(body,new THREE.TorusGeometry(.09,.014,6,16),metal)});
    add(singleSki,new THREE.BoxGeometry(.29,.31,.57),metal,sign*.30,.35,.18);add(singleSki,new THREE.BoxGeometry(.31,.045,.18),mat('#a8bbab'),sign*.30,.49,.34);add(singleSki,new THREE.BoxGeometry(.24,.1,.18),metal,sign*.32,.22,-.25);
    add(singleSki,skiGeometry(),mat('#233b42'),sign*.32,0,0);
    add(singleSki,new THREE.BoxGeometry(.12,.008,1.15),mat('#b9da87'),sign*.32,.285,1.05);
    for(const child of singleSki.children){child.position.x-=sign*.32;child.position.y-=.24;}
  }
  for(const arm of arms){const grip=new THREE.Mesh(new THREE.CapsuleGeometry(.045,.12,4,8),metal);grip.name='Ski pole grip';grip.scale.y=1/2.65;grip.position.y=-.5+.015/2.65;arm.pole.add(grip);}
  athlete.userData={body,skiRig,torso,pelvis,legs,arms,skis,plant:{}};athlete.scale.setScalar(.52);athlete.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});scene.add(athlete);return athlete;
}
export function walkingFoot(phase){
 const t=((phase/(Math.PI*2))%1+1)%1;if(t<.6)return{stride:.6-1.2*t/.6,lift:0};const u=(t-.6)/.4;return{stride:-.6+1.2*u*u*(3-2*u),lift:.20*Math.sin(Math.PI*u)};
}
export function updateAthletePose(athlete,s,dt,surface){
  const {body,skiRig,torso,pelvis,legs,arms,skis}=athlete.userData,turn=s.turn||0,grab=s.airborne?(s.grab||0):0,tuck=Math.max(s.tuck||0,grab*.85,(s.riseLean||0)*.35),walk=s.walkAmount||0,walkPhase=s.walkPhase||0,sit=s.sitAmount||0,fall=s.fallAmount||0,crouch=s.fallCrouch||0,pole=s.poling||0,phase=(s.polePhase||0)*Math.PI*2;
  const plantState=advanceTurnPlant(athlete.userData.plant,s,dt);athlete.userData.poleContact=null;
  const gesture=advanceSkiGesture(athlete.userData.gesture??={},s,dt,surface),shape=skiShape(s);
  const drive=Math.sin(phase),reach=Math.cos(phase),edge=s.edgeAngle||0;
  const roll=s.edgeRoll??turn*edge,weight=Math.abs(roll),flex=shape.flex+pole*(.06+.07*Math.max(0,drive))+gesture.absorption*.25+gesture.landing*.20,hipY=THREE.MathUtils.lerp(1.86-flex+walk*.025*Math.cos(walkPhase*2),1.22,sit)-fall*.25-crouch*.60-(s.landingRecover||0)*.20-gesture.dynamic.flex/.52;
  const counterTarget=(s.airborne||s.crashRemaining>0?0:upperBodyCounterAngle(s.heading||0,s.downhillHeading??s.heading??0,s))+(s.idleShift||0)*.12;
  const counter=athlete.userData.counterYaw===undefined||dt===0?counterTarget:THREE.MathUtils.lerp(athlete.userData.counterYaw,counterTarget,1-Math.exp(-dt*8));athlete.userData.counterYaw=counter;
  const targetLean=roll,rate=dt>0?1-Math.exp(-dt*20):1;
  athlete.userData.lean=THREE.MathUtils.lerp(athlete.userData.lean||0,targetLean,rate);const lean=athlete.userData.lean,hipX=-lean*.62+(s.idleShift||0)*.08;
  body.rotation.z=0;body.position.y=-pole*.035*Math.sin(phase);pelvis.position.set(hipX,hipY-.06,shape.hipForward);
  skiRig.position.set(0,grab,grab*.9);skiRig.rotation.x=s.ridePose?.15:0;if(s.ridePose)skiRig.position.set(0,-.42,.65);
  skiRig.rotation.z=0;for(let i=0;i<skis.length;i++){const ski=skis[i];ski.position.set((i?1:-1)*.32,.24,0);ski.position.z=Math.max(0,-(i?1:-1)*Math.sign(roll))*weight*.12;ski.rotation.set(0,0,roll*.70);}
  torso.position.set(hipX,hipY+.55,.05+tuck*.16);torso.rotation.x=.12+tuck*.7+weight*.08+pole*(.12+.16*Math.max(0,drive));
  torso.rotation.y=counter;torso.rotation.z=lean*.38;
  for(const leg of legs){
    const inside=Math.max(0,-leg.sign*Math.sign(roll)),hip=new THREE.Vector3(hipX+leg.sign*.23,hipY,shape.hipForward),knee=new THREE.Vector3(hipX*.55+leg.sign*(.29+weight*.12),.94-tuck*.18-inside*weight*.12,shape.knee+inside*weight*.18),ankle=new THREE.Vector3(leg.sign*.30,.45+grab,.15+grab*.9);
    const gait=walkingFoot(walkPhase+(leg.sign>0?0:Math.PI));ankle.z+=walk*gait.stride;ankle.y+=walk*gait.lift;ankle.z+=sit*.95+inside*weight*.12;ankle.x*=shape.stance;ankle.y+=shape.fold*.55;ankle.z-=shape.fold*.28;knee.z+=shape.fold*.35;knee.y-=shape.fold*.18;knee.z+=walk*.25*gait.stride+sit*.6+crouch*.35;ankle.x+=leg.sign*crouch*.14;
    if(s.ridePose){ankle.y=.02;ankle.z=.80;}
    leg.target={hip,knee,ankle};if(!athlete.userData.humanRig)shapeLimb(leg.mesh,hip,knee,ankle);
  }
  for(const arm of arms){
    const sign=arm.sign,activePlant=plantState.active&&plantState.plantSide===sign,plant=Math.max(s.plantPose?.side===sign?s.plantPose.amount:0,activePlant?(plantState.phase<.2?THREE.MathUtils.smoothstep(plantState.phase,0,.2):1-THREE.MathUtils.smoothstep(plantState.phase,.32,1)):0),shoulder=new THREE.Vector3(hipX+sign*.48,hipY+1.0-tuck*.2,.12+tuck*.55),hand=new THREE.Vector3(hipX*.45+sign*(.68-tuck*.18+weight*.12),2.05-flex*.45+pole*.15*reach-plant*.16,.58+tuck*.45+pole*.75*reach+plant*.70),elbow=new THREE.Vector3(hipX*.6+sign*.67,(shoulder.y+hand.y)/2-.18,(shoulder.z+hand.z)/2-.10);
    if(walk){hand.z-=walk*.22*Math.sin(walkPhase+(sign>0?0:Math.PI));hand.y-=walk*.20;}
    if(s.pedestrian){
      hand.set(hipX+sign*.60,hipY-.10+walk*.025*Math.cos(walkPhase),.12-walk*.28*Math.sin(walkPhase+(sign>0?0:Math.PI)));
      if(sit)hand.lerp(new THREE.Vector3(hipX+sign*.40,hipY+.02,1.02),sit);
      if(s.holding&&sign<0)hand.set(hipX-.40,hipY+.38+(s.consumeAmount||0)*.85,.48-(s.consumeAmount||0)*.14);
    }
    if(fall||crouch)hand.lerp(new THREE.Vector3(hipX+sign*(.55+(s.fallImpact||0)*.15),.35,.65),Math.max(fall*.6,s.fallBrace||0));
    if(s.idleGesture==='goggles'&&sign>0)hand.set(hipX+.32,hipY+1.28,.42);
    if(s.idleGesture==='stretch')hand.set(hipX+sign*.65,hipY+1.55,.1);
    if(s.idleGesture==='chat'&&sign>0)hand.set(hipX+.55,hipY+.85,.9+.08*Math.sin(s.activityTime||0));
    if(grab&&sign>0)hand.lerp(new THREE.Vector3(hipX+sign*.35,1.30,1.10),grab);
    for(const point of [shoulder,hand,elbow]){point.x-=hipX;point.applyAxisAngle(up,counter);point.x+=hipX;}
    const planting=pole>.1&&(s.polePhase||0)<.58,tip=new THREE.Vector3(sign*(.86+weight*.15),planting?.14:.45+pole*.55*Math.max(0,-drive)-plant*.20,hand.z+(planting?-.45-.65*Math.max(0,drive):-.9));
    if(activePlant){
      tip.set(sign*(.90+weight*.1),.35,-.9+3.1*plant);
      if(plantState.contact){
        body.updateWorldMatrix(true,false);
        if(!plantState.worldPoint){const point=body.localToWorld(new THREE.Vector3(sign*1.0,.08,2.2).applyAxisAngle(up,counter));if(surface)point.y=surface(point.x,point.z)+.025;plantState.worldPoint=point;if(plantState.contactStarted)athlete.userData.poleContact=point.clone();}
        tip.copy(body.worldToLocal(plantState.worldPoint.clone()));
      }
    }
    if(s.softHands&&!activePlant){if(arm.npcHand&&dt>0)hand.lerpVectors(arm.npcHand,hand,1-Math.exp(-dt*9));arm.npcHand=hand.clone();}
    const poleVector=tip.clone().sub(hand).normalize();
    if(activePlant&&plantState.contact)hand.copy(tip).addScaledVector(poleVector,-2.65);
    else tip.copy(hand).addScaledVector(poleVector,2.65);
    elbow.set(hipX*.6+sign*.67,(shoulder.y+hand.y)/2-.18,(shoulder.z+hand.z)/2-.10);
    if(!athlete.userData.humanRig)shapeLimb(arm.mesh,shoulder,elbow,hand);arm.glove.position.copy(hand);
    arm.target={hand:hand.clone(),tip:tip.clone(),pedestrian:!!s.pedestrian,planted:!!(activePlant&&plantState.contact),plant,poleAim:new THREE.Vector3(sign*.08,-1,-.65-pole*.35*Math.sin(phase)+plant*.95).normalize()};
    connect(arm.pole,hand,tip);arm.basket.position.copy(tip).y+=.12;arm.basket.rotation.x=Math.PI/2;
  }
  updateHumanoid(athlete,{hipY,hipX,lean,tuck:Math.max(tuck,crouch*.8),counter,roll,grab,headLook:s.headLook||0,ride:!!s.ridePose,poling:pole,polePhase:s.polePhase||0,edgeRoll:roll,airborne:!!s.airborne,pedestrian:!!s.pedestrian,walkAmount:walk,walkPhase,sitAmount:sit,holding:s.holding,surface,shape,dynamic:gesture.dynamic,release:gesture.release,absorption:gesture.absorption,landing:gesture.landing,landingPhase:gesture.landingPhase,landingStrength:gesture.landingStrength,jumpPreparation:s.jumpPreparation||0,flightTime:s.flightTime||0,airVy:s.airVy||0,airClearance:s.airClearance??10,landingRecover:s.landingRecover||0,fallPhase:s.fallPhase,crashRemaining:s.crashRemaining||0,plantActive:plantState.active,plantSide:plantState.plantSide,plantPhase:plantState.phase,fall:fall,crouch,dt});
}
