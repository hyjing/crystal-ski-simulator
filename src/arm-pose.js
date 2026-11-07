import * as THREE from 'three';
const clamp=THREE.MathUtils.clamp;
// Authored shoulder-relative poses, measured in actual arm lengths rather than
// legacy character units. IK corrects these poses instead of inventing the pose.
export function skiArmOffset(motion,sign){
 const tuck=clamp(motion.tuck||0,0,1),pole=clamp(motion.poling||0,0,1),phase=(motion.polePhase||0)*Math.PI*2,bank=motion.edgeRoll||0,plant=clamp(motion.plant||0,0,1);
 const neutral=new THREE.Vector3(sign*.24,-.46,.57),tucked=new THREE.Vector3(sign*.08,-.20,.56),pushing=new THREE.Vector3(sign*.34,-.46-.12*Math.sin(phase),.35+.36*Math.cos(phase));
 neutral.lerp(tucked,tuck).lerp(pushing,pole);neutral.x+=sign*Math.abs(bank)*.05;neutral.y+=sign*bank*.08;
 neutral.lerp(new THREE.Vector3(sign*.25,-.42,.64),plant);
 const shape=motion.shape||{};neutral.y+=shape.armLift||0;
 return neutral.lerp(new THREE.Vector3(sign*.38,-.58,.42),clamp(shape.brace||0,0,1));
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
// Solve the elbow on the exact two-bone joint circle. A loose pole-vector hint
// can project across the shoulder-hand axis and tuck the elbow into the torso.
// Choose its lateral coordinate explicitly in the moving chest frame instead.
export function skiArmSolution(shoulder,hand,frame,sign,upper,lower){
 const length=upper+lower,delta=hand.clone().sub(shoulder),d=clamp(delta.length(),Math.abs(upper-lower)+.001,length-.002),axis=delta.normalize(),along=(upper*upper-lower*lower+d*d)/(2*d),radius=Math.sqrt(Math.max(0,upper*upper-along*along)),center=shoulder.clone().addScaledVector(axis,along);
 const outside=frame.right.clone().multiplyScalar(sign),radial=outside.clone().addScaledVector(axis,-outside.dot(axis)),projection=radial.length();
 // Ski poses keep hands below shoulders, making the rear-facing branch stable.
 // Preserve a finite answer for unusual inputs rather than normalizing zero.
 if(projection<1e-5)radial.copy(frame.forward).addScaledVector(axis,-frame.forward.dot(axis));radial.normalize();
 const back=new THREE.Vector3().crossVectors(axis,radial).normalize();if(back.dot(frame.forward)>0)back.negate();
 const handOut=hand.clone().sub(shoulder).dot(outside),wanted=clamp(handOut-length*.05,length*.18,length*.24),centerOut=center.clone().sub(shoulder).dot(outside),cos=clamp((wanted-centerOut)/Math.max(1e-6,radius*projection),-.98,.98),bend=radial.multiplyScalar(cos).addScaledVector(back,Math.sqrt(1-cos*cos));
 return {joint:center.addScaledVector(bend,radius),end:shoulder.clone().addScaledVector(axis,d)};
}
