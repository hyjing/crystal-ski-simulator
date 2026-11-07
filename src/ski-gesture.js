import {MathUtils,Vector3} from 'three';
const {clamp,smoothstep}=MathUtils;
// Presentation state only: never changes trajectory, speed or landing judgement.
export function advanceSkiGesture(state,s,dt,surface){
 dt=clamp(dt||0,0,.2);const grounded=!s.airborne&&!s.crashRemaining&&!s.pedestrian&&!s.ridePose;
 const edge=s.edgeRoll||0,side=Math.abs(edge)>.10?Math.sign(edge):0;
 if(grounded&&state.side&&side&&side!==state.side)state.releaseAge=0;
 if(grounded&&state.edge!==undefined&&Math.abs(state.edge)>.2&&Math.abs(edge)<.12)state.releaseAge=0;
 if(side)state.side=side;
 state.edge=edge;state.releaseAge=(state.releaseAge??10)+dt;
 const release=grounded?Math.exp(-state.releaseAge/.16):0;
 // Estimate a ski-length terrain curvature, not per-triangle normal noise.
 let target=0;
 if(grounded&&surface&&Number.isFinite(s.x)&&Number.isFinite(s.z)&&s.speed>1){const h=s.heading||0,fx=Math.sin(h),fz=Math.cos(h),d=2.4,y=surface(s.x,s.z),curve=(surface(s.x+fx*d,s.z+fz*d)-2*y+surface(s.x-fx*d,s.z-fz*d))/(d*d);target=clamp(curve*s.speed*s.speed/18,-.18,.75);}
 state.absorption=(state.absorption||0)+(target-(state.absorption||0))*(dt?1-Math.exp(-dt*12):1);
 if(!grounded)state.absorption=0;
 const landing=s.landingAnimationRemaining>0?Math.sin(Math.PI*clamp(1-s.landingAnimationRemaining/(s.landingAnimationDuration||.55),0,1)):0;
 return {release,absorption:state.absorption,landing,landingPhase:s.landingAnimationRemaining>0?clamp(1-s.landingAnimationRemaining/(s.landingAnimationDuration||.55),0,1):1,landingStrength:clamp(s.landingStrength||0,0,1)};
}
// Normalized authoring controls used by the offline native-skeleton baker.
export function skiShape(s){
 const p=s.poseShape||{},bank=clamp(Math.abs(s.edgeRoll||0),0,1.1),tuck=s.tuck||0;
 return {flex:.12+bank*.16+tuck*.35+(p.flex||0),bend:.16+tuck*.45+bank*.045+(p.bend||0),hipForward:.07+tuck*.10+(p.hipForward||0),knee:.40+tuck*.20+(p.knee||0),fold:p.fold||0,stance:p.stance??1,brace:p.brace||0,armLift:p.armLift||0,release:p.release||0};
}

// Pick a feasible snow point on the fixed-length pole sphere. Hands never snap
// to arbitrary preselected ground points. A moving skier releases stale contact.
export function poleSnowContact(hand,aim,length,surface){
 const horizontal=new Vector3(aim.x,0,aim.z);if(horizontal.lengthSq()<1e-8)horizontal.set(0,0,1);horizontal.normalize();
 const point=r=>{const p=hand.clone().addScaledVector(horizontal,r);p.y=surface(p.x,p.z)+.025;return p;};
 if(hand.y<surface(hand.x,hand.z)||point(0).distanceTo(hand)>length)return null;
 let lo=0,hi=length;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(point(mid).distanceTo(hand)>length)hi=mid;else lo=mid;}return point((lo+hi)/2);
}
