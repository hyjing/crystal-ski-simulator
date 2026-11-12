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

export function liftOrbit(position, heading, yaw, pitch, zoom) {
 const angle = heading + yaw;
 const tilt = Math.max(-.36, Math.min(.76, .25 - pitch));
 const distance = Math.max(4.5, Math.min(21, 11 + zoom));
 const horizontal = Math.cos(tilt) * distance;
 const focusY = position.y + 1 + pitch * 1.4;
 return {
  eye: {x: position.x - Math.sin(angle) * horizontal, y: focusY + Math.sin(tilt) * distance, z: position.z - Math.cos(angle) * horizontal},
  target: {x: position.x, y: focusY, z: position.z},
 };
}
