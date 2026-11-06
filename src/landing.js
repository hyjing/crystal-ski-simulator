const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Gameplay tolerances: moderate skid / impact is recoverable, not an instant fall.
export function landingQuality(heading,travelHeading,normalImpact,speed=12,spinRate=0){
 const difference=wrap(heading-travelHeading),angle=Math.abs(difference),alignment=Math.min(angle,Math.PI-angle);
 const clean=alignment<.60&&normalImpact<8;
 const reason=normalImpact>12.5?'impact':alignment>1.22&&speed>7&&normalImpact>2.5?'crossed':alignment>.85&&normalImpact>9.5?'combined':Math.abs(spinRate)>5&&alignment>.8&&normalImpact>5?'rotation':null;
 return{clean:clean&&!reason,recoverable:!clean&&!reason,crash:!!reason,reason,alignment,switchLanding:angle>Math.PI/2,difference};
}
export function landingGradient(terrain,x,z){
 const h=terrain.surface||terrain.sample,d=1.8;
 return{x:(h(x+d,z)-h(x-d,z))/(2*d),z:(h(x,z+d)-h(x,z-d))/(2*d)};
}
