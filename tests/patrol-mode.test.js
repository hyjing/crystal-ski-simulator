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
  for(let i=0;i<90&&!run.outcome;i++){
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

test('snow pulse is kept out of range, pushes away nearby patrol, and interrupts capture',()=>{
  const run=new PatrolRun(route,()=>true),player=makePlayer(100);
  run.item='pulse';
  run.contact=1;
  assert.equal(run.use(player),false);
  assert.equal(run.item,'pulse');
  const close={x:0,z:96,speed:15,heading:0,bank:0};
  const far={x:0,z:74,speed:15,heading:0,bank:0};
  run.agents=[close,far];
  run.stars=1;
  assert.equal(run.use(player),true);
  assert.equal(run.contact,0);
  assert.equal(run.item,null);
  assert.ok(close.stunUntil>2);
  assert.equal(far.stunUntil,undefined);
  run.step(.1,player);
  assert.ok(close.z<95);
  assert.ok(far.z>74);
  assert.equal(run.contact,0);
});


test('capture takes three uninterrupted seconds regardless of speed or patrol count',()=>{
  for(const speed of [0,20]){
    const run=new PatrolRun(route,()=>false);
    run.stars=1;
    run.agents=Array.from({length:3},()=>({x:0,z:95,heading:0,speed:0,bank:0}));
    const player={...makePlayer(100),speed};
    for(let i=0;i<89;i++)assert.equal(run.step(1/30,player),null);
    assert.ok(Math.abs(run.captureRemaining-1/30)<1e-9);
    assert.equal(run.step(1/30,player),'caught');
  }
});

test('leaving the five-meter range resets the countdown before re-entry',()=>{
  const run=new PatrolRun(route,()=>false);
  const player=makePlayer(100);
  const agent={x:0,z:95,heading:0,speed:0,bank:0};
  run.stars=1;
  run.agents=[agent];
  for(let i=0;i<60;i++)run.step(1/30,player);
  assert.ok(Math.abs(run.captureRemaining-1)<1e-9);
  agent.z=94.9;
  run.step(1/30,player);
  assert.equal(run.captureRemaining,null);
  agent.z=95;
  for(let i=0;i<89;i++)assert.equal(run.step(1/30,player),null);
  assert.equal(run.step(1/30,player),'caught');
});

test('a close kick resolves after its windup, interrupts capture and has a five-second cooldown',()=>{
  const run=new PatrolRun(route,()=>false);
  const player=makePlayer(100),agent={x:0,z:98,heading:0,speed:0,bank:0};
  run.agents=[agent];run.stars=1;run.contact=1;
  assert.ok(run.startKick(player));
  assert.equal(run.kickCooldown,5);
  assert.equal(run.startKick(player),false);
  run.step(.10,player);
  assert.ok(run.kickPose.amount>0);
  assert.equal(agent.stunUntil,undefined);
  run.step(.07,player);
  assert.ok(agent.stunUntil>run.time);
  assert.ok(run.kick.hit);
  assert.equal(run.contact,0);
  assert.equal(run.startKick(player),false);
  run.time=5.01;
  assert.ok(run.startKick(player));
});

test('patrol steering is radius limited and collisions interrupt the capture countdown',()=>{
  const run=new PatrolRun(route,()=>true);
  const agent={x:0,z:97,heading:0,speed:20,bank:0};
  run.agents=[agent];run.stars=1;run.contact=2.8;
  const player={...makePlayer(98),x:2};
  run.step(1/30,player,()=>false);
  assert.ok(Math.abs(agent.heading)<=1.6/30);
  const before={x:agent.x,z:agent.z};
  run.step(1/30,player,()=>false,()=>0,()=> 'tree');
  assert.deepEqual({x:agent.x,z:agent.z},before);
  assert.ok(agent.fallDuration>1);
  assert.equal(agent.speed,0);
  assert.equal(run.contact,0);
  assert.equal(run.outcome,'');
});
