// Keep cheap, staggered IK updates while interpolating the rendered bones every frame.
export function targetNpcPose(actor,apply){
 const bones=actor.userData.humanRig?.bones;if(!bones){apply();return;}
 const states=actor.userData.poseBlend??=Object.values(bones).map(b=>({b,q:b.quaternion.clone(),p:b.position.clone(),fromQ:b.quaternion.clone(),fromP:b.position.clone()}));
 for(const s of states){s.fromQ.copy(s.b.quaternion);s.fromP.copy(s.b.position);}
 apply();
 for(const s of states){s.q.copy(s.b.quaternion);s.p.copy(s.b.position);s.b.quaternion.copy(s.fromQ);s.b.position.copy(s.fromP);}
}
export function blendNpcPose(actor,dt,snap=false){
 const a=snap?1:1-Math.exp(-Math.max(0,dt)*20);
 for(const s of actor.userData.poseBlend||[]){s.b.quaternion.slerp(s.q,a);s.b.position.lerp(s.p,a);}
}
