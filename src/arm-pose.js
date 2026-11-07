import * as THREE from 'three';
const clamp=THREE.MathUtils.clamp;
// Authored shoulder-relative poses, measured in actual arm lengths rather than
// legacy character units. IK corrects these poses instead of inventing the pose.
export function skiArmOffset(motion,sign){
 const tuck=clamp(motion.tuck||0,0,1),pole=clamp(motion.poling||0,0,1),phase=(motion.polePhase||0)*Math.PI*2,bank=motion.edgeRoll||0,plant=clamp(motion.plant||0,0,1);
 const neutral=new THREE.Vector3(sign*.28,-.52,.52),tucked=new THREE.Vector3(-sign*.18,-.15,.55),pushing=new THREE.Vector3(sign*.24,-.46-.12*Math.sin(phase),.25+.45*Math.cos(phase));
 neutral.lerp(tucked,tuck).lerp(pushing,pole);neutral.x+=sign*Math.abs(bank)*.05;neutral.y+=sign*bank*.08;
 return neutral.lerp(new THREE.Vector3(sign*.30,-.30,.70),plant);
}
export function reachableHand(shoulder,target,length,maxReach=.94){
 const delta=target.clone().sub(shoulder),distance=delta.length();
 if(distance<1e-6)return shoulder.clone().add(new THREE.Vector3(0,-length*.65,0));
 return shoulder.clone().addScaledVector(delta,clamp(distance,length*.18,length*maxReach)/distance);
}
export function smoothHand(previous,target,dt,length){
 if(!previous||dt<=0)return target.clone();
 const delta=target.clone().sub(previous),step=length*4*dt;
 return previous.clone().addScaledVector(delta,Math.min(1,step/Math.max(delta.length(),1e-6)));
}
