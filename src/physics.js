export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Prototype SI parameters; not measured ski/snow coefficients.
export const PHYSICS={mass:85,gravity:9.81,airDensity:1.0,uprightCdA:.65,tuckCdA:.25,packedFriction:.025,softFriction:.06,maxHorizontalSpeed:55};
export function createSkier(point, next) {
  return { x: point.x, z: point.z, vx: 0, vz: 0, heading: Math.atan2(next.x-point.x,next.z-point.z), speed: 0, distance: 0, turn: 0, edge: 0, edgeAngle:0, lastTurn:1, slip: 0, tuck: 0, poling:0, polePhase:0, edgeBrake:0 };
}

// Ground-constrained skiing: projected gravity, aerodynamic drag, and edge grip.
// Velocity remains independent from ski heading so turns produce controlled slip.
export function stepSkier(s, input, terrain, dt, snow = 'packed') {
  dt = clamp(dt,0,1/30);
  const speed = Math.hypot(s.vx,s.vz);
  const edge = clamp(input.edge || 0,0,1);
  if(Math.abs(input.steer)>.1)s.lastTurn=Math.sign(input.steer);
  // Rolling onto an edge bends a sidecut ski into an arc, even without yaw input.
  // A/D select its direction; Space alone uses the last chosen side.
  const startGradient=terrain.gradient(s.x,s.z),gradientMagnitude=Math.hypot(startGradient.x,startGradient.z);
  const alignment=gradientMagnitude?Math.abs((Math.sin(s.heading)*startGradient.x+Math.cos(s.heading)*startGradient.z)/gradientMagnitude):1;
  if(edge<.2)s.edgeBrake=0;
  else if(alignment<.42||(speed>1&&s.slip/Math.max(speed,.1)>.16))s.edgeBrake=1;
  const steering=Math.abs(input.steer)>.05?clamp(input.steer,-1,1):(speed>.8&&!s.edgeBrake?edge*s.lastTurn:0);
  s.turn += (steering-s.turn)*(1-Math.exp(-dt*(steering===0?32:26)));
  if(Math.abs(s.turn)<.001)s.turn=0;
  s.edge = edge;
  s.tuck += (clamp(input.tuck||0,0,1)-s.tuck)*(1-Math.exp(-dt*5));
  s.edgeAngle += (Math.min(.96,.40*Math.abs(s.turn)+edge*.82)-s.edgeAngle)*(1-Math.exp(-dt*28));
  const radius=19*Math.cos(s.edgeAngle);
  const balancedRate=PHYSICS.gravity*Math.tan(s.edgeAngle)/Math.max(speed,2);
  const sidecutRate=speed/Math.max(8,radius);
  const pivotRate=Math.max(0,1-speed/6)*1.15;
  const yawRate=pivotRate*Math.abs(s.turn)+Math.min(sidecutRate,balancedRate)+edge*Math.abs(s.turn)*(speed>.8?.72:0);
  s.heading -= Math.sign(s.turn)*yawRate*(1-s.tuck*.12)*dt;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const rx = fz, rz = -fx;
  const g = terrain.gradient(s.x,s.z);
  const norm = 1 + g.x*g.x + g.z*g.z;
  s.vx += -PHYSICS.gravity*g.x/norm*dt;
  s.vz += -PHYSICS.gravity*g.z/norm*dt;
  s.poling+=(Number(Boolean(input.pole))-s.poling)*(1-Math.exp(-dt*12));
  if(input.pole){
    s.polePhase=(s.polePhase+dt*1.35)%1;
    const contact=Math.max(0,Math.sin(s.polePhase*Math.PI*2));
    // Strong double-pole strokes, bounded by force and available human power.
    const force=Math.min(420,1800/Math.max(1,Math.abs(s.vx*fx+s.vz*fz)))*contact;
    const push=force/PHYSICS.mass*dt;s.vx+=fx*push;s.vz+=fz*push;
  }
  const forward = s.vx*fx+s.vz*fz, lateral=s.vx*rx+s.vz*rz;
  const normalAcceleration=PHYSICS.gravity/Math.sqrt(norm);
  const lateralMu=(snow==='packed'?.40:.32)+edge*(snow==='packed'?.70:.65)+Math.abs(s.turn)*.25;
  // A finite snow shear force: sideways slip dissipates energy, a stationary edge can hold.
  const side=Math.sign(lateral)*Math.max(0,Math.abs(lateral)-normalAcceleration*lateralMu*dt);
  // No pedal-style deceleration. Cross-slope turns reduce downhill gravity;
  // lateral skid and stronger edge engagement dissipate energy in the snow.
  const attack=Math.atan2(Math.abs(lateral),Math.max(.5,Math.abs(forward)));
  const skidBlend=clamp((Math.sin(attack)-.10)/.55,0,1)*edge;
  const skidDrag=normalAcceleration*skidBlend*.22;
  const verticalSpeed=g.x*s.vx+g.z*s.vz,surfaceSpeed=Math.hypot(s.vx,s.vz,verticalSpeed);
  const cdA=PHYSICS.uprightCdA+(PHYSICS.tuckCdA-PHYSICS.uprightCdA)*s.tuck;
  const drag=.5*PHYSICS.airDensity*cdA*surfaceSpeed*surfaceSpeed/PHYSICS.mass;
  const mu=(snow==='packed'?PHYSICS.packedFriction:PHYSICS.softFriction)+skidBlend*.34+(s.edgeBrake?edge*.25:0);
  const horizontalFactor=speed/Math.max(surfaceSpeed,.001);
  const resistance=(mu*PHYSICS.gravity/Math.sqrt(norm)+drag)*horizontalFactor+skidDrag;
  const along=Math.sign(forward)*Math.max(0,Math.abs(forward)-resistance*dt);
  s.vx=fx*along+rx*side; s.vz=fz*along+rz*side;
  const gravityAlong=Math.abs(-PHYSICS.gravity*(g.x*fx+g.z*fz)/norm),gravityAcross=Math.abs(-PHYSICS.gravity*(g.x*rx+g.z*rz)/norm);
  if(edge>.5&&!input.pole&&Math.hypot(s.vx,s.vz)<.3&&gravityAlong<normalAcceleration*((snow==='packed'?.04:.06)+edge*.28)&&gravityAcross<normalAcceleration*lateralMu){s.vx=0;s.vz=0;}
  const v=Math.hypot(s.vx,s.vz);
  if(v>PHYSICS.maxHorizontalSpeed){s.vx*=PHYSICS.maxHorizontalSpeed/v; s.vz*=PHYSICS.maxHorizontalSpeed/v;}
  const dx=s.vx*dt,dz=s.vz*dt;
  s.x+=dx; s.z+=dz; s.distance+=Math.hypot(dx,dz);
  const slopeAlong=terrain.gradient(s.x,s.z);
  const vertical=slopeAlong.x*s.vx+slopeAlong.z*s.vz;
  s.speed=Math.hypot(s.vx,s.vz,vertical);
  s.slip=Math.abs(lateral);
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
