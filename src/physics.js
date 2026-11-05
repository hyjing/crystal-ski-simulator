export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Prototype SI parameters; not measured ski/snow coefficients.
export const PHYSICS={mass:85,gravity:9.81,airDensity:1.0,uprightCdA:.65,tuckCdA:.28,packedFriction:.025,softFriction:.06};
export function createSkier(point, next) {
  return { x: point.x, z: point.z, vx: 0, vz: 0, heading: Math.atan2(next.x-point.x,next.z-point.z), speed: 0, distance: 0, turn: 0, edge: 0, slip: 0, tuck: 0 };
}

// Ground-constrained skiing: projected gravity, aerodynamic drag, and edge grip.
// Velocity remains independent from ski heading so turns produce controlled slip.
export function stepSkier(s, input, terrain, dt, snow = 'packed') {
  dt = clamp(dt,0,1/30);
  const speed = Math.hypot(s.vx,s.vz);
  const edge = clamp(input.edge || 0,0,1);
  s.turn += (clamp(input.steer,-1,1)-s.turn)*(1-Math.exp(-dt*6));
  s.edge = edge;
  s.tuck += (clamp(input.tuck||0,0,1)-s.tuck)*(1-Math.exp(-dt*5));
  s.heading -= s.turn * (0.55 + Math.min(speed/15,.65)) * (1+edge*.35) * (1-s.tuck*.18) * dt;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const rx = fz, rz = -fx;
  const g = terrain.gradient(s.x,s.z);
  const norm = 1 + g.x*g.x + g.z*g.z;
  s.vx += -PHYSICS.gravity*g.x/norm*dt;
  s.vz += -PHYSICS.gravity*g.z/norm*dt;
  const forward = s.vx*fx+s.vz*fz, lateral=s.vx*rx+s.vz*rz;
  const grip = (snow === 'packed' ? 3.1 : 2.3) + Math.abs(s.turn)*1.4 + edge*6;
  const side = lateral*Math.exp(-grip*dt);
  // No pedal-style deceleration. Cross-slope turns reduce downhill gravity;
  // lateral skid and stronger edge engagement dissipate energy in the snow.
  const skidDrag=Math.abs(lateral)*(.1+edge*.5);
  const verticalSpeed=g.x*s.vx+g.z*s.vz,surfaceSpeed=Math.hypot(s.vx,s.vz,verticalSpeed);
  const cdA=PHYSICS.uprightCdA+(PHYSICS.tuckCdA-PHYSICS.uprightCdA)*s.tuck;
  const drag=.5*PHYSICS.airDensity*cdA*surfaceSpeed*surfaceSpeed/PHYSICS.mass;
  const mu=snow==='packed'?PHYSICS.packedFriction:PHYSICS.softFriction;
  const horizontalFactor=speed/Math.max(surfaceSpeed,.001);
  const resistance=(mu*PHYSICS.gravity/Math.sqrt(norm)+drag)*horizontalFactor+skidDrag;
  const along=Math.sign(forward)*Math.max(0,Math.abs(forward)-resistance*dt);
  s.vx=fx*along+rx*side; s.vz=fz*along+rz*side;
  const v=Math.hypot(s.vx,s.vz);
  if(v>42){s.vx*=42/v; s.vz*=42/v;}
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
