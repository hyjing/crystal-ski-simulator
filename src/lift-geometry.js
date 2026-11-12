export const CHAIR_SEATS = [-.91, -.31, .29, .89];
export const CHAIR_CUSHION_Y = .095;
export const CHAIR_RIDER_Y = CHAIR_CUSHION_Y - .474;
export const CHAIR_RIDER_Z = -.09;
export const CABIN_FLOOR_Y = -.29;
export const CABIN_RIDER_Y = CABIN_FLOOR_Y - .101;
export const STATION_STOP_DISTANCE = 3.2;

const smooth = (start,end,value) => {
  const t = Math.max(0,Math.min(1,(value-start)/(end-start)));
  return t*t*(3-2*t);
};

export function liftLocal(pose, x, z) {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  return {x: pose.x+x*c+z*s,z: pose.z-x*s+z*c};
}

export function sampleCarrierPose(carrier, travel) {
  const {side,total,segments,ground,cabin} = carrier;
  const progress = Math.max(0,Math.min(total,travel));
  const distance = side > 0 ? progress : total-progress;
  const segment = segments.find(s => distance <= s.start+s.l) || segments.at(-1);
  const {a,b,l,start,rx,rz} = segment;
  const t = (distance-start)/l;
  const x = a.x+(b.x-a.x)*t+rx, z = a.z+(b.z-a.z)*t+rz;
  const freeHeight = a.y+(b.y-a.y)*t-Math.sin(Math.PI*t)*1.1-2.8;
  const open = 1-smooth(16,30,Math.min(progress,total-progress));
  const y = open ? freeHeight+((ground(x,z)+(cabin ? .33 : .47))-freeHeight)*open : freeHeight;
  return {
    x,z,y,
    heading:Math.atan2(b.x-a.x,b.z-a.z)+(side<0?Math.PI:0),
    open,
  };
}

export function riderAnchor(pose,cabin=false,seat=1) {
  const point=liftLocal(pose,cabin?0:CHAIR_SEATS[seat],cabin?0:CHAIR_RIDER_Z);
  return {...point,y:pose.y+(cabin?CABIN_RIDER_Y:CHAIR_RIDER_Y),heading:pose.heading,sit:cabin?0:1,stride:0};
}

export function liftServiceStop(carrier, role, offset=STATION_STOP_DISTANCE) {
  const end=role==='lower'?0:carrier.total;
  const progress=role==='lower'?offset:carrier.total-offset;
  const pose=sampleCarrierPose(carrier,progress);
  const point=carrier.cabin?liftLocal(pose,1.52,0):riderAnchor(pose);
  const terminal=liftLocal(sampleCarrierPose(carrier,end),-2.5,0);
  return {x:point.x,z:point.z,heading:pose.heading,progress,cabin:carrier.cabin,terminal};
}

export function liftServiceStops(carrier) {
  return {lower:liftServiceStop(carrier,'lower'),upper:liftServiceStop(carrier,'upper')};
}
