import {liftLocal,riderAnchor,STATION_STOP_DISTANCE} from './lift-geometry.js';
import {clearStationLine,stationWalkPath} from './station-walk.js';
import {stationPoint} from './lift-station-layout.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};
const lerp = (a, b, t) => a + (b - a) * t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const snowLevel = (surface,point) => surface(point.x,point.z)-1200-.115;
const between = (a, b, t) => ({x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t)});

export function carrierSeat(carrier) {
  const {position: p, quaternion: q} = carrier.collider;
  const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y ** 2 + q.z ** 2));
  return riderAnchor({x:p.x,y:p.y,z:p.z,heading},carrier.cabin);
}

export function returnLiftTarget(route,routes,terminals,carriers,position){
  const id=String(route.returnLiftId||route.liftId);
  const lower=terminals.find(s=>s.role==='lower'&&s.liftId===id);
  const upper=terminals.find(s=>s.role==='upper'&&s.liftId===id);
  if(!lower?.service||!upper?.service||distance(position,lower)>75||
    !carriers.some(c=>c.ascending&&String(c.liftId)===id))return null;
  const available=routes.filter(r=>String(r.liftId)===id);
  const destination=available.find(r=>r.id===route.id)||available.find(r=>!r.patrolOnly);
  return {lower,upper,destination};
}

function snowPath(points, clear) {
  const samples = [{...points[0], distance: 0}];
  const add = point => {
    const last = samples.at(-1), length = distance(last, point);
    if (length > .001) samples.push({...point, distance: last.distance + length});
  };
  for (let i = 1; i < points.length - 1; i++) {
    const [before, corner, after] = points.slice(i - 1, i + 2);
    const trim = Math.min(1.05, distance(before, corner) / 3, distance(after, corner) / 3);
    if (trim < .01) {add(corner); continue;}
    const entry = between(corner, before, trim / distance(before, corner));
    const exit = between(corner, after, trim / distance(after, corner));
    const curve = [entry];
    for (let j = 1; j <= 10; j++) {
      const t = j / 10;
      curve.push(between(between(entry, corner, t), between(corner, exit, t), t));
    }
    if (clear && curve.slice(1).some((p,j) => !clearStationLine(curve[j],p,clear))) add(corner);
    else curve.forEach(add);
  }
  add(points.at(-1));
  return samples;
}

function pathFrame(path, progress, surface, fallbackHeading) {
  const end = path.at(-1);
  if (path.length === 1) return {...end, y: snowLevel(surface,end), heading: fallbackHeading};
  const index = path.findIndex(p => p.distance > progress);
  const next = index < 0 ? end : path[index];
  const prev = index < 0 ? path.at(-2) : path[Math.max(0, index - 1)];
  const point = between(prev, next, clamp((progress - prev.distance) / (next.distance - prev.distance), 0, 1));
  return {...point, y: snowLevel(surface,point), heading: Math.atan2(next.x - prev.x, next.z - prev.z)};
}

export class LiftJourney {
  constructor() {this.phase = 'idle'; this.active = false;}

  begin(lower, upper, route, start, clear) {
    if (!lower || !upper || !route) return false;
    this.cancel();
    const queue = stationPoint(lower, -11, 17);
    const load = lower.service || {...stationPoint(lower,-4,3),heading:lower.heading+Math.PI,progress:STATION_STOP_DISTANCE};
    const entry=stationPoint(lower,-11,33);
    const waypoints = [start,entry,queue,stationPoint(lower,-5,13),load];
    const clearPath = clear ? stationWalkPath(waypoints,clear) ||
      stationWalkPath([start,entry,queue,load],clear) ||
      stationWalkPath([start,entry,load],clear) ||
      stationWalkPath([start,queue,load],clear) ||
      stationWalkPath([start,load],clear) : waypoints;
    if (!clearPath) return false;
    const end = clearPath.at(-1);
    if(lower.service&&distance(end,load)>.52)return false;
    const path = snowPath(clearPath,clear);
    const queueEnd = path.reduce((best, point) => distance(point, queue) < distance(best, queue) ? point : best).distance;
    Object.assign(this, {
      lower, upper, route, load, clear, path, queueEnd, phase: 'queue', active: true,
      age: 0, progress: 0, speed: 0, walkPhase: 0, previousProgress: 0,
      visualHeading: start.heading ?? lower.heading,
      frame: {x: start.x, z: start.z, y: start.y ?? 0, heading: start.heading ?? lower.heading, sit: 0, stride: 0, walkPhase: 0},
    });
    return true;
  }

  pause() {this.paused = true;}
  resume() {this.paused = false;}

  clockRate() {
    if (this.paused) return 0;
    if (this.phase === 'boarding'||this.phase==='dismounting') return .32;
    if (this.phase === 'waiting') return this.age>=3?5:1;
    if (this.phase !== 'riding') return 1;
    const {travelProgress, total} = this.carrier;
    return 1 + 7 * smooth(Math.min(travelProgress - 4, total - travelProgress - 4) / 30);
  }

  update(dt, carriers, surface) {
    if (!this.active || this.paused || dt <= 0) return this.active ? this.frame : null;
    dt = Math.min(dt, .1);
    this.age += dt;

    if (this.phase === 'queue' || this.phase === 'approaching') {
      const length = this.path.at(-1).distance;
      const remaining = length - this.progress;
      const target = Math.min(2.8, Math.sqrt(2 * 2.2 * remaining));
      this.speed += clamp(target - this.speed, -2.8 * dt, 2.2 * dt);
      const step = Math.min(remaining, this.speed * dt);
      this.progress += step;
      this.walkPhase += step * 5.5;
      this.frame = {...pathFrame(this.path, this.progress, surface, this.visualHeading), sit: 0, stride: clamp(this.speed / 2.8, 0, 1)};
      if (this.progress >= length - .005) {
        this.phase = 'waiting';
        this.frame.stride = 0;
        this.frame.heading = this.load.heading;
        this.age = 0;
      } else if (this.progress >= this.queueEnd) {
        this.phase = 'approaching';
      }
    }

    if (this.phase === 'waiting') {
      this.frame.heading=this.load.heading;
      const carrier = carriers.find(c => String(c.liftId) === String(this.lower.liftId) && c.ascending &&
        !c.playerReserved && Number.isFinite(c.travelProgress) && c.travelProgress >= 0 && c.travelProgress <= this.load.progress+.28);
      if (carrier) {
        this.carrier = carrier;
        carrier.playerReserved = true;
        this.boardStart = {...this.frame};
        this.transferAge=0;
        this.phase = 'boarding';
        this.age = 0;
      }else if(this.age>=18){
        this.unload(surface,true);
      }
    }

    if (this.phase === 'boarding') {
      this.board(dt,surface);
    } else if (this.phase === 'riding') {
      const c = this.carrier;
      this.frame = carrierSeat(c);
      const unloadProgress=this.upper.service?.progress??c.total-STATION_STOP_DISTANCE;
      if (c.travelProgress>=unloadProgress||(this.previousProgress>c.total*.8&&c.travelProgress<this.previousProgress)) {
        this.phase='dismounting';
        this.age=0;
      }
      this.previousProgress=c.travelProgress;
    } else if (this.phase === 'dismounting') {
      this.dismount(dt,surface);
    } else if (this.phase === 'unloading') {
      const t = smooth(this.age / this.unloadDuration);
      const frame=pathFrame(this.exitPath,this.exitPath.at(-1).distance*t,surface,this.visualHeading);
      this.walkPhase += distance(this.frame,frame)*5.5;
      this.frame = {...frame,sit:0,stride:.75*smooth(this.age/.65)*(1-smooth((t-.88)/.12))};
      if (this.age>=this.unloadDuration) {
        this.active=false;
        this.phase='complete';
      }
    }

    const delta = this.frame.heading - this.visualHeading;
    this.visualHeading += Math.atan2(Math.sin(delta), Math.cos(delta)) * (1 - Math.exp(-dt * 10));
    this.frame.heading = this.visualHeading;
    this.frame.walkPhase = this.walkPhase;
    return this.frame;
  }

  board(dt,surface){
    const carrier=this.carrier,seat=carrierSeat(carrier);
    const arrived=carrier.travelProgress>=this.load.progress-.16;
    if(!arrived&&!this.transferAge)return;
    this.transferAge+=dt;
    const duration=carrier.cabin?1.04:.72;
    const weight=smooth(this.transferAge/duration);
    const position=between(this.boardStart,seat,weight);
    const ground=snowLevel(surface,position);
    const rise=carrier.cabin?smooth(this.transferAge/.5):weight;
    const accessHeading=carrier.cabin?seat.heading-Math.PI/2:seat.heading;
    this.walkPhase+=distance(this.frame,position)*5.5;
    this.frame={...position,y:lerp(ground,seat.y,rise),heading:accessHeading+angleDelta(accessHeading,seat.heading)*weight,
      sit:seat.sit*weight,stride:carrier.cabin?.6*Math.sin(Math.PI*weight):0};
    if(this.transferAge>=duration){
      this.frame=seat;
      this.phase='riding';
      this.age=0;
    }
  }

  dismount(dt,surface){
    const seat=carrierSeat(this.carrier), cabin=this.carrier.cabin;
    const duration=cabin?1.05:.78, progress=clamp(this.age/duration,0,1);
    const liftOff=smooth((progress-.10)/.90);
    const position=liftLocal(seat,cabin?liftOff*1.55:0,cabin?0:liftOff*1.35);
    this.walkPhase+=distance(this.frame,position)*5.5;
    this.frame={...position,y:lerp(seat.y,snowLevel(surface,position),liftOff),heading:seat.heading+(cabin?Math.PI*.5*liftOff:0),
      sit:seat.sit*(1-smooth(progress/.82)),stride:.52*liftOff};
    if(progress>=1)this.unload(surface);
  }

  unload(surface, skip = false) {
    if (this.carrier) this.carrier.playerReserved = false;
    const landing=this.upper.service||this.upper;
    const start=skip?{...landing,y:snowLevel(surface,landing),heading:landing.heading,sit:0,stride:0}:{...this.frame};
    this.frame=start;
    const forward=liftLocal({...start,heading:this.upper.service?.heading??this.upper.heading},0,4);
    const waypoints=[start,forward,this.route.spawn];
    const exit=this.clear?stationWalkPath(waypoints,this.clear)||stationWalkPath([start,this.route.spawn],this.clear):waypoints;
    this.exitPath=snowPath(exit||[start,this.route.spawn],this.clear);
    this.age=0;
    this.phase='unloading';
    this.unloadDuration=clamp(this.exitPath.at(-1).distance/3.8,2.4,12);
  }

  skip(surface) {if (this.active && !this.paused) this.unload(surface, true);}

  cancel() {
    if (this.carrier) this.carrier.playerReserved = false;
    this.carrier = null;
    this.active = false;
    this.paused = false;
    this.phase = 'idle';
  }
}
