import {clamp, nearestOnRoute} from './physics.js';
import {sunDirection} from './environment.js';

const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function sampleSlopeConditions(terrain, route, position, nearbyTrees, weather) {
  const {x, z} = position;
  const height = terrain.surface(x, z);
  const trees = nearbyTrees(x, z);
  let cover = 0;
  for (const tree of trees) cover += 1 - smooth(4, 28, Math.hypot(x - tree.x, z - tree.z));
  const shelter = smooth(0, 6, cover);
  const sun = sunDirection(weather);
  const slope = terrain.gradient(x, z);
  const aspect = sun.y - slope.x * sun.x - slope.z * sun.z;
  let shade = 1 - smooth(-.05, .34, aspect);
  // Terrain along the sun ray catches ridge shadows that the local slope alone misses.
  for (const distance of [18, 40, 75, 125, 200, 320]) {
    const rise = terrain.surface(x + sun.x * distance, z + sun.z * distance) - height;
    shade = Math.max(shade, smooth(-3, 3, rise - sun.y * distance));
  }

  let basin = 0;
  if (route.id === 'green-valley') {
    const along = nearestOnRoute(position, route.points);
    const first = route.points[0];
    const drop = terrain.surface(first.x, first.z) - height;
    basin = smooth(25, 105, drop) * smooth(90, 250, along.progress) *
      (1 - smooth(.85, 1, along.progress / along.total)) * (1 - smooth(65, 140, along.distance));
  }
  return {shelter, shade, basin, exposure: (1 - shelter * .8) * (1 - basin * .55)};
}
