export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Prototype SI parameters; not measured ski/snow coefficients.
export const PHYSICS={mass:85,gravity:9.81,airDensity:1.0,uprightCdA:.65,tuckCdA:.25,packedFriction:.025,softFriction:.06,maxHorizontalSpeed:55};
export function createSkier(point, next) {
  return { x: point.x, z: point.z, vx: 0, vz: 0, heading: Math.atan2(next.x-point.x,next.z-point.z), speed: 0, distance: 0, turn: 0, steerInput:0, edge: 0, edgeRoll:0, edgeAngle:0, lastTurn:1, slip: 0, tuck: 0, poling:0, polePhase:0, edgeBrake:0 };
}

// A/D banks the skis and turns the actual tangent velocity with a bounded lateral
// snow force. Strong edge + steering permits a deliberate skid / cross-slope stop.
// This remains a ground-constrained prototype, not independently simulated skis.
export function stepSkier(s, input, terrain, dt, snow = 'packed') {
  dt=clamp(dt,0,1/30);
  const speed=Math.hypot(s.vx,s.vz),edge=clamp(input.edge||0,0,1),steering=clamp(input.steer||0,-1,1);
  s.steerInput=steering;if(Math.abs(steering)>.1)s.lastTurn=Math.sign(steering);
  s.turn+=(steering-s.turn)*(1-Math.exp(-dt*(steering===0?32:26)));if(Math.abs(s.turn)<.001)s.turn=0;
  s.edge=edge;s.tuck+=(clamp(input.tuck||0,0,1)-s.tuck)*(1-Math.exp(-dt*5));
  const rollSide=Math.abs(s.turn)>.02?Math.sign(s.turn):s.lastTurn;
  const targetRoll=rollSide*Math.min(.96,.50*Math.abs(s.turn)+edge*.82);
  s.edgeRoll=((s.edgeRoll||0)+(targetRoll-(s.edgeRoll||0))*(1-Math.exp(-dt*16)));
  s.edgeAngle=Math.abs(s.edgeRoll);
  const g=terrain.gradient(s.x,s.z),norm=1+g.x*g.x+g.z*g.z,sqrtNorm=Math.sqrt(norm),normalAcceleration=PHYSICS.gravity/sqrtNorm;
  const slopeMagnitude=Math.hypot(g.x,g.z),alignment=slopeMagnitude?Math.abs((Math.sin(s.heading)*g.x+Math.cos(s.heading)*g.z)/slopeMagnitude):1;
  if(edge<.2)s.edgeBrake=0;else if(alignment<.42||(speed>1&&s.slip/Math.max(speed,.1)>.16))s.edgeBrake=1;

  s.vx-=PHYSICS.gravity*g.x/norm*dt;s.vz-=PHYSICS.gravity*g.z/norm*dt;
  s.poling+=(Number(Boolean(input.pole))-s.poling)*(1-Math.exp(-dt*12));
  if(input.pole){
    s.polePhase=(s.polePhase+dt*1.35)%1;const contact=Math.max(0,Math.sin(s.polePhase*Math.PI*2));
    const force=Math.min(420,1800/Math.max(1,Math.abs(s.vx*Math.sin(s.heading)+s.vz*Math.cos(s.heading))))*contact;
    s.vx+=Math.sin(s.heading)*force/PHYSICS.mass*dt;s.vz+=Math.cos(s.heading)*force/PHYSICS.mass*dt;
  }
  const lateralMu=(edge>.5?(snow==='packed'?.40:.32):(snow==='packed'?.70:.55))+edge*(snow==='packed'?.70:.65)+Math.abs(s.turn)*.25;
  const grip=normalAcceleration*lateralMu;
  let curveAcceleration=0;
  if(edge<.5){
    const vy=g.x*s.vx+g.z*s.vz,v=Math.hypot(s.vx,vy,s.vz),horizontal=Math.hypot(s.vx,s.vz);
    if(v>.2){
      const radius=Math.max(8,19*Math.cos(s.edgeAngle));
      curveAcceleration=Math.min(normalAcceleration*Math.tan(s.edgeAngle),v*v/radius,grip*.88);
      const pivot=Math.max(0,1-horizontal/5)*1.15*Math.abs(s.turn);
      const rate=(curveAcceleration/v+pivot)*(1-s.tuck*.12),angle=-Math.sign(s.edgeRoll)*rate*dt;
      // Rodrigues rotation in the actual slope tangent plane preserves kinetic energy.
      const nx=-g.x/sqrtNorm,ny=1/sqrtNorm,nz=-g.z/sqrtNorm,c=Math.cos(angle),sn=Math.sin(angle);
      const oldHeading=Math.atan2(s.vx,s.vz),vx=s.vx,vz=s.vz;
      s.vx=vx*c+(ny*vz-nz*vy)*sn;s.vz=vz*c+(nx*vy-ny*vx)*sn;
      const changed=Math.atan2(s.vx,s.vz)-oldHeading;s.heading+=Math.atan2(Math.sin(changed),Math.cos(changed));
    }else s.heading-=s.turn*1.15*dt;
  }else{
    // Do not inject yaw from Space alone. A/D sets ski attack angle for a skid.
    const pivot=Math.max(0,1-speed/6)*1.15;
    s.heading-=s.turn*(pivot+1.45)*(1-s.tuck*.12)*dt;
  }

  const fx=Math.sin(s.heading),fz=Math.cos(s.heading),rx=fz,rz=-fx;
  const forward=s.vx*fx+s.vz*fz,lateral=s.vx*rx+s.vz*rz;
  // A carving force already consumes part of the available snow reaction.
  const remainingGrip=Math.sqrt(Math.max(0,grip*grip-curveAcceleration*curveAcceleration));
  const side=Math.sign(lateral)*Math.max(0,Math.abs(lateral)-remainingGrip*dt);
  const attack=Math.atan2(Math.abs(lateral),Math.max(.5,Math.abs(forward)));
  const skidBlend=clamp((Math.sin(attack)-.10)/.55,0,1)*edge;
  if(edge>.5&&Math.abs(lateral)>Math.max(1,speed*.16))s.edgeBrake=1;
  const skidDrag=normalAcceleration*skidBlend*.22;
  const verticalSpeed=g.x*s.vx+g.z*s.vz,surfaceSpeed=Math.hypot(s.vx,s.vz,verticalSpeed);
  const cdA=PHYSICS.uprightCdA+(PHYSICS.tuckCdA-PHYSICS.uprightCdA)*s.tuck;
  const drag=.5*PHYSICS.airDensity*cdA*surfaceSpeed*surfaceSpeed/PHYSICS.mass;
  const mu=(snow==='packed'?PHYSICS.packedFriction:PHYSICS.softFriction)+skidBlend*.34+(s.edgeBrake?edge*.25:0);
  const horizontalFactor=Math.hypot(s.vx,s.vz)/Math.max(surfaceSpeed,.001);
  const resistance=(mu*normalAcceleration+drag)*horizontalFactor+skidDrag;
  const along=Math.sign(forward)*Math.max(0,Math.abs(forward)-resistance*dt);
  s.vx=fx*along+rx*side;s.vz=fz*along+rz*side;
  const gravityAlong=Math.abs(-PHYSICS.gravity*(g.x*fx+g.z*fz)/norm),gravityAcross=Math.abs(-PHYSICS.gravity*(g.x*rx+g.z*rz)/norm);
  if(edge>.5&&!input.pole&&Math.hypot(s.vx,s.vz)<.3&&gravityAlong<normalAcceleration*((snow==='packed'?.04:.06)+edge*.28)&&gravityAcross<normalAcceleration*lateralMu){s.vx=0;s.vz=0;}
  const v=Math.hypot(s.vx,s.vz);if(v>PHYSICS.maxHorizontalSpeed){s.vx*=PHYSICS.maxHorizontalSpeed/v;s.vz*=PHYSICS.maxHorizontalSpeed/v;}
  const dx=s.vx*dt,dz=s.vz*dt;s.x+=dx;s.z+=dz;s.distance+=Math.hypot(dx,dz);
  const slopeAlong=terrain.gradient(s.x,s.z);s.speed=Math.hypot(s.vx,s.vz,slopeAlong.x*s.vx+slopeAlong.z*s.vz);s.slip=Math.abs(side);
  return s;
}

export function nearestOnRoute(s, points) {
  let best={distance:Infinity,progress:0}, cumulative=0;
  for(let i=0;i<points.length-1;i++) {
    const a=points[i], b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    const t=clamp(((s.x-a.x)*dx+(s.z-a.z)*dz)/(len*len),0,1);
    const distance=Math.hypot(s.x-a.x-t*dx,s.z-a.z-t*dz);
    if(distance<best.distance) best={distance,progress:cumulative+t*len};
    cumulative+=len;
  }
  return {...best,total:cumulative};
}
