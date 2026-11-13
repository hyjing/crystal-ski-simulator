import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapProjection} from '../src/minimap.js';
import {PatrolRun, PATROL_ROUTE_ID} from '../src/patrol-mode.js';
import {createTerrain, getLiftRuns, pointAlongRoute} from '../src/terrain.js';

test('heading-up map points towards the camera and north-up keeps west to the left',()=>{
  const center={x:100,z:300};
  const east=mapProjection(420,315,center,Math.PI/2,600);
  const ahead=east.point({x:200,z:300});
  assert.ok(Math.abs(ahead.x-210)<1e-8);
  assert.ok(ahead.y<157.5);
  const north=mapProjection(420,315,center,Math.PI,600);
  assert.ok(north.point({x:0,z:300}).x<210);
  assert.ok(north.point({x:100,z:200}).y<157.5);
});

const route={points:[{x:0,z:0},{x:0,z:3200}],length:3200,spawn:{distance:35}};
const makePlayer=(z)=>({x:0,z,heading:0,speed:20,vx:0,vz:20});
test('chase escalates at new sections, spawns behind, and catches a skier who stays in reach',()=>{
  const run=new PatrolRun(route,()=>true);
  run.step(.05,makePlayer(70));
  assert.equal(run.stars,1);
  for(const z of [800,1500,2200,2700])run.step(.05,makePlayer(z));
  assert.equal(run.peakStars,5);
  assert.ok(run.agents.every(agent=>agent.z<2700));
  run.agents=[{x:0,z:2700,speed:0,heading:0,bank:0}];
  const player={...makePlayer(2700),speed:0,vz:0};
  for(let i=0;i<50&&!run.outcome;i++){
    run.agents[0].x=player.x;
    run.agents[0].z=player.z;
    run.step(1/30,player);
  }
  assert.equal(run.outcome,'caught');
});

test('pickups are one-use, boost increases speed, and shield stops capture progress',()=>{
  const run=new PatrolRun(route,()=>true),p=run.pickups[0];
  const player={...makePlayer(p.z),x:p.x};
  assert.equal(run.step(.03,player),'pickup');
  assert.equal(run.item,'boost');
  assert.ok(run.use(player));
  run.boost(player,.1);
  assert.ok(player.speed>20);
  assert.equal(run.use(player),false);
  assert.ok(p.taken);
  run.effect=null;run.item='shield';run.contact=1;
  assert.ok(run.use(player));
  assert.equal(run.contact,0);
  run.agents.push({x:player.x,z:player.z,speed:0,heading:0,bank:0});
  run.step(.05,player);
  assert.equal(run.contact,0);
});

test('the Crystal pursuit itinerary is a long downhill route ending at Quicksilver',()=>{
  const read=name=>JSON.parse(fs.readFileSync(new URL(`../public/data/crystal-${name}.json`,import.meta.url)));
  const terrain=createTerrain(read('dem')), [r]=getLiftRuns(terrain,read('patrol-run'));
  assert.equal(r.id,PATROL_ROUTE_ID);
  assert.ok(r.length>3000&&r.drop>600);
  assert.equal(r.returnLift,'Quicksilver');
  assert.ok(pointAlongRoute(r,1500).distance===1500);
});
