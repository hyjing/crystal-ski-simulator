export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function createSkier(point, next) {
  return { x: point.x, z: point.z, vx: 0, vz: 0, heading: Math.atan2(next.x-point.x,next.z-point.z), speed: 0, distance: 0 };
}

// Ground-constrained skiing: projected gravity, aerodynamic drag, and edge grip.
// Velocity remains independent from ski heading so turns produce controlled slip.
export function stepSkier(s, input, terrain, dt, snow = 'packed') {
  dt = clamp(dt,0,1/30);
  const speed = Math.hypot(s.vx,s.vz);
  s.heading -= input.steer * (0.65 + Math.min(speed/15,.65)) * dt;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const rx = fz, rz = -fx;
  const g = terrain.gradient(s.x,s.z);
  const norm = 1 + g.x*g.x + g.z*g.z;
  s.vx += -9.81*g.x/norm*dt;
  s.vz += -9.81*g.z/norm*dt;
  const forward = s.vx*fx+s.vz*fz, lateral=s.vx*rx+s.vz*rz;
  const grip = snow === 'packed' ? 4.0 : 2.6;
  const side = lateral*Math.exp(-(grip+input.brake*5)*dt);
  const resistance=(snow==='packed'?.16:.55)+.0035*speed*speed+input.brake*(7+speed*.28);
  const along=Math.sign(forward)*Math.max(0,Math.abs(forward)-resistance*dt);
  s.vx=fx*along+rx*side; s.vz=fz*along+rz*side;
  const v=Math.hypot(s.vx,s.vz);
  if(v>42){s.vx*=42/v; s.vz*=42/v;}
  const dx=s.vx*dt,dz=s.vz*dt;
  s.x+=dx; s.z+=dz; s.distance+=Math.hypot(dx,dz);
  const slopeAlong=terrain.gradient(s.x,s.z);
  const vertical=slopeAlong.x*s.vx+slopeAlong.z*s.vz;
  s.speed=Math.hypot(s.vx,s.vz,vertical);
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
