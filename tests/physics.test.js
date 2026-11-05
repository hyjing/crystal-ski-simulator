import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTerrain, getRoutes } from '../src/terrain.js';
import { createSkier, stepSkier, nearestOnRoute, clamp } from '../src/physics.js';

const flat={gradient:()=>({x:0,z:0})};
const slope={gradient:()=>({x:0,z:-.3})};
const neutral={steer:0,brake:0};
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
  for(const route of getRoutes(terrain)){
    const s=createSkier(route.points[0],route.points[1]);let next=1;
    for(let i=0;i<120*240&&next<route.points.length;i++){
      const p=route.points[next];let angle=Math.atan2(p.x-s.x,p.z-s.z)-s.heading;
      angle=Math.atan2(Math.sin(angle),Math.cos(angle));
      stepSkier(s,{steer:clamp(-angle*2,-1,1),brake:s.speed>15||Math.abs(angle)>1?1:0},terrain,1/120);
      if(Math.hypot(s.x-p.x,s.z-p.z)<65)next++;
    }
    assert.equal(next,route.points.length,`${route.name} must finish within four simulated minutes`);
  }
});
test('flat terrain does not generate motion',()=>{
  const s=simulate(skier(),neutral,5,flat);assert.equal(s.speed,0);assert.equal(s.distance,0);
});
test('braking stops on flat terrain and strongly limits downhill speed',()=>{
  const s=skier();s.vz=15;simulate(s,{steer:0,brake:1},5,flat);assert.ok(s.speed<.01);
  const downhill=simulate(skier(),neutral,8),braked=simulate(skier(),{steer:0,brake:1},8);
  assert.ok(braked.speed<downhill.speed*.2);
});
test('opposite steering inputs make mirrored turns',()=>{
  const a=skier(),b=skier();a.vz=b.vz=12;
  simulate(a,{steer:-1,brake:0},1,flat);simulate(b,{steer:1,brake:0},1,flat);
  assert.ok(a.x>0&&b.x<0);assert.ok(Math.abs(a.x+b.x)<1e-8);
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
  for(const r of getRoutes(t)){
    assert.ok(r.drop>250&&r.length>1000);
    for(const p of r.points)assert.ok(Number.isFinite(t.sample(p.x,p.z)));
    const s=createSkier(r.points[0],r.points[1]);simulate(s,neutral,5,t);assert.ok(s.distance>3,`${r.name} must start on a skiable descent`);
  }
});
