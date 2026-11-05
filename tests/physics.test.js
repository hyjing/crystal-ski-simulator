import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTerrain, getRoutes } from '../src/terrain.js';
import { createSkier, stepSkier, nearestOnRoute, clamp } from '../src/physics.js';

const flat={gradient:()=>({x:0,z:0})};
const slope={gradient:()=>({x:0,z:-.3})};
const neutral={steer:0,edge:0};
const trailData=JSON.parse(readFileSync(new URL('../public/data/crystal-trails.json',import.meta.url)));
function simulate(s,input,t=3,terrain=slope,snow='packed'){
  for(let i=0;i<t*120;i++)stepSkier(s,input,terrain,1/120,snow);
  return s;
}
const skier=()=>createSkier({x:0,z:0},{x:0,z:10});

test('gravity accelerates a stationary skier down a slope',()=>{
  const s=simulate(skier(),neutral);assert.ok(s.z>8);assert.ok(s.vz>5);assert.equal(s.vx,0);
});

test('a bounded steering controller can reach every checkpoint on each real-terrain route',()=>{
  const terrain=createTerrain(JSON.parse(readFileSync(new URL('../public/data/crystal-dem.json',import.meta.url))));
  for(const route of getRoutes(terrain,trailData)){
    const s=createSkier(route.points[0],route.points[1]);let next=1;
    for(let i=0;i<120*240&&next<route.points.length;i++){
      const p=route.points[next];let angle=Math.atan2(p.x-s.x,p.z-s.z)-s.heading;
      angle=Math.atan2(Math.sin(angle),Math.cos(angle));
      stepSkier(s,{steer:clamp(-angle*2,-1,1),edge:s.speed>15||Math.abs(angle)>1?1:0},terrain,1/120);
      if(Math.hypot(s.x-p.x,s.z-p.z)<65)next++;
    }
    assert.equal(next,route.points.length,`${route.name} must finish within four simulated minutes`);
  }
});
test('flat terrain does not generate motion',()=>{
  const s=simulate(skier(),neutral,5,flat);assert.equal(s.speed,0);assert.equal(s.distance,0);
});
test('edge input alone does not act as an artificial brake in a straight run',()=>{
  const straight=simulate(skier(),neutral,8),edged=simulate(skier(),{steer:0,edge:1},8);
  assert.ok(Math.abs(edged.speed-straight.speed)<.01);
});
test('completing a turn controls speed through sideways skid and cross-slope travel',()=>{
  const direct=skier(),turned=skier();direct.vz=turned.vz=15;
  simulate(direct,neutral,3);simulate(turned,{steer:1,edge:1},3);
  assert.ok(turned.speed<direct.speed*.6);
});
test('tucking reduces aerodynamic drag rather than applying a forward thrust',()=>{
  const direct=simulate(skier(),neutral,20),tucked=simulate(skier(),{steer:0,tuck:1},20);
  assert.ok(tucked.speed>direct.speed+2);
  assert.equal(simulate(skier(),{steer:0,tuck:1},3,flat).speed,0);
});
test('opposite steering inputs make mirrored turns',()=>{
  const a=skier(),b=skier();a.vz=b.vz=12;
  simulate(a,{steer:-1,edge:0},1,flat);simulate(b,{steer:1,edge:0},1,flat);
  assert.ok(a.x>0&&b.x<0);assert.ok(Math.abs(a.x+b.x)<1e-8);
});

test('downhill kinetic energy never exceeds gravitational energy released',()=>{
  const s=simulate(skier(),{steer:0,tuck:1},15);
  const drop=.3*s.z;
  assert.ok(.5*s.speed*s.speed<=9.81*drop+.01);
});

test('render surface follows the actual triangles and is continuous across the diagonal',()=>{
  const t=createTerrain({width:2,height:2,spacing:10,heights:[0,10,20,40]});
  assert.equal(t.surface(-2.5,-2.5),7.5);
  assert.equal(t.surface(2.5,2.5),27.5);
  assert.ok(Math.abs(t.surface(0,-.00001)-t.surface(0,.00001))<.001);
});

test('named trail data retains source IDs and projects inside the Crystal DEM',()=>{
  const t=createTerrain(JSON.parse(readFileSync(new URL('../public/data/crystal-dem.json',import.meta.url))));
  const routes=getRoutes(t,trailData);
  assert.deepEqual(routes.map(r=>r.name),['Green Valley','Lucky Shot','Tinkerbell']);
  for(const r of routes){
    assert.ok(r.sourceUrl.startsWith('https://www.openstreetmap.org/way/'));
    for(const p of r.points){assert.ok(Math.abs(p.x)<2500&&Math.abs(p.z)<3000);}
  }
});
test('soft snow has more drag than packed snow',()=>{
  assert.ok(simulate(skier(),neutral,10,slope,'soft').speed<simulate(skier(),neutral,10).speed);
});
test('long-running physics stays finite and bounded',()=>{
  const s=simulate(skier(),neutral,300,{gradient:()=>({x:.1,z:-1.5})});
  for(const v of Object.values(s))assert.ok(Number.isFinite(v));assert.ok(Math.hypot(s.vx,s.vz)<=42.0001);
});
test('route projection gives correct progress and off-route distance',()=>{
  const result=nearestOnRoute({x:4,z:6},[{x:0,z:0},{x:0,z:10},{x:10,z:10}]);
  assert.equal(result.distance,4);assert.equal(result.progress,6);assert.equal(result.total,20);
});
test('USGS grid has valid dimensions, units, and consistent interpolation',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/data/crystal-dem.json',import.meta.url)));
  const t=createTerrain(data);assert.equal(data.heights.length,data.width*data.height);assert.equal(data.epsg,32610);
  assert.ok(data.spacing>19&&data.spacing<21);
  for(const h of data.heights)assert.ok(Number.isFinite(h)&&h>1000&&h<3000);
  const p=t.world(100,150);assert.ok(Math.abs(t.sample(p.x,p.z)-data.heights[150*data.width+100])<1e-6);
  for(const r of getRoutes(t,trailData)){
    assert.ok(r.drop>100&&r.length>400);
    for(const p of r.points)assert.ok(Number.isFinite(t.sample(p.x,p.z)));
    const s=createSkier(r.points[0],r.points[1]);simulate(s,neutral,5,t);assert.ok(s.distance>3,`${r.name} must start on a skiable descent`);
  }
});
