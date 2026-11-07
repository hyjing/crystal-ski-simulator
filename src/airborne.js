import {stepSkier,PHYSICS,clamp} from './physics.js';
const height=(terrain,x,z)=>(terrain.surface||terrain.sample)(x,z);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
import {landingQuality,landingGradient} from './landing.js';
export {landingQuality} from './landing.js';
// Deliberate gameplay pop: retain real terrain, gravity and horizontal momentum.
export const TAKEOFF={manualMinSpeed:5,naturalMinSpeed:12,confirmationTime:.05};
export const jumpImpulse=speed=>5.2+1.4*clamp((speed-3)/17,0,1);
function launch(s,terrain,manual){
 const g=terrain.gradient(s.x,s.z);s.airborne=true;s.airY=height(terrain,s.x,s.z)+(manual?.025:.006);s.airVy=g.x*s.vx+g.z*s.vz+(manual?jumpImpulse(Math.hypot(s.vx,s.vz)):0);
 s.jumpQueued=0;s.jumpPreparation=0;s.airClearance=0;s.flightTime=0;s.trickYaw=0;s.spinRate=0;s.grabTime=0;s.grab=0;s.airPeak=0;s.launchHeight=s.airY;s.airEvent={type:'takeoff',manual};s.poling=0;s.naturalCandidate=0;
}
export function stepAirborne(s,input,terrain,dt,snow='packed'){
 dt=clamp(dt,0,1/30);s.airEvent=null;s.freestyleScore??=0;s.airY??=height(terrain,s.x,s.z);s.jumpCooldown=Math.max(0,(s.jumpCooldown||0)-dt);
 const jump=!!input.jump&&!s.jumpHeld;s.jumpHeld=!!input.jump;
 s.landingRecover=Math.max(0,(s.landingRecover||0)-dt);s.landingAnimationRemaining=Math.max(0,(s.landingAnimationRemaining||0)-dt);
 if(s.crashRemaining>0){s.jumpQueued=0;s.jumpPreparation=0;s.crashRemaining=Math.max(0,s.crashRemaining-dt);if(!s.crashRemaining&&Number.isFinite(s.recoveryHeading))s.heading=s.recoveryHeading;s.vx=s.vz=s.speed=0;s.grab=0;s.airY=height(terrain,s.x,s.z);return s;}
 if(!s.airborne){
  const speed=Math.hypot(s.vx,s.vz),g=terrain.gradient(s.x,s.z),d=clamp(terrain.spacing||3,2.5,6),fx=s.vx/Math.max(speed,.001),fz=s.vz/Math.max(speed,.001),h=height(terrain,s.x,s.z);
  // A ski-length / DEM-cell span rejects tiny triangle creases that the legs absorb.
  const curvature=(height(terrain,s.x+fx*d,s.z+fz*d)-2*h+height(terrain,s.x-fx*d,s.z-fz*d))/(d*d),vy=g.x*s.vx+g.z*s.vz;
  const gap=t=>h+vy*t-.5*PHYSICS.gravity*t*t-height(terrain,s.x+s.vx*t,s.z+s.vz*t);
  const frontGrade=(height(terrain,s.x+fx*d,s.z+fz*d)-h)/d,rearGrade=(h-height(terrain,s.x-fx*d,s.z-fz*d))/d;
  const unsupported=speed>=TAKEOFF.naturalMinSpeed&&rearGrade-frontGrade>.16&&(PHYSICS.gravity+speed*speed*curvature)/Math.sqrt(1+g.x*g.x+g.z*g.z)<-.5&&gap(.10)>.025&&gap(.22)>.20&&gap(.38)>.50;
  s.naturalCandidate=unsupported&&!s.jumpCooldown?(s.naturalCandidate||0)+dt:0;
  const natural=s.naturalCandidate>=TAKEOFF.confirmationTime;
  // A brief, buffered preload makes the pop visible; a tap still launches once.
  if(jump&&!s.jumpCooldown&&speed>=TAKEOFF.manualMinSpeed&&!s.jumpQueued)s.jumpQueued=.10;
  const queued=(s.jumpQueued||0)>0;
  if(queued){s.jumpQueued=Math.max(0,s.jumpQueued-dt);s.jumpPreparation=1-s.jumpQueued/.10;}else s.jumpPreparation=0;
  const manual=queued&&!s.jumpQueued&&speed>=TAKEOFF.manualMinSpeed-.5;
  if(!s.jumpCooldown&&(manual||natural))launch(s,terrain,manual);
  else{if(s.landingRecover>0&&Number.isFinite(s.recoveryHeading))s.heading+=wrap(s.recoveryHeading-s.heading)*(1-Math.exp(-dt*4));if(jump&&speed<TAKEOFF.manualMinSpeed)s.airEvent={type:'jump-blocked',minSpeed:TAKEOFF.manualMinSpeed};stepSkier(s,input,terrain,dt,snow);s.airY=height(terrain,s.x,s.z);s.grab=Math.max(0,(s.grab||0)-dt*8);return s;}
 }
 const v=Math.hypot(s.vx,s.vz,s.airVy),cdA=PHYSICS.uprightCdA+(PHYSICS.tuckCdA-PHYSICS.uprightCdA)*(input.tuck?1:0),drag=Math.exp(-.5*PHYSICS.airDensity*cdA/PHYSICS.mass*v*dt);
 s.vx*=drag;s.vz*=drag;s.airVy*=drag;s.x+=s.vx*dt;s.z+=s.vz*dt;s.distance+=Math.hypot(s.vx,s.vz)*dt;
 s.airY+=s.airVy*dt-.5*PHYSICS.gravity*dt*dt;s.airVy-=PHYSICS.gravity*dt;s.flightTime+=dt;s.airPeak=Math.max(s.airPeak,s.airY-s.launchHeight);
 s.spinRate+=(clamp(input.spin||0,-1,1)*8.0-s.spinRate)*(1-Math.exp(-dt*9));s.trickYaw+=s.spinRate*dt;
 s.grab+=(Number(!!input.grab)-s.grab)*(1-Math.exp(-dt*10));if(input.grab)s.grabTime+=dt;
 s.tuck+=(Number(!!input.tuck)-s.tuck)*(1-Math.exp(-dt*8));s.poling=0;s.turn*=Math.exp(-dt*12);s.edgeRoll*=Math.exp(-dt*8);s.edgeAngle=Math.abs(s.edgeRoll);s.speed=Math.hypot(s.vx,s.vz,s.airVy);
 const ground=height(terrain,s.x,s.z);s.airClearance=Math.max(0,s.airY-ground);const g=landingGradient(terrain,s.x,s.z),relative=s.airVy-g.x*s.vx-g.z*s.vz;
 if(s.airY<=ground&&relative<0){
  const travel=Math.atan2(s.vx,s.vz),impact=-relative/Math.sqrt(1+g.x*g.x+g.z*g.z),touchdownHeading=wrap(s.heading+s.trickYaw),quality=landingQuality(touchdownHeading,travel,impact,Math.hypot(s.vx,s.vz),s.spinRate),halves=Math.round(Math.abs(s.trickYaw)/Math.PI);
  const points=quality.clean&&s.flightTime>.18?50+halves*150+(s.grabTime>.16?100:0):0;
  s.freestyleScore+=points;s.airborne=false;s.airY=ground;s.jumpCooldown=.45;s.naturalCandidate=0;s.heading=touchdownHeading;s.switchStance=!quality.crash&&quality.switchLanding;s.recoveryHeading=travel+(quality.switchLanding?Math.PI:0);s.crashSide=Math.sign(quality.difference)||1;
  s.landingStrength=clamp((impact-3)/7,0,1);s.landingAnimationDuration=.55+s.landingStrength*.20;s.landingAnimationRemaining=s.landingAnimationDuration;
  s.airEvent={type:quality.crash?'crash':'land',quality:quality.clean?'clean':quality.recoverable?'recover':'crash',reason:quality.reason,alignment:quality.alignment,points,rotation:halves*180,grab:s.grabTime>.16,airTime:s.flightTime,impact};
  if(quality.crash){s.crashRemaining=s.crashDuration=3.2;s.crashReason='landing';s.landingFailure=s.airEvent;s.vx=s.vz=s.speed=0;}else{const retain=quality.recoverable?.78:.96;s.landingRecover=quality.recoverable?.9:.25;s.vx*=retain;s.vz*=retain;s.speed=Math.hypot(s.vx,s.vz);}
  s.trickYaw=0;s.spinRate=0;s.grab=0;
 }
 return s;
}
