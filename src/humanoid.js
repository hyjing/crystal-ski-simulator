import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SkierMotion,loadMotionClips} from './skier-motion.js';
import {createPalmSocket,syncHandPoles} from './pole-rig.js';
import {skiArmOffset,reachableHand,smoothHand,skiArmSolution} from './arm-pose.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
const modelSources=new Map();
export function upperBodyCounterAngle(heading,fallLine,motion={}){
  const travel=Number.isFinite(motion.vx)&&Number.isFinite(motion.vz)?Math.atan2(motion.vx,motion.vz):heading;
  const speed=motion.speed??Math.hypot(motion.vx??0,motion.vz??0);
  const moving=Object.keys(motion).length?THREE.MathUtils.smoothstep(speed,.5,3):1;
  // Across-hill traverses and uphill travel keep shoulders aligned with skis.
  const downhill=THREE.MathUtils.smoothstep(Math.cos(travel-fallLine),.25,.70);
  return THREE.MathUtils.clamp(Math.atan2(Math.sin(fallLine-heading),Math.cos(fallLine-heading))*.88,-.95,.95)*downhill*moving;
}
export async function loadHumanoid(athlete,variant='player'){
 const file=variant==='npc'?'skier-npc.glb':'skier-complete.glb';
 if(!modelSources.has(file))modelSources.set(file,new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/${file}?v=knit-beanie-5`));
 const [source,clips]=await Promise.all([modelSources.get(file),loadMotionClips()]);const rig=attachHumanoid(athlete,cloneSkeleton(source.scene));if(clips)rig.motion=new SkierMotion(rig.model,clips);return rig;
}
function jointSolution(a,target,pole,l1,l2){
  const delta=target.clone().sub(a),d=THREE.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.002),axis=delta.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const bend=pole.clone().sub(a).addScaledVector(axis,-pole.clone().sub(a).dot(axis)).normalize();
  return{joint:a.clone().addScaledVector(axis,along).addScaledVector(bend,height),end:a.clone().addScaledVector(axis,d)};
}
export function attachHumanoid(athlete,model){
  model.updateMatrixWorld(true);const bones={},rest=new Map();model.traverse(o=>{if(o.isBone){bones[o.name]=o;rest.set(o.name,{q:o.getWorldQuaternion(new THREE.Quaternion()),position:o.getWorldPosition(new THREE.Vector3()),local:o.quaternion.clone()});}});
  for(const name of ['pelvis','spine_01','spine_02','spine_03','Head','upperarm_l','lowerarm_l','hand_l','thigh_l','calf_l','foot_l'])if(!bones[name])throw new Error(`Humanoid missing ${name}`);
  const fabric=athlete.userData.torso.children[0].material.map;
  const suit=model.getObjectByName('Unified_ski_suit');if(!suit?.isSkinnedMesh)throw new Error('Complete skier outfit missing');
  suit.material.map=fabric;suit.material.bumpMap=fabric;suit.material.bumpScale=.0012;
  model.traverse(o=>{if(o.isBone&&/^(index|middle|ring|pinky)_(02|03)_/.test(o.name))o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.85));});
  model.name='Complete winter skier';model.scale.setScalar(1/.52);athlete.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
  for(const ski of athlete.userData.skis)for(const part of ski.children.slice(0,3))part.visible=false;
  const keep=new Set(athlete.userData.arms.flatMap(a=>[a.pole,a.basket]));athlete.userData.body.traverse(o=>{if(o.isMesh&&!keep.has(o))o.visible=false;});
  const lengths={};for(const suffix of ['l','r'])lengths[suffix]={thigh:bones[`calf_${suffix}`].position.length(),calf:bones[`foot_${suffix}`].position.length(),upper:bones[`lowerarm_${suffix}`].position.length(),lower:bones[`hand_${suffix}`].position.length()};
  const rig={model,bones,rest,lengths};athlete.userData.humanRig=rig;for(const arm of athlete.userData.arms)arm.palmSocket=createPalmSocket(bones[`hand_${arm.sign>0?'l':'r'}`],arm.sign);return rig;
}
function worldQuaternion(bone,q){bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
function aim(rig,name,childName,target){
  const bone=rig.bones[name],child=rig.bones[childName],origin=bone.getWorldPosition(new THREE.Vector3()),direction=target.clone().sub(origin).normalize();
  const restQ=rig.model.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get(name).q),restAxis=child.position.clone().normalize().applyQuaternion(restQ);
  worldQuaternion(bone,new THREE.Quaternion().setFromUnitVectors(restAxis,direction).multiply(restQ));
}
function aimInPlane(rig,name,childName,target,normal){
 const bone=rig.bones[name],child=rig.bones[childName],origin=bone.getWorldPosition(new THREE.Vector3()),y=target.clone().sub(origin).normalize(),x=normal.clone().addScaledVector(y,-normal.dot(y)).normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize();
 const localY=child.position.clone().normalize(),localX=new THREE.Vector3(1,0,0).addScaledVector(localY,-localY.x).normalize(),localZ=new THREE.Vector3().crossVectors(localX,localY).normalize(),localFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(localX,localY,localZ)),frame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));worldQuaternion(bone,frame.multiply(localFrame.invert()));
}
export function updateHumanoid(athlete,pose){
  const rig=athlete.userData.humanRig;if(!rig)return;
  const {bones,rest}=rig,{body,arms,legs}=athlete.userData;athlete.updateWorldMatrix(true,true);
  const rootQ=athlete.getWorldQuaternion(new THREE.Quaternion()),up=new THREE.Vector3(0,1,0).applyQuaternion(rootQ);
  const transitioning=rig.motion&&(rig.transitionRemaining>0||(rig.previousMode!==undefined&&rig.previousMode!==rig.motion.modeFor(pose)));
  const previous=transitioning?(rig.transitionPose??=Object.values(bones).map(b=>({b,q:b.quaternion.clone(),p:b.position.clone()}))):null;
  if(previous)for(const state of previous){state.q.copy(state.b.quaternion);state.p.copy(state.b.position);}
  const motionMode=rig.motion?.apply(pose,pose.dt||0);
  if(rig.previousMode!==undefined&&rig.previousMode!==motionMode)rig.transitionRemaining=.20;
  rig.previousMode=motionMode;
  if(!motionMode){
  const hip=body.localToWorld(new THREE.Vector3(pose.hipX,pose.hipY+.07,pose.shape?.hipForward||0));bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(hip));
  const attitude=(yaw,lean,bend)=>rootQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(bend,yaw,lean,'YXZ')));
  worldQuaternion(bones.pelvis,attitude(pose.counter*.18,pose.lean*.16,.05).multiply(rest.get('pelvis').q));
  for(const [name,fraction] of [['spine_01',.40],['spine_02',.72],['spine_03',1]])worldQuaternion(bones[name],attitude(pose.counter*fraction,pose.lean*.20,(pose.shape?.bend??(.16+pose.tuck*.40))+(pose.grab||0)*.20+(pose.dynamic?.pitch||0)).multiply(rest.get(name).q));
  worldQuaternion(bones.neck_01,attitude(pose.counter+(pose.headLook||0)*.5,pose.lean*.08,pose.tuck*.12).multiply(rest.get('neck_01').q));
  worldQuaternion(bones.Head,attitude(pose.counter+(pose.headLook||0),0,pose.tuck*.08).multiply(rest.get('Head').q));
  }else{
    const dynamic=pose.dynamic||{},hip=bones.pelvis.getWorldPosition(new THREE.Vector3()).addScaledVector(up,-(dynamic.flex||0));bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(hip));
    const names=['pelvis','spine_01','spine_02','spine_03','neck_01','Head'],fractions=[.18,.40,.72,1,1,1],follow=[0,.35,.65,1,.75,.55],worlds=names.map(n=>bones[n].getWorldQuaternion(new THREE.Quaternion()));for(let i=0;i<names.length;i++){const yaw=pose.counter*fractions[i]+((i>3)?(pose.headLook||0)*.4:0),delta=new THREE.Quaternion().setFromAxisAngle(up,yaw),response=rootQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((dynamic.pitch||0)*follow[i],0,(dynamic.roll||0)*follow[i]))).multiply(rootQ.clone().invert());worldQuaternion(bones[names[i]],delta.multiply(response).multiply(worlds[i]));}
  }
  if(motionMode!=='visitor'&&!(motionMode&&(pose.airborne||pose.crashRemaining>0)))
  for(const leg of legs){const suffix=leg.sign>0?'l':'r',l=rig.lengths[suffix],hip=bones[`thigh_${suffix}`].getWorldPosition(new THREE.Vector3()),ankle=body.localToWorld(leg.target.ankle.clone().add(new THREE.Vector3(0,-.05,0))),pole=motionMode?bones[`calf_${suffix}`].getWorldPosition(new THREE.Vector3()):body.localToWorld(leg.target.knee.clone());
    if(motionMode){const current=bones[`foot_${suffix}`].getWorldPosition(new THREE.Vector3()).addScaledVector(up,pose.dynamic?.flex||0),correction=ankle.clone().sub(current);correction.clampLength(0,.065);ankle.copy(current).add(correction);}
    const solution=jointSolution(hip,ankle,pole,l.thigh,l.calf);aim(rig,`thigh_${suffix}`,`calf_${suffix}`,solution.joint);aim(rig,`calf_${suffix}`,`foot_${suffix}`,solution.end);worldQuaternion(bones[`foot_${suffix}`],rootQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pose.ride?.15:0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(pose.roll||0)*.70)).multiply(rest.get(`foot_${suffix}`).q));
  }
  for(const arm of arms){
    const suffix=arm.sign>0?'l':'r',l=rig.lengths[suffix],length=l.upper+l.lower,shoulder=bones[`upperarm_${suffix}`].getWorldPosition(new THREE.Vector3()),handBone=bones[`hand_${suffix}`],pedestrian=arm.target.pedestrian;
    const torsoQ=bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.get('spine_03').q.clone().invert()),poseRight=new THREE.Vector3(1,0,0).applyQuaternion(torsoQ),poseUp=new THREE.Vector3(0,1,0).applyQuaternion(torsoQ),poseForward=new THREE.Vector3(0,0,1).applyQuaternion(torsoQ);
    arm.poleSurface=pose.surface;arm.poleDirection=arm.target.poleAim?.clone();
    if(motionMode){
      const hand=handBone.getWorldPosition(new THREE.Vector3());
      if(!pedestrian&&!pose.grab&&!pose.fall&&!pose.crouch){
        const outward=bones[`lowerarm_${suffix}`].getWorldPosition(new THREE.Vector3()).sub(shoulder).dot(poseRight)*arm.sign;
        if(outward<length*.16){const solution=skiArmSolution(shoulder,hand,{right:poseRight,up:poseUp,forward:poseForward},arm.sign,l.upper,l.lower),plane=solution.joint.clone().sub(shoulder).cross(solution.end.clone().sub(solution.joint)).normalize();aimInPlane(rig,`upperarm_${suffix}`,`lowerarm_${suffix}`,solution.joint,plane);aimInPlane(rig,`lowerarm_${suffix}`,`hand_${suffix}`,solution.end,plane);}
      }
      arm.poseHand=athlete.worldToLocal(hand.clone());arm.poseMetrics={reach:shoulder.distanceTo(hand),length,clip:true};continue;
    }
    let hand;
    if(pedestrian||pose.grab||((pose.fall||pose.crouch)&&!pose.shape?.brace))hand=body.localToWorld(arm.target.hand.clone());
    else hand=shoulder.clone().add(skiArmOffset({...pose,plant:arm.target.plant},arm.sign).multiplyScalar(length).applyQuaternion(torsoQ));
    hand=reachableHand(shoulder,hand,length);const localTarget=athlete.worldToLocal(hand.clone());
    arm.poseHand=smoothHand(arm.poseHand,localTarget,pose.dt||0,length/.52);hand=reachableHand(shoulder,athlete.localToWorld(arm.poseHand.clone()),length);
    const elbow=shoulder.clone().addScaledVector(poseRight,arm.sign*.10).addScaledVector(poseUp,-.18).addScaledVector(poseForward,-.08),solution=pedestrian||pose.grab||pose.fall||pose.crouch?jointSolution(shoulder,hand,elbow,l.upper,l.lower):skiArmSolution(shoulder,hand,{right:poseRight,up:poseUp,forward:poseForward},arm.sign,l.upper,l.lower);
    const plane=solution.joint.clone().sub(shoulder).cross(solution.end.clone().sub(solution.joint)).normalize();aimInPlane(rig,`upperarm_${suffix}`,`lowerarm_${suffix}`,solution.joint,plane);aimInPlane(rig,`lowerarm_${suffix}`,`hand_${suffix}`,solution.end,plane);
    // Wrist belongs to the forearm. Never align its world quaternion to the
    // entire pole vector, which previously introduced ~90-degree local twists.
    const wrist=rest.get(`hand_${suffix}`).local.clone();if(!pedestrian)wrist.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.06+(pose.poling||0)*.12*Math.cos((pose.polePhase||0)*Math.PI*2),0,arm.sign*(pose.edgeRoll||0)*.08)));
    handBone.quaternion.copy(wrist);handBone.updateWorldMatrix(false,true);
    arm.poseMetrics={reach:shoulder.distanceTo(solution.end),length,requested:shoulder.distanceTo(hand)};
  }
  if(previous&&rig.transitionRemaining>0&&pose.dt>0){const alpha=1-Math.exp(-pose.dt*18);for(const {b,q,p} of previous){b.quaternion.slerpQuaternions(q,b.quaternion,alpha);if(b.name==='pelvis')b.position.lerpVectors(p,b.position,alpha);}rig.transitionRemaining=Math.max(0,rig.transitionRemaining-pose.dt);}
  if(pose.airborne||pose.crashRemaining>0)for(let i=0;i<legs.length;i++){
    const side=legs[i].sign>0?'l':'r',foot=bones[`foot_${side}`],ski=athlete.userData.skis[i],frame=foot.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.get(`foot_${side}`).q.clone().invert()),localQ=athlete.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame),offset=new THREE.Vector3(legs[i].sign*.02,-.16,-.15).applyQuaternion(localQ);
    ski.position.copy(athlete.userData.skiRig.worldToLocal(foot.getWorldPosition(new THREE.Vector3()))).add(offset);ski.quaternion.copy(localQ);
  }
  rig.model.updateMatrixWorld(true);
  if(!athlete.userData.deferAttachments)syncHandPoles(athlete);
}
