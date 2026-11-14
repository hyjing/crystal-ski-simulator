export function recoverLook(yaw,pitch,idle,dt,active){
 if(!active||idle<1.8)return{yaw,pitch};
 const decay=Math.exp(-Math.min(dt,.1)*1.7),angle=Math.atan2(Math.sin(yaw),Math.cos(yaw));
 return{yaw:Math.abs(angle)<.001?0:angle*decay,pitch:Math.abs(pitch)<.001?0:pitch*decay};
}
// Detect a convex roll-over ahead; a uniform steep slope needs no extra camera lift.
export function crestView(terrain,player,heading){
 const dx=Math.sin(heading),dz=Math.cos(heading),height=d=>terrain.surface(player.x+dx*d,player.z+dz*d);
 const ahead=24+Math.min(player.speed||0,35)*.64,far=height(ahead),near=(height(0)-height(6))/6;
 const grades=[.45,.7,1].map(t=>{const end=ahead*t;return(height(Math.max(5,end-12))-height(end))/Math.min(12,end-5);});
 const grade=Math.max(...grades);
 return{factor:Math.max(0,Math.min(1,(grade-near-.07)*3.8))*Math.max(0,Math.min(1,grade/.17)),ahead,ground:far};
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
