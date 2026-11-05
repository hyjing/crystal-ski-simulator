import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const Y=new THREE.Vector3(0,1,0);
export function upperBodyCounterAngle(heading,fallLine,motion={}){
  const travel=Number.isFinite(motion.vx)&&Number.isFinite(motion.vz)?Math.atan2(motion.vx,motion.vz):heading;
  const speed=motion.speed??Math.hypot(motion.vx??0,motion.vz??0);
  const moving=Object.keys(motion).length?THREE.MathUtils.smoothstep(speed,.5,3):1;
  // Across-hill traverses and uphill travel keep shoulders aligned with skis.
  const downhill=THREE.MathUtils.smoothstep(Math.cos(travel-fallLine),.25,.70);
  return THREE.MathUtils.clamp(Math.atan2(Math.sin(fallLine-heading),Math.cos(fallLine-heading))*.88,-.95,.95)*downhill*moving;
}
export async function loadHumanoid(athlete){const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/skier-complete.glb`);return attachHumanoid(athlete,gltf.scene);}
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
  for(const [name,fraction] of [['spine_01',.40],['spine_02',.72],['spine_03',1]])worldQuaternion(bones[name],attitude(pose.counter*fraction,pose.lean*.15,.08+pose.tuck*.40).multiply(rest.get(name).q));
  worldQuaternion(bones.neck_01,attitude(pose.counter,pose.lean*.08,pose.tuck*.12).multiply(rest.get('neck_01').q));
  worldQuaternion(bones.Head,attitude(pose.counter,0,pose.tuck*.08).multiply(rest.get('Head').q));
  for(const leg of legs){const suffix=leg.sign>0?'l':'r',l=rig.lengths[suffix],hip=bones[`thigh_${suffix}`].getWorldPosition(new THREE.Vector3()),ankle=body.localToWorld(leg.target.ankle.clone().add(new THREE.Vector3(0,-.05,0))),pole=hip.clone().addScaledVector(forward,.7).addScaledVector(right,leg.sign*.12);
    const solution=jointSolution(hip,ankle,pole,l.thigh,l.calf);aim(rig,`thigh_${suffix}`,`calf_${suffix}`,solution.joint);aim(rig,`calf_${suffix}`,`foot_${suffix}`,solution.end);worldQuaternion(bones[`foot_${suffix}`],rootQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(pose.roll||0)*.70)).multiply(rest.get(`foot_${suffix}`).q));
  }
  for(const arm of arms){const suffix=arm.sign>0?'l':'r',l=rig.lengths[suffix],shoulder=bones[`upperarm_${suffix}`].getWorldPosition(new THREE.Vector3()),hand=body.localToWorld(arm.target.hand.clone()),pole=shoulder.clone().addScaledVector(right,arm.sign*.5).addScaledVector(up,-.22);
    const solution=jointSolution(shoulder,hand,pole,l.upper,l.lower);aim(rig,`upperarm_${suffix}`,`lowerarm_${suffix}`,solution.joint);aim(rig,`lowerarm_${suffix}`,`hand_${suffix}`,solution.end);
    const tip=body.localToWorld(arm.target.tip.clone()),gripDirection=tip.clone().sub(solution.end).normalize(),restQ=rest.get(`hand_${suffix}`).q;
    worldQuaternion(bones[`hand_${suffix}`],new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(restQ),gripDirection).multiply(restQ));
    const localHand=body.worldToLocal(solution.end.clone()),direction=arm.target.tip.clone().sub(localHand),length=direction.length();arm.pole.position.copy(localHand).add(arm.target.tip).multiplyScalar(.5);arm.pole.quaternion.setFromUnitVectors(Y,direction.normalize());arm.pole.scale.y=length;
  }
  rig.model.updateMatrixWorld(true);
}
