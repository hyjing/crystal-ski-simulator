import {advanceNpcPoling} from './npc-routines.js';
import {trafficPoint} from './traffic-brain.js';

function moveAcrossSnow(skier, target, dt, clear) {
  const dx = target.x - skier.point.x, dz = target.z - skier.point.z;
  const distance = Math.hypot(dx, dz);
  if (distance < .18) return true;
  const step = Math.min(distance, skier.speed * dt);
  const next = {x: skier.point.x + dx * step / distance, z: skier.point.z + dz * step / distance};
  if (!clear(next)) {
    skier.speed = 0;
    return false;
  }
  const desired = Math.atan2(dx, dz);
  const turn = Math.atan2(Math.sin(desired - skier.heading), Math.cos(desired - skier.heading));
  skier.heading += turn * (1 - Math.exp(-dt * 6));
  skier.point = {...next, heading: skier.heading};
  skier.speed = step / dt;
  skier.walkPhase += step * 6;
  return false;
}

export function stageSkier(skier, route, index, clear, occupied) {
  const start = (route.spawn?.distance ?? 35) + 23 + index * 2;
  for (let progress = start; progress <= start + 56; progress += 7) {
    for (const offset of [index === 0 ? 5.5 : 4, -5, 2, -2, 0]) {
      const point = trafficPoint(route, progress, 0, index, offset);
      if (!clear(point) || occupied.some(p => Math.hypot(p.x - point.x, p.z - point.z) < 2)) continue;
      skier.route = route;
      skier.progress = progress;
      skier.point = point;
      skier.heading = point.heading;
      skier.avoid = offset;
      skier.startWait = 7 + index * 1.4;
      skier.activity = 'waiting';
      return point;
    }
  }
}

export function stepLiftExit(skier, index, dt, seen, observer, clear, pathClear, entryVisible) {
  skier.roll = 0;

  const endpoint = skier.route.length - 8;
  if (!skier.exit) {
    const center = trafficPoint(skier.route, endpoint, 0, index);
    const side = index % 2 ? 1 : -1;
    const sideX = Math.cos(center.heading), sideZ = -Math.sin(center.heading);
    const frontX = Math.sin(center.heading), frontZ = Math.cos(center.heading);
    const exits = [[side * 8, 0], [side * 9, 4], [-side * 8, 0], [-side * 9, 4], [side * 5, -2]]
      .map(([offset, ahead]) => ({
        x: center.x + sideX * offset + frontX * ahead,
        z: center.z + sideZ * offset + frontZ * ahead,
      }));
    skier.exitStops = exits.filter(clear);
    skier.exitIndex = 0;
    skier.exit = skier.exitStops[0] || center;
    skier.exitWait = 0;
    skier.entryWait = 0;
    skier.offscreen = 0;
  }

  const distance = Math.hypot(skier.point.x - observer.x, skier.point.z - observer.z);
  skier.offscreen = seen || distance < 28 ? 0 : skier.offscreen + dt;
  if (skier.offscreen > 2.5) {
    skier.indoor = true;
    skier.speed = 0;
    advanceNpcPoling(skier, false, dt);
    skier.entryWait -= dt;
    if (skier.entryWait > 0) return;
    skier.entryWait = .65;
    const start = (skier.route.spawn?.distance ?? 25) + 18 + index % 6 * 12;
    const entry = trafficPoint(skier.route, start, 0, index);
    if (Math.hypot(entry.x - observer.x, entry.z - observer.z) < 195 || entryVisible(entry) || !clear(entry)) return;
    skier.progress = start;
    skier.point = entry;
    skier.heading = skier.previousHeading = entry.heading;
    skier.exit = null;
    skier.indoor = false;
    skier.target = skier.avoidTarget = skier.avoid = 0;
    skier.yielding = false;
    skier.gesture = '';
    skier.walkAmount = 0;
    skier.decisionAge = 1;
    skier.activity = 'ski';
    return;
  }

  const moving = Math.hypot(skier.point.x - skier.exit.x, skier.point.z - skier.exit.z) >= .18;
  const push = advanceNpcPoling(skier, moving, dt);
  const target = moving ? 1.4 : 0;
  skier.speed = moving ? Math.min(target, skier.speed + (push + .35) * dt) : 0;
  if (moveAcrossSnow(skier, skier.exit, dt, pathClear)) {
    skier.exitWait += dt;
    skier.activity = 'lift-line';
    skier.gesture = Math.sin(skier.time * 1.2 + index) > .7 ? 'goggles' : 'chat';
    if (skier.exitWait > 3.5 + index % 3 && skier.exitStops.length > 1) {
      skier.exitIndex = (skier.exitIndex + 1) % skier.exitStops.length;
      skier.exit = skier.exitStops[skier.exitIndex];
      skier.exitWait = 0;
    }
  } else {
    skier.activity = 'exit';
    skier.gesture = '';
  }
}
