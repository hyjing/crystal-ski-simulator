export function recoverLook(yaw,pitch,idle,dt,active){
 if(!active||idle<1.8)return{yaw,pitch};
 const decay=Math.exp(-Math.min(dt,.1)*1.7),angle=Math.atan2(Math.sin(yaw),Math.cos(yaw));
 return{yaw:Math.abs(angle)<.001?0:angle*decay,pitch:Math.abs(pitch)<.001?0:pitch*decay};
}
