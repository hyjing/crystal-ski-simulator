export function recoverLook(yaw,pitch,idle,dt,active){
 if(!active||idle<1.8)return{yaw,pitch};
 const decay=Math.exp(-Math.min(dt,.1)*1.7),angle=Math.atan2(Math.sin(yaw),Math.cos(yaw));
 return{yaw:Math.abs(angle)<.001?0:angle*decay,pitch:Math.abs(pitch)<.001?0:pitch*decay};
}
// Detect a convex roll-over ahead; a uniform steep slope needs no extra camera lift.
export function crestView(terrain,player,heading){
 const dx=Math.sin(heading),dz=Math.cos(heading),h=terrain.surface(player.x,player.z),near=(h-terrain.surface(player.x+dx*5,player.z+dz*5))/5,ahead=24+Math.min(player.speed||0,20)*.4,far=terrain.surface(player.x+dx*ahead,player.z+dz*ahead),grade=(h-far)/ahead;
 return{factor:Math.max(0,Math.min(1,(grade-near-.06)*5))*Math.max(0,Math.min(1,grade/.16)),ahead,ground:far};
}
export function clearCameraSight(terrain,eye,target){
 let required=eye.y;
 for(let i=1;i<=16;i++){const t=i/18,x=eye.x+(target.x-eye.x)*t,z=eye.z+(target.z-eye.z)*t,h=terrain.surface(x,z)-1200+.8;required=Math.max(required,(h-target.y*t)/(1-t));}
 return required;
}
