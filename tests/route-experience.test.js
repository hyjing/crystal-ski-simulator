import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTerrain,getLiftRuns,pointAlongRoute} from '../src/terrain.js';
import {createSkier,stepSkier,nearestOnRoute} from '../src/physics.js';
import {chaseDirection,luckyWidth,luckyShade,routeBranchCandidates} from '../src/route-experience.js';
import {PatrolRun} from '../src/patrol-mode.js';
import {RunGhost,ghostKey,readGhost,ghostPosition} from '../src/run-ghost.js';

function crystal(){
  const data=name=>JSON.parse(fs.readFileSync(new URL(`../public/data/crystal-${name}.json`,import.meta.url)));
  const meta=data('detail-dem');
  const buffer=fs.readFileSync(new URL(`../public/data/${meta.data}`,import.meta.url));
  return {data,terrain:createTerrain({...meta,heights:new Float32Array(buffer.buffer,buffer.byteOffset,buffer.length/4)})};
}

test('Lucky Shot has distinct widths and clean-ski release converges toward travel',()=>{
  const {data,terrain}=crystal();
  const route=getLiftRuns(terrain,data('lift-runs')).find(r=>r.id==='lucky-shot');
  assert.equal(luckyWidth(500),10);
  assert.equal(luckyWidth(970),17);
  assert.equal(luckyWidth(1280),20);
  assert.ok(luckyShade(500)>luckyShade(970));
  const start=pointAlongRoute(route,1150),end=pointAlongRoute(route,1180);
  const player=createSkier(start,end);
  player.vx=Math.sin(player.heading+.3)*14;
  player.vz=Math.cos(player.heading+.3)*14;
  for(let i=0;i<65;i++)stepSkier(player,{},terrain,1/120);
  const yaw=Math.atan2(player.vx,player.vz)-player.heading;
  assert.ok(Math.abs(Math.atan2(Math.sin(yaw),Math.cos(yaw)))<.15);
});

test('Crystal chase has viable separated paths that rejoin the marked route and offer health',()=>{
  const {data,terrain}=crystal();
  const [route]=getLiftRuns(terrain,data('angry-skiers-run'));
  route.spawn={distance:35};
  route.branches=routeBranchCandidates(route,terrain);
  assert.equal(route.branches.length,2);
  const run=new PatrolRun(route,()=>true);
  for(const branch of route.branches){
    assert.ok(nearestOnRoute(branch.points[0],route.points).distance<.01);
    assert.ok(nearestOnRoute(branch.points.at(-1),route.points).distance<.01);
    assert.ok(nearestOnRoute(branch.points[8],route.points).distance>13);
    assert.ok(run.pickups.some(p=>p.type==='medkit'&&branch.points.some(b=>b.x===p.x&&b.z===p.z)));
  }
});

test('chase direction ignores airborne and fallen pursuers and rotates with the view',()=>{
  const player={x:0,z:0},agents=[{x:1,z:0,launch:{}},{x:2,z:0,stunUntil:10},{x:12,z:0}];
  assert.equal(chaseDirection(player,agents,0,1).label,'左侧');
  assert.equal(chaseDirection(player,agents,Math.PI/2,1).label,'前方');
  assert.equal(chaseDirection(player,agents,0,11).distance,2);
});

test('best ghosts are mode-specific and require an ordered uninterrupted run',()=>{
  const values=new Map(),store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const key=ghostKey('crystal','lucky-shot','free'),capture=()=>{const g=new RunGhost();g.sample(0,0,1,0);g.sample(1,10,3,20);return g;};
  const run=capture();
  run.advance(950,1200);
  assert.equal(run.save(store,key,2,100,'free'),false);
  for(let section=1;section<=11;section++)run.advance(section*100,1200);
  assert.equal(run.save(store,key,2,100,'free'),true);
  assert.equal(run.save(store,key,3,100,'free'),false);
  assert.equal(readGhost(store,ghostKey('crystal','lucky-shot','patrol')),null);
  assert.deepEqual(ghostPosition(readGhost(store,key),.5),{x:5,y:2,z:10});
  run.valid=false;
  assert.equal(run.save(store,key,1.5,100,'free'),false);
});
