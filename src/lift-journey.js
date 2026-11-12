import {clearStationLine,stationWalkPath} from './station-walk.js';
import {stationPoint} from './lift-station-layout.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};
const lerp = (a, b, t) => a + (b - a) * t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const between = (a, b, t) => ({x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t)});

export function carrierSeat(carrier) {
  const {position: p, quaternion: q} = carrier.collider;
  const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y ** 2 + q.z ** 2));
  return {
    x: p.x - .30 * Math.cos(heading) - .10 * Math.sin(heading),
    z: p.z + .30 * Math.sin(heading) - .10 * Math.cos(heading),
    y: p.y - .35, heading, sit: 1, stride: 0,
  };
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
  if (path.length === 1) return {...end, y: surface(end.x, end.z) - 1200 - .07, heading: fallbackHeading};
  const index = path.findIndex(p => p.distance > progress);
  const next = index < 0 ? end : path[index];
  const prev = index < 0 ? path.at(-2) : path[Math.max(0, index - 1)];
  const point = between(prev, next, clamp((progress - prev.distance) / (next.distance - prev.distance), 0, 1));
  return {...point, y: surface(point.x, point.z) - 1200 - .07, heading: Math.atan2(next.x - prev.x, next.z - prev.z)};
}

export class LiftJourney {
  constructor() {this.phase = 'idle'; this.active = false;}

  begin(lower, upper, route, start, clear) {
    if (!lower || !upper || !route) return false;
    this.cancel();
    const queue = stationPoint(lower, -11, 17);
    const waypoints = [start, stationPoint(lower, -11, 33), queue, stationPoint(lower, -5, 13), stationPoint(lower, -4, 3)];
    const clearPath = clear ? stationWalkPath(waypoints,clear) : waypoints;
    if (!clearPath) return false;
    const path = snowPath(clearPath,clear);
    const queueEnd = path.reduce((best, point) => distance(point, queue) < distance(best, queue) ? point : best).distance;
    Object.assign(this, {
      lower, upper, route, path, queueEnd, phase: 'queue', active: true,
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
    if (this.phase === 'boarding') return .32;
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
        this.age = 0;
      } else if (this.progress >= this.queueEnd) {
        this.phase = 'approaching';
      }
    }

    if (this.phase === 'waiting') {
      const carrier = carriers.find(c => String(c.liftId) === String(this.lower.liftId) && c.ascending &&
        !c.playerReserved && Number.isFinite(c.travelProgress) && c.travelProgress >= 0 && c.travelProgress < 3.8);
      if (carrier) {
        this.carrier = carrier;
        carrier.playerReserved = true;
        this.boardStart = {...this.frame};
        this.phase = 'boarding';
        this.age = 0;
      }
    }

    if (this.phase === 'boarding') {
      const seat = carrierSeat(this.carrier);
      const move = smooth(this.age / 1.65);
      const sit = smooth((this.age - .40) / 1.19);
      const position = between(this.boardStart, seat, move);
      const ground = surface(position.x, position.z) - 1200 - .07;
      this.walkPhase += distance(this.frame, position) * 5.5;
      this.frame = {...position, y: lerp(ground, seat.y, sit), heading: this.boardStart.heading + Math.atan2(Math.sin(seat.heading-this.boardStart.heading),Math.cos(seat.heading-this.boardStart.heading))*smooth(this.age/.85), sit, stride: .55 * (1 - sit) * smooth(this.age / .3)};
      if (this.age >= 1.65) {
        this.phase = 'riding';
        this.age = 0;
        this.frame = seat;
      }
    } else if (this.phase === 'riding') {
      const c = this.carrier;
      this.frame = carrierSeat(c);
      if (c.travelProgress >= c.total - 3.8 || (this.previousProgress > c.total * .8 && c.travelProgress < this.previousProgress)) this.unload(surface);
      this.previousProgress = c.travelProgress;
    } else if (this.phase === 'unloading') {
      const to = this.route.spawn;
      const t = smooth(this.age / this.unloadDuration);
      const position = between(this.unloadStart, to, t);
      const ground = surface(position.x, position.z) - 1200 - .07;
      const heading = Math.atan2(to.x - this.unloadStart.x, to.z - this.unloadStart.z);
      this.walkPhase += distance(this.frame, position) * 5.5;
      this.frame = {...position, y: lerp(this.unloadStart.y, ground, smooth(this.age / .9)), heading,
        sit: this.unloadStart.sit * (1 - smooth(this.age / .85)), stride: .7 * smooth(this.age / .7) * (1 - smooth((t - .86) / .14))};
      if (this.age >= this.unloadDuration) {
        this.active = false;
        this.phase = 'complete';
      }
    }

    const delta = this.frame.heading - this.visualHeading;
    this.visualHeading += Math.atan2(Math.sin(delta), Math.cos(delta)) * (1 - Math.exp(-dt * 10));
    this.frame.heading = this.visualHeading;
    this.frame.walkPhase = this.walkPhase;
    return this.frame;
  }

  unload(surface, skip = false) {
    if (this.carrier) this.carrier.playerReserved = false;
    this.unloadStart = skip
      ? {x: this.upper.x, z: this.upper.z, y: surface(this.upper.x, this.upper.z) - 1200 + .4, sit: 0}
      : {...this.frame};
    if (skip) this.frame = {...this.unloadStart, heading: this.visualHeading, stride: 0};
    this.age = 0;
    this.phase = 'unloading';
    this.unloadDuration = clamp(distance(this.unloadStart, this.route.spawn) / 3.8, 2.4, 10);
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
