export function createTerrain(data) {
  const { width, height, spacing, heights } = data;
  const world = (x, z) => ({ x: (x - (width - 1) / 2) * spacing, z: (z - (height - 1) / 2) * spacing });
  function sample(x, z) {
    const u = Math.max(0, Math.min(width - 1.001, x / spacing + (width - 1) / 2));
    const v = Math.max(0, Math.min(height - 1.001, z / spacing + (height - 1) / 2));
    const ix = Math.floor(u), iz = Math.floor(v), fx = u - ix, fz = v - iz;
    const a = heights[iz * width + ix], b = heights[iz * width + ix + 1];
    const c = heights[(iz + 1) * width + ix], d = heights[(iz + 1) * width + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }
  const gradient = (x, z) => {
    const e = spacing * .65;
    return { x: (sample(x + e, z) - sample(x - e, z)) / (2 * e), z: (sample(x, z + e) - sample(x, z - e)) / (2 * e) };
  };
  return { ...data, world, sample, gradient };
}

export const routeDefinitions = [
  { id: 'ridge', name: 'Ridge to Valley', subtitle: '山脊穿越', label: '完整线路', color: '#b9f578', points: [[39,170],[74,171],[76,173],[80,174],[96,174],[98,172],[108,172],[112,173],[114,175],[136,175],[139,172]] },
  { id: 'bowl', name: 'Open Bowl', subtitle: '开阔坡面', label: '短程探索', color: '#79d7ed', points: [[65,148],[68,145],[80,145],[82,144],[84,146],[92,146],[95,148],[109,148],[136,175],[139,172]] },
  { id: 'valley', name: 'Lower Traverse', subtitle: '下山横切', label: '快速试玩', color: '#f5c881', points: [[85,185],[90,186],[125,186],[139,172]] },
];

export function getRoutes(terrain) {
  return routeDefinitions.map(route => {
    const points = route.points.map(([x,z]) => terrain.world(x,z));
    const length = points.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
    return { ...route, points, length, drop: terrain.sample(points[0].x,points[0].z)-terrain.sample(points.at(-1).x,points.at(-1).z) };
  });
}
