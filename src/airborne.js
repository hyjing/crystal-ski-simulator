import {stepSkier,PHYSICS,clamp} from './physics.js';
const height=(terrain,x,z)=>(terrain.surface||terrain.sample)(x,z);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function landingQuality(heading,travelHeading,normalImpact){
 const angle=Math.abs(wrap(heading-travelHeading)),alignment=Math.min(angle,Math.PI-angle);
 return{clean:alignment<.55&&normalImpact<7.5,alignment,switchLanding:angle>Math.PI/2};
}
function launch(s,terrain,manual){
 const g=terrain.gradient(s.x,s.z);s.airborne=true;s.airY=height(terrain,s.x,s.z)+.025;s.airVy=g.x*s.vx+g.z*s.vz+(manual?2.5:0);
 s.flightTime=0;s.trickYaw=0;s.spinRate=0;s.grabTime=0;s.grab=0;s.airPeak=0;s.launchHeight=s.airY;s.airEvent={type:'takeoff',manual};s.poling=0;
}
export function stepAirborne(s,input,terrain,dt,snow='packed'){
 dt=clamp(dt,0,1/30);s.airEvent=null;s.freestyleScore??=0;s.airY??=height(terrain,s.x,s.z);s.jumpCooldown=Math.max(0,(s.jumpCooldown||0)-dt);
 const jump=!!input.jump&&!s.jumpHeld;s.jumpHeld=!!input.jump;
 if(s.crashRemaining>0){s.crashRemaining=Math.max(0,s.crashRemaining-dt);s.vx=s.vz=s.speed=0;s.grab=0;s.airY=height(terrain,s.x,s.z);return s;}
 if(!s.airborne){
  const speed=Math.hypot(s.vx,s.vz),g=terrain.gradient(s.x,s.z),d=clamp((terrain.spacing||3)*.4,1,2),fx=s.vx/Math.max(speed,.001),fz=s.vz/Math.max(speed,.001),h=height(terrain,s.x,s.z);
  const curvature=(height(terrain,s.x+fx*d,s.z+fz*d)-2*h+height(terrain,s.x-fx*d,s.z-fz*d))/(d*d);
  const probe=.14,vy=g.x*s.vx+g.z*s.vz,clearance=h+vy*probe-.5*PHYSICS.gravity*probe*probe-height(terrain,s.x+s.vx*probe,s.z+s.vz*probe);
  const natural=speed>5&&(PHYSICS.gravity+speed*speed*curvature)/Math.sqrt(1+g.x*g.x+g.z*g.z)<-.5&&clearance>.025;
  if(!s.jumpCooldown&&((jump&&speed>3)||natural))launch(s,terrain,jump&&!natural);
  else{stepSkier(s,input,terrain,dt,snow);s.airY=height(terrain,s.x,s.z);s.grab=Math.max(0,(s.grab||0)-dt*8);return s;}
 }
 const v=Math.hypot(s.vx,s.vz,s.airVy),cdA=PHYSICS.uprightCdA+(PHYSICS.tuckCdA-PHYSICS.uprightCdA)*(input.tuck?1:0),drag=Math.exp(-.5*PHYSICS.airDensity*cdA/PHYSICS.mass*v*dt);
 s.vx*=drag;s.vz*=drag;s.airVy*=drag;s.x+=s.vx*dt;s.z+=s.vz*dt;s.distance+=Math.hypot(s.vx,s.vz)*dt;
 s.airY+=s.airVy*dt-.5*PHYSICS.gravity*dt*dt;s.airVy-=PHYSICS.gravity*dt;s.flightTime+=dt;s.airPeak=Math.max(s.airPeak,s.airY-s.launchHeight);
 s.spinRate+=(clamp(input.spin||0,-1,1)*8.0-s.spinRate)*(1-Math.exp(-dt*9));s.trickYaw+=s.spinRate*dt;
 s.grab+=(Number(!!input.grab)-s.grab)*(1-Math.exp(-dt*10));if(input.grab)s.grabTime+=dt;
 s.tuck+=(Number(!!input.tuck)-s.tuck)*(1-Math.exp(-dt*8));s.poling=0;s.turn*=Math.exp(-dt*12);s.edgeRoll*=Math.exp(-dt*8);s.edgeAngle=Math.abs(s.edgeRoll);s.speed=Math.hypot(s.vx,s.vz,s.airVy);
 const ground=height(terrain,s.x,s.z),g=terrain.gradient(s.x,s.z),relative=s.airVy-g.x*s.vx-g.z*s.vz;
 if(s.airY<=ground&&relative<0){
  const travel=Math.atan2(s.vx,s.vz),impact=-relative/Math.sqrt(1+g.x*g.x+g.z*g.z),quality=landingQuality(s.heading+s.trickYaw,travel,impact),halves=Math.round(Math.abs(s.trickYaw)/Math.PI);
  const points=quality.clean&&s.flightTime>.18?50+halves*150+(s.grabTime>.16?100:0):0;
  s.freestyleScore+=points;s.airborne=false;s.airY=ground;s.jumpCooldown=.35;s.heading=quality.clean?travel+(quality.switchLanding?Math.PI:0):travel;s.switchStance=quality.clean&&quality.switchLanding;
  s.airEvent={type:quality.clean?'land':'crash',points,rotation:halves*180,grab:s.grabTime>.16,airTime:s.flightTime,impact};
  if(!quality.clean){s.crashRemaining=1.15;s.vx=s.vz=s.speed=0;}else{s.vx*=.96;s.vz*=.96;s.speed=Math.hypot(s.vx,s.vz);}
  s.trickYaw=0;s.spinRate=0;s.grab=0;
 }
 return s;
}
