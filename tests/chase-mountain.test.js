import test from 'node:test';
import assert from 'node:assert/strict';
import {createChaseMountain} from '../src/chase-mountain.js';
import {resolveMountain,mountainAsset} from '../src/mountains.js';
import {mountainIdentity} from '../src/mountain-identity.js';
import {PatrolRun} from '../src/patrol-mode.js';
import {pointAlongRoute} from '../src/terrain.js';

test('Whitepeak exposes six distinct chase-only courses with flat starts and downhill finishes',()=>{
  const {terrain,routes,landcover}=createChaseMountain();
  assert.equal(resolveMountain('whitepeak'),'whitepeak');
  assert.equal(mountainAsset('whitepeak','dem.json'),null);
  assert.match(mountainIdentity('whitepeak').description,/虚拟雪山/);
  assert.deepEqual(routes.map(r=>r.difficulty),['easy','intermediate','advanced','intermediate','easy','advanced']);
  assert.equal(new Set(routes.map(r=>r.id)).size,6);
  const maxGrades=[];
  for(const route of routes){
    assert.ok(route.patrolOnly&&route.length>4600&&route.drop>800);
    const gradient=terrain.gradient(route.spawn.x,route.spawn.z);
    assert.ok(Math.hypot(gradient.x,gradient.z)<.08);
    const finish=route.points.at(-1);
    const finishGradient=terrain.gradient(finish.x,finish.z);
    assert.ok(Math.hypot(finishGradient.x,finishGradient.z)<.08);
    assert.ok(Math.abs(terrain.sample(route.points[0].x,route.points[0].z)-terrain.sample(finish.x,finish.z)-route.drop)<.01);
    const grades=Array.from({length:80},(_,i)=>{
      const p=pointAlongRoute(route,route.length*i/80),g=terrain.gradient(p.x,p.z);
      return Math.hypot(g.x,g.z);
    });
    maxGrades.push(Math.max(...grades));
    const run=new PatrolRun(route,()=>true);
    assert.ok(run.pickups.some(p=>p.type==='supply')&&run.pickups.some(p=>p.type==='medkit'));
    assert.equal(run.pickups.filter(p=>p.type==='avalanche').length,1);
    assert.ok(run.pickups.some(p=>p.type==='glider'));
    assert.ok(run.pickups.some(p=>p.type==='crew'));
    assert.ok(run.pickups.every(p=>!['autofrost','frosttrail'].includes(p.type)));
    assert.ok(run.pickups.filter(p=>p.type!=='medkit').length>=24);
  }
  assert.ok(maxGrades[0]<.25&&maxGrades[1]>.32&&maxGrades[2]>.5);
  assert.ok(routes[0].halfWidth>2*routes[1].halfWidth&&routes[1].halfWidth>routes[2].halfWidth);
  assert.ok(routes[1].length>routes[0].length*1.05);
  const park=routes[3],parkGrades=park.points.map(p=>terrain.gradient(p.x,p.z).z);
  assert.ok(Math.max(...parkGrades)>.08&&Math.min(...parkGrades)<-.60);
  const shelf=routes[4];
  assert.ok(shelf.points.at(-1).x-shelf.points[0].x>250);
  const basin=routes[5];
  assert.ok(basin.pisteWidth(basin.length*.3125)>basin.pisteWidth(basin.length*.4375)+10);
  assert.ok(routes[1].branches.length>0);
  assert.equal(landcover.values.length,terrain.width*terrain.height);
  assert.ok(landcover.values.some(v=>v>.75)&&landcover.values.some(v=>v===0));
});
