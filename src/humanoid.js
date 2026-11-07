import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {skiArmOffset,reachableHand,smoothHand} from './arm-pose.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
const modelSources=new Map();
const Y=new THREE.Vector3(0,1,0);
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
 return attachHumanoid(athlete,cloneSkeleton((await modelSources.get(file)).scene));
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
  const rig={model,bones,rest,lengths};athlete.userData.humanRig=rig;return rig;
}
function worldQuaternion(bone,q){bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
function aim(rig,name,childName,target){
  const bone=rig.bones[name],child=rig.bones[childName],origin=bone.getWorldPosition(new THREE.Vector3()),direction=target.clone().sub(origin).normalize();
  const restQ=rig.model.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get(name).q),restAxis=child.position.clone().normalize().applyQuaternion(restQ);
  worldQuaternion(bone,new THREE.Quaternion().setFromUnitVectors(restAxis,direction).multiply(restQ));
}
export function updateHumanoid(athlete,pose){
  const rig=athlete.userData.humanRig;if(!rig)return;
  const {bones,rest}=rig,{body,arms,legs}=athlete.userData;athlete.updateWorldMatrix(true,true);
  const rootQ=athlete.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(rootQ),up=new THREE.Vector3(0,1,0).applyQuaternion(rootQ),right=new THREE.Vector3(1,0,0).applyQuaternion(rootQ);
  const hip=body.localToWorld(new THREE.Vector3(pose.hipX,pose.hipY+.07,0));bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(hip));
  const attitude=(yaw,lean,bend)=>rootQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(bend,yaw,lean,'YXZ')));
  worldQuaternion(bones.pelvis,attitude(pose.counter*.18,pose.lean*.10,.03).multiply(rest.get('pelvis').q));
  for(const [name,fraction] of [['spine_01',.40],['spine_02',.72],['spine_03',1]])worldQuaternion(bones[name],attitude(pose.counter*fraction,pose.lean*.15,.08+pose.tuck*.40+(pose.grab||0)*.35).multiply(rest.get(name).q));
  worldQuaternion(bones.neck_01,attitude(pose.counter+(pose.headLook||0)*.5,pose.lean*.08,pose.tuck*.12).multiply(rest.get('neck_01').q));
  worldQuaternion(bones.Head,attitude(pose.counter+(pose.headLook||0),0,pose.tuck*.08).multiply(rest.get('Head').q));
  for(const leg of legs){const suffix=leg.sign>0?'l':'r',l=rig.lengths[suffix],hip=bones[`thigh_${suffix}`].getWorldPosition(new THREE.Vector3()),ankle=body.localToWorld(leg.target.ankle.clone().add(new THREE.Vector3(0,-.05,0))),pole=hip.clone().addScaledVector(forward,.7).addScaledVector(right,leg.sign*.12);
    const solution=jointSolution(hip,ankle,pole,l.thigh,l.calf);aim(rig,`thigh_${suffix}`,`calf_${suffix}`,solution.joint);aim(rig,`calf_${suffix}`,`foot_${suffix}`,solution.end);worldQuaternion(bones[`foot_${suffix}`],rootQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pose.ride?.15:0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(pose.roll||0)*.70)).multiply(rest.get(`foot_${suffix}`).q));
  }
  for(const arm of arms){
    const suffix=arm.sign>0?'l':'r',l=rig.lengths[suffix],length=l.upper+l.lower,shoulder=bones[`upperarm_${suffix}`].getWorldPosition(new THREE.Vector3()),handBone=bones[`hand_${suffix}`],pedestrian=arm.target.pedestrian;
    const torsoQ=bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.get('spine_03').q.clone().invert()),poseRight=new THREE.Vector3(1,0,0).applyQuaternion(torsoQ),poseUp=new THREE.Vector3(0,1,0).applyQuaternion(torsoQ),poseForward=new THREE.Vector3(0,0,1).applyQuaternion(torsoQ);
    let hand;
    if(pedestrian||pose.grab||pose.fall||pose.crouch)hand=body.localToWorld(arm.target.hand.clone());
    else hand=shoulder.clone().add(skiArmOffset({...pose,plant:arm.target.plant},arm.sign).multiplyScalar(length).applyQuaternion(torsoQ));
    hand=reachableHand(shoulder,hand,length);const localTarget=athlete.worldToLocal(hand.clone());
    arm.poseHand=smoothHand(arm.poseHand,localTarget,pose.dt||0,length/.52);hand=reachableHand(shoulder,athlete.localToWorld(arm.poseHand.clone()),length);
    let tip=body.localToWorld(arm.target.tip.clone()),contact=arm.target.planted;
    // A planted pole and an arm must both be reachable. Release an impossible
    // contact instead of stretching the elbow or lengthening the equipment.
    if(contact){const freeHand=hand.clone(),poleLength=2.65*.52;for(let i=0;i<12;i++){hand.copy(tip).add(hand.clone().sub(tip).normalize().multiplyScalar(poleLength));hand=reachableHand(shoulder,hand,length);}if(Math.abs(hand.distanceTo(tip)-poleLength)>.025||hand.distanceTo(freeHand)>Math.max(.008,length*4*(pose.dt||0))){hand.copy(freeHand);contact=false;athlete.userData.plant.worldPoint=null;athlete.userData.plant.contact=false;athlete.userData.poleContact=null;}}
    const elbow=shoulder.clone().addScaledVector(poseRight,arm.sign*.20).addScaledVector(poseUp,-.20).addScaledVector(poseForward,-.06),solution=jointSolution(shoulder,hand,elbow,l.upper,l.lower);
    aim(rig,`upperarm_${suffix}`,`lowerarm_${suffix}`,solution.joint);aim(rig,`lowerarm_${suffix}`,`hand_${suffix}`,solution.end);
    // Wrist belongs to the forearm. Never align its world quaternion to the
    // entire pole vector, which previously introduced ~90-degree local twists.
    const wrist=rest.get(`hand_${suffix}`).local.clone();if(!pedestrian)wrist.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.06+(pose.poling||0)*.12*Math.cos((pose.polePhase||0)*Math.PI*2),0,arm.sign*(pose.edgeRoll||0)*.08)));
    handBone.quaternion.copy(wrist);handBone.updateWorldMatrix(false,true);
    const localHand=body.worldToLocal(solution.end.clone()),tipLocal=body.worldToLocal(tip.clone()),direction=tipLocal.clone().sub(localHand).normalize();tipLocal.copy(localHand).addScaledVector(direction,2.65);
    arm.pole.position.copy(localHand).add(tipLocal).multiplyScalar(.5);arm.pole.quaternion.setFromUnitVectors(Y,direction);arm.pole.scale.y=2.65;
    arm.basket.position.copy(tipLocal).y+=.12;arm.basket.rotation.x=Math.PI/2;
    arm.poseMetrics={reach:shoulder.distanceTo(solution.end),length,requested:shoulder.distanceTo(hand),contact};
  }
  rig.model.updateMatrixWorld(true);
}
