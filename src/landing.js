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
export function landingGradient(terrain,x,z){
 const h=terrain.surface||terrain.sample,d=1.8;
 return{x:(h(x+d,z)-h(x-d,z))/(2*d),z:(h(x,z+d)-h(x,z-d))/(2*d)};
}
