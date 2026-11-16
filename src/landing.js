const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Gameplay tolerances: moderate skid / impact is recoverable, not an instant fall.
export function landingQuality(heading,travelHeading,normalImpact,speed=12,spinRate=0){
 const difference=wrap(heading-travelHeading),angle=Math.abs(difference),alignment=Math.min(angle,Math.PI-angle);
 const clean=alignment<.60&&normalImpact<8;
 let reason=null;
 if(normalImpact>15.5)reason='impact';
 else if(alignment>1.30&&speed>10&&normalImpact>5.5)reason='crossed';
 else if(alignment>.95&&normalImpact>11.5)reason='combined';
 else if(Math.abs(spinRate)>6&&alignment>.95&&normalImpact>7.5)reason='rotation';
 return{clean:clean&&!reason,recoverable:!clean&&!reason,crash:!!reason,reason,alignment,switchLanding:angle>Math.PI/2,difference};
}
export function landingGradient(terrain,x,z,vx=0,vz=0){
 const h=terrain.surface||terrain.sample,d=1.8,speed=Math.hypot(vx,vz);
 if(speed<.1)return{x:(h(x+d,z)-h(x-d,z))/(2*d),z:(h(x,z+d)-h(x,z-d))/(2*d)};
 // The skis load the snow ahead of contact. Leave the approach slope behind
 // when the landing is just past a sharp change of grade.
 const fx=vx/speed,fz=vz/speed,rx=fz,rz=-fx;
 const xAhead=x+fx*d,zAhead=z+fz*d;
 const along=(h(xAhead,zAhead)-h(x,z))/d;
 const xCenter=(x+xAhead)*.5,zCenter=(z+zAhead)*.5;
 const across=(h(xCenter+rx*d*.5,zCenter+rz*d*.5)-h(xCenter-rx*d*.5,zCenter-rz*d*.5))/d;
 return{x:fx*along+rx*across,z:fz*along+rz*across};
}
