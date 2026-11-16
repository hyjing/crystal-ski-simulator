import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapProjection} from '../src/minimap.js';
import {PatrolRun, PATROL_ITEMS, PATROL_ROUTE_ID, resolveChaseRoute, longestChaseRoute} from '../src/patrol-mode.js';
import {SkierKick} from '../src/kick.js';
import {SkiTraffic} from '../src/traffic.js';
import {MOUNTAINS, mountainAsset} from '../src/mountains.js';
import {createTerrain, getLiftRuns, pointAlongRoute} from '../src/terrain.js';
import {preparePisteTerrain} from '../src/pistes.js';
import {prepareStationTerrain} from '../src/stations.js';
import {liftExitSpawn} from '../src/resort.js';

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
test('an early chase tries offscreen alternatives and keeps trying if the view blocks all entries',()=>{
  const run=new PatrolRun(route,()=>true);
  const player=makePlayer(58);
  for(let i=0;i<30;i++)run.step(.5,player,()=>false);
  assert.equal(run.stars,1);
  assert.equal(run.agents.length,0);
  run.step(.5,player,p=>p.x>10);
  assert.equal(run.agents.length,1);
  assert.ok(run.agents[0].x>10&&run.agents[0].z<player.z);
});

test('a new chase starts after more downhill progress when a wave loses track',()=>{
  const run=new PatrolRun(route,()=>true);
  run.step(.1,makePlayer(100));
  assert.equal(run.stars,1);
  run.agents=[{x:160,z:100,speed:0,heading:0,bank:0}];
  run.spawnAfter=100;
  run.step(12.1,makePlayer(100),()=>false,()=>0,()=>true);
  assert.equal(run.stars,0);
  run.step(.1,makePlayer(180));
  assert.equal(run.stars,0);
  run.step(.1,makePlayer(200));
  assert.equal(run.stars,1);
});

test('airtime resets capture and a clean landing grants a brief grace period',()=>{
  const run=new PatrolRun(route,()=>false),player=makePlayer(100);
  run.stars=1;
  run.agents=[{x:0,z:98,heading:0,speed:0,bank:0}];
  run.contact=2;
  run.step(.1,{...player,airborne:true});
  assert.equal(run.captureRemaining,null);
  run.evadeLanding({type:'land',quality:'clean',airTime:.6});
  run.step(.3,player);
  assert.equal(run.captureRemaining,null);
  run.step(.1,player);
  assert.ok(run.captureRemaining>2.8);
});

test('stored charges pay for separate kicks and preserve an earlier target’s flight',()=>{
  const kick=new SkierKick(()=>0,()=>true),player=makePlayer(100);
  kick.reset([]);
  const landing={type:'land',quality:'clean',airTime:.6};
  const first={x:1,z:98},second={x:-1,z:98},eligible=()=>true;
  assert.equal(kick.chargeLanding({...landing,quality:'recover'}),0);
  assert.equal(kick.chargeLanding({...landing,airTime:.2}),0);
  assert.equal(kick.chargeLanding({...landing,grab:true}),2);
  assert.equal(kick.start(player,[]),false);
  assert.equal(kick.charge,2);
  assert.ok(kick.start(player,[first]));
  assert.equal(kick.charge,1);
  assert.equal(kick.cooldown,0);
  assert.equal(kick.start(player,[second]),false);
  assert.equal(kick.step(.17,player,eligible).target,first);
  kick.step(.42,player,eligible);
  assert.ok(kick.start(player,[second]));
  assert.equal(kick.charge,0);
  assert.equal(kick.cooldown,5);
  assert.equal(kick.step(.17,player,eligible).target,second);
  assert.ok(first.launch.progress<1&&second.launch.progress===0);
  const landings=[];
  kick.step(1.2,player,eligible,flight=>landings.push(flight));
  assert.deepEqual(landings,[first.launch,second.launch]);
  assert.equal(kick.chargeLanding(landing),1);
  assert.ok(kick.ready);
  assert.equal(kick.chargeLanding({...landing,rotation:180}),2);
  assert.equal(kick.chargeLanding(landing),0);
});

test('chase escalates at new sections, spawns behind, and catches a skier who stays in reach',()=>{
  const run=new PatrolRun(route,()=>true);
  run.step(.05,makePlayer(70));
  assert.equal(run.stars,1);
  for(const z of [800,1500,2200,2700])run.step(.05,makePlayer(z));
  assert.equal(run.peakStars,5);
  assert.ok(run.agents.every(agent=>agent.z<2700));
  run.agents=[{x:0,z:2700,speed:0,heading:0,bank:0}];
  const player={...makePlayer(2700),speed:0,vz:0};
  for(let i=0;i<283&&!run.outcome;i++){
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
  assert.deepEqual(run.inventory,['boost']);
  assert.ok(run.use(player));
  run.boost(player,.1);
  assert.ok(player.speed>20);
  assert.equal(run.use(player),false);
  assert.ok(p.taken);
  delete run.effects.boost;run.inventory.push('shield');run.contact=1;
  assert.ok(run.use(player));
  assert.equal(run.contact,0);
  run.agents.push({x:player.x,z:player.z,speed:0,heading:0,bank:0});
  run.step(.05,player);
  assert.equal(run.contact,0);
});

test('the Crystal pursuit itinerary is a long downhill route ending at Quicksilver',()=>{
  const read=name=>JSON.parse(fs.readFileSync(new URL(`../public/data/crystal-${name}.json`,import.meta.url)));
  const terrain=createTerrain(read('dem')), [r]=getLiftRuns(terrain,read('angry-skiers-run'));
  assert.equal(r.id,PATROL_ROUTE_ID);
  assert.equal(resolveChaseRoute('crystal-patrol-descent'),r.id);
  assert.equal(resolveChaseRoute('lucky-shot'),'lucky-shot');
  assert.ok(r.length>3000&&r.drop>600);
  assert.equal(r.returnLift,'Quicksilver');
  assert.ok(pointAlongRoute(r,1500).distance===1500);
});

test('snow pulse releases before a pursuer enters range and can overlap other items',()=>{
  const run=new PatrolRun(route,()=>true),player=makePlayer(100);
  run.inventory=['pulse','shield','boost'];
  assert.ok(run.use(player));
  assert.ok(run.use(player));
  assert.ok(run.use(player));
  assert.deepEqual(run.inventory,[]);
  assert.ok(run.effects.shield&&run.effects.boost);
  const close={x:0,z:93,speed:15,heading:0,bank:0};
  const far={x:0,z:70,speed:15,heading:0,bank:0};
  run.agents=[close,far];
  run.stars=1;
  run.step(.25,player,()=>false);
  assert.ok(close.z<91);
  assert.equal(far.stunUntil,undefined);
  const stun=close.stunUntil;
  run.step(.08,player,()=>false);
  assert.equal(close.stunUntil,stun);
  assert.equal(run.contact,0);
});

test('levelled buffs start immediately and repeated boosts extend their remaining time',()=>{
  const run=new PatrolRun(route,()=>true,()=>true,[],['boost','shield']),player=makePlayer(100);
  run.inventory=['boost','boost','shield','decoy'];
  assert.ok(run.use(player));
  assert.ok(run.use(player));
  assert.ok(run.use(player));
  assert.ok(run.use(player));
  assert.ok(Math.abs(run.effects.boost.until-2.7)<1e-8);
  assert.ok(Math.abs(run.effects.shield.until-2.5)<1e-8);
  assert.equal(run.effects.decoy.until,2.6);
});

test('boost delivers a short burst, then the shield repels pursuers and expires',()=>{
  const run=new PatrolRun(route,()=>true),player=makePlayer(100);
  run.inventory=['boost','shield'];
  run.stars=1;
  assert.ok(run.use(player));
  for(let i=0;i<110;i++){
    run.boost(player,.01);
    run.step(.01,player,()=>false);
  }
  assert.ok(player.speed>34);
  assert.deepEqual(run.effects,{});
  const speed=player.speed;
  run.boost(player,.1);
  assert.equal(player.speed,speed);
  const close={x:0,z:96,speed:10,heading:0,bank:0};
  run.agents=[close];
  run.contact=2;
  assert.ok(run.use(player));
  run.step(.15,player,()=>false);
  assert.ok(close.z<92);
  assert.equal(run.captureRemaining,null);
  run.step(PATROL_ITEMS.shield.duration,player,()=>false);
  assert.deepEqual(run.effects,{});
});

test('a nearby pursuer brakes hard for a decoy and resumes chasing as soon as it expires',()=>{
  const run=new PatrolRun(route,()=>false),player=makePlayer(100);
  run.inventory=['decoy'];run.stars=1;run.contact=1;
  const close={x:0,z:98,speed:25,heading:0,bank:0};
  run.agents=[close];
  assert.ok(run.use(player));
  run.step(.1,player);
  assert.ok(close.speed<3);
  assert.equal(run.captureRemaining,null);
  run.step(PATROL_ITEMS.decoy.duration,player);
  assert.deepEqual(run.effects,{});
  assert.ok(run.captureRemaining>0);
});


test('full health lasts eight uninterrupted seconds regardless of speed or patrol count',()=>{
  for(const speed of [0,20]){
    const run=new PatrolRun(route,()=>false,()=>false,[]);
    run.stars=1;
    run.agents=Array.from({length:3},()=>({x:0,z:95,heading:0,speed:0,bank:0}));
    const player={...makePlayer(100),speed};
    for(let i=0;i<239;i++)assert.equal(run.step(1/30,player),null);
    assert.ok(Math.abs(run.captureRemaining-1/30)<1e-9);
    assert.equal(run.step(1/30,player),'caught');
  }
});

test('leaving the five-meter range stops damage but keeps the previous health loss',()=>{
  const run=new PatrolRun(route,()=>false,()=>false,[]);
  const player=makePlayer(100);
  const agent={x:0,z:95,heading:0,speed:0,bank:0};
  run.stars=1;
  run.agents=[agent];
  for(let i=0;i<60;i++)run.step(1/30,player);
  assert.ok(Math.abs(run.captureRemaining-6)<1e-9);
  agent.z=94.9;
  run.step(1/30,player);
  assert.equal(run.captureRemaining,null);
  assert.ok(Math.abs(run.health-75)<1e-8);
  agent.z=95;
  for(let i=0;i<179;i++)assert.equal(run.step(1/30,player),null);
  assert.equal(run.step(1/30,player),'caught');
});

test('clean landings and medkits restore health, even with a full inventory',()=>{
  const run=new PatrolRun(route,()=>true,()=>true,[]);
  const kit=run.pickups.find(p=>p.type==='medkit');
  const player={...makePlayer(kit.z),x:kit.x};
  run.inventory=['boost','shield','banana'];
  assert.notEqual(run.step(.03,player),'medkit');
  assert.equal(kit.taken,false);
  run.health=34;
  assert.equal(run.evadeLanding({type:'land',quality:'clean',airTime:.5,grab:true}),20);
  assert.equal(run.step(.03,player),'medkit');
  assert.equal(run.health,89);
  assert.equal(run.inventory.length,3);
  assert.equal(run.heal(35),11);
  assert.equal(run.health,100);
});

test('upgraded banana casts two traps per item, can overlap and each expires or trips once',()=>{
  const player=makePlayer(100),run=new PatrolRun(route,()=>true,()=>true,[],['banana']);
  run.inventory=['banana','banana'];
  run.stars=1;
  assert.ok(run.use(player));
  assert.equal(run.traps.length,2);
  assert.notEqual(run.traps[0].x,run.traps[1].x);
  assert.ok(run.use({...player,z:115,airborne:true}));
  assert.equal(run.traps.length,4);
  const spot=run.traps[0];
  const pursuer={x:spot.x,z:spot.z-2.5,speed:18,heading:0,bank:0};
  run.agents=[pursuer];
  run.step(.1,player,()=>false);
  assert.equal(run.traps.length,3);
  assert.ok(pursuer.stunUntil>1.2);
  assert.equal(pursuer.health,55);
  run.agents=[];
  run.step(12.1,player,()=>false);
  assert.equal(run.traps.length,0);
});

test('the inventory holds three stacks, leaves overflow on the snow, and consumes one item',()=>{
  const run=new PatrolRun(route,()=>true);
  const fixed=run.pickups.filter(p=>p.type!=='supply'&&p.type!=='medkit');
  for(const p of fixed.slice(0,3)){
    assert.equal(run.step(.03,{...makePlayer(p.z),x:p.x}),'pickup');
  }
  assert.deepEqual(run.inventory,['boost','pulse','decoy']);
  const fourth=fixed[3],player={...makePlayer(fourth.z),x:fourth.x};
  assert.equal(run.step(.03,player),'pickup-full');
  assert.equal(run.step(.03,player),null);
  assert.equal(fourth.taken,false);
  const moreBoost={...fourth,type:'boost'};
  const anotherBoost={...moreBoost};
  const overflow={...moreBoost};
  run.pickups.push(moreBoost,anotherBoost,overflow);
  assert.equal(run.step(.03,player),'pickup');
  assert.equal(run.step(.03,player),'pickup');
  assert.equal(run.step(.03,player),'pickup-full');
  assert.equal(overflow.taken,false);
  assert.ok(run.use(player,0));
  assert.deepEqual(run.stacks.map(v=>v.count),[2,1,1]);
  assert.ok(run.use(player,2));
  assert.ok(run.effects.decoy);
  assert.equal(run.step(.03,player),'pickup');
  assert.deepEqual(run.stacks,[{type:'boost',count:2},{type:'pulse',count:1},{type:'shield',count:1}]);
});

test('a generated supply box tops up a partial stack even with all slots occupied',()=>{
  const run=new PatrolRun(route,()=>true);
  const supply=run.pickups.find(p=>p.type==='supply');
  assert.ok(supply.z<700);
  run.inventory=['shield','shield','banana','boost','boost','boost'];
  const player={...makePlayer(supply.z),x:supply.x};
  assert.equal(run.step(.03,player),'pickup');
  assert.equal(run.lastPickup,'banana');
  assert.equal(supply.taken,true);
  assert.deepEqual(run.stacks.map(({count})=>count),[2,2,3]);
  assert.equal(run.step(.03,player),null);
});

test('an avalanche is thrown immediately and detonates later around its landing point',()=>{
  const run=new PatrolRun(route,()=>true,()=>true,[],['avalanche']),player=makePlayer(100);
  const kick=new SkierKick(x=>x===5?40:0,()=>true);
  const pursuer={x:-6,z:88},visitor={point:{x:0,z:110}};
  const far={x:0,z:125},above={x:5,z:88};
  run.inventory=['avalanche','avalanche'];
  assert.ok(run.use(player));
  assert.ok(run.use({...player,airborne:true,airClearance:3}));
  assert.deepEqual(run.inventory,[]);
  assert.equal(run.bombs.length,2);
  assert.equal(run.bombs[1].height,3);
  const blasts=[];
  const detonate=blast=>{blasts.push(blast);return kick.avalanche(blast,[pursuer,visitor,far,above],blast.radius);};
  run.step(.3,player,()=>false,()=>0,()=>null,detonate);
  assert.equal(blasts.length,0);
  run.step(.13,player,()=>false,()=>0,()=>null,detonate);
  assert.equal(blasts.length,2);
  assert.equal(blasts[0].z,91);
  assert.equal(blasts[0].radius,29);
  assert.ok(pursuer.launch.end.x<pursuer.x-15);
  assert.ok(visitor.launch.end.z>visitor.point.z+12);
  assert.equal(far.launch,undefined);
  assert.equal(above.launch,undefined);
  const landings=[];
  kick.step(1.1,player,()=>false,flight=>landings.push(flight));
  assert.equal(landings.length,2);
  kick.step(.3,player,()=>false,flight=>landings.push(flight));
  assert.equal(landings.length,2);
  assert.ok(pursuer.launch.finished&&visitor.launch.finished);
});

test('high heat telegraphs a pursuer dash and mist cancels it and stops close damage',()=>{
  const run=new PatrolRun(route,()=>true,()=>false),player=makePlayer(100);
  const pursuer={x:0,z:85,speed:18,heading:0,bank:0};
  run.stars=3;run.agents=[pursuer];run.time=7;
  run.step(.05,player,()=>false);
  assert.equal(run.dash.agent,pursuer);
  assert.ok(run.dash.at-run.time>.8);
  run.step(.9,player,()=>false);
  assert.ok(pursuer.speed>28);
  const chargingSpeed=pursuer.speed;
  run.inventory=['mist'];
  assert.ok(run.use(player));
  pursuer.z=97;
  run.step(.05,player,()=>false);
  assert.equal(run.dash,null);
  assert.equal(run.health,100);
  assert.ok(pursuer.speed<chargingSpeed);
});

test('the quantity specialty throws two snowballs that slow pursuers without launching them',()=>{
  const run=new PatrolRun(route,()=>true,()=>false,[],['snowball']),player=makePlayer(100);
  const pursuer={x:3,z:86,speed:15,heading:0,bank:0};
  run.stars=1;
  run.agents=[pursuer];run.inventory=['snowball'];
  assert.ok(run.use(player));
  assert.equal(run.bombs.length,2);
  run.step(.3,player,()=>false);
  assert.equal(run.bombs.length,0);
  assert.ok(pursuer.slowUntil>2);
  assert.equal(pursuer.launch,undefined);
});

test('each additional ski area exposes its longest mapped run as a shareable chase',()=>{
  for(const id of Object.keys(MOUNTAINS).filter(id=>id!=='crystal')){
    const read=name=>JSON.parse(fs.readFileSync(new URL('../public/'+mountainAsset(id,name),import.meta.url)));
    const raw=createTerrain(read('dem.json')),data=read('lift-runs.json'),infrastructure=read('infrastructure.json');
    const terrain=prepareStationTerrain(preparePisteTerrain(raw,read('trail-network.json')),getLiftRuns(raw,data),infrastructure).terrain;
    const runs=getLiftRuns(terrain,data);
    const chase=longestChaseRoute(runs,id);
    assert.equal(chase.id,id+'-angry-skiers');
    assert.equal(chase.length,Math.max(...runs.map(r=>r.length)));
    assert.ok(chase.patrolOnly&&chase.length>1300&&chase.drop>200);
    assert.ok(runs.every(r=>!r.patrolOnly));
    chase.spawn=liftExitSpawn(terrain,chase,infrastructure);
    const run=new PatrolRun(chase,p=>Math.abs(p.x)<(terrain.width-1)*terrain.spacing/2-18&&
      Math.abs(p.z)<(terrain.height-1)*terrain.spacing/2-18);
    assert.ok(run.pickups.length>=3);
  }
});

test('the kick targets the closest regular snow visitor and uses the default cooldown',()=>{
  const kick=new SkierKick(()=>0,()=>true),player=makePlayer(100);
  const visitor={kind:'lodge',point:{x:0,z:99}},agent={x:0,z:98};
  const eligible=()=>true;
  assert.ok(kick.start(player,[agent,visitor]));
  assert.equal(kick.cooldown,5);
  assert.equal(kick.start(player,[agent]),false);
  assert.equal(kick.step(.1,player,eligible),null);
  assert.ok(kick.pose.amount>0);
  assert.equal(kick.step(.07,player,eligible).target,visitor);
  assert.equal(kick.step(.43,player,eligible),null);
  assert.ok(visitor.launch.height>3.5);
  assert.ok(visitor.launch.x>4&&visitor.launch.z<93);
  const landings=[];
  kick.step(.44,player,eligible,flight=>landings.push(flight));
  assert.deepEqual(landings,[visitor.launch]);
  assert.equal(visitor.launch.height,0);
  kick.step(4.2,player,eligible);
  assert.ok(visitor.launch.finished);
  assert.ok(kick.start(player,[agent,visitor]));
});

test('a kicked pursuer stops counting toward capture and is replaced offscreen',()=>{
  const run=new PatrolRun(route,()=>true,()=>false);
  const kick=new SkierKick(()=>0,()=>true);
  const player=makePlayer(100);
  const agent={x:0,z:98,heading:0,speed:0,bank:0,id:10};
  const other={x:0,z:60,heading:0,speed:0,bank:0,id:11};
  run.agents=[agent,other];
  run.spawnAfter=1.2;
  run.stars=1;
  run.contact=1;
  agent.health=55;
  assert.ok(kick.start(player,[agent,other]));
  const result=kick.step(.17,player,()=>true,()=>{},target=>run.kickHit(target,player)!=='down');
  assert.equal(result.type,'hit');
  assert.equal(agent.health,0);
  run.step(.17,player);
  assert.equal(run.captureRemaining,null);
  kick.step(.87,player,()=>true);
  run.step(.87,player);
  assert.ok(run.agents.includes(agent));
  kick.step(.23,player,()=>true);
  run.step(.23,player);
  assert.deepEqual(run.agents,[other]);
  run.step(1,player);
  assert.deepEqual(run.agents,[other]);
  run.step(.3,player,()=>false);
  assert.deepEqual(run.agents,[other]);
  run.step(.5,player);
  const replacement=run.agents.find(s=>s!==other);
  assert.ok(replacement&&replacement.id!==agent.id&&replacement.z<player.z-38);
  assert.equal(replacement.launch,undefined);
});

test('a finished regular NPC stays out of collision and returns only when away from the player and camera',()=>{
  const traffic=new SkiTraffic(null,{width:3,height:3,spacing:10,surface:()=>1200},[]);
  const state={point:{x:0,z:100},launch:{finished:true},speed:12};
  traffic.route=route;
  traffic.states=[state];
  traffic.step(.05,makePlayer(100));
  assert.ok(state.launch);
  assert.equal(traffic.collide(makePlayer(98),{...makePlayer(100),trafficGrace:0}),null);
  traffic.hasCamera=true;
  traffic.frustum.intersectsSphere=()=>true;
  traffic.step(.05,makePlayer(120));
  assert.ok(state.launch);
  traffic.frustum.intersectsSphere=()=>false;
  traffic.step(.05,makePlayer(120));
  assert.equal(state.launch,undefined);
  assert.equal(state.speed,0);
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

test('an armored pursuer telegraphs a guard, blocks one attack, and can then be knocked down',()=>{
  const run=new PatrolRun(route,()=>true),player=makePlayer(100);
  const pursuer={id:1,x:0,z:97,heading:0,speed:0,bank:0};
  run.agents=[pursuer];
  run.stars=2;
  run.step(.03,player,()=>false);
  assert.ok(pursuer.guardUntil>run.time);
  const kick=new SkierKick(()=>0,()=>true);
  assert.ok(kick.start(player,[pursuer]));
  const blocked=target=>run.kickHit(target,player)!=='down';
  assert.equal(kick.step(.17,player,()=>true,()=>{},blocked).type,'blocked');
  assert.equal(pursuer.health,undefined);
  assert.equal(pursuer.launch,undefined);
  assert.equal(run.guardBlocks,1);
  run.step(.03,player,()=>false);
  assert.equal(pursuer.guardUntil,0);
  assert.deepEqual(kick.avalanche(player,[pursuer],20,target=>run.damage(target,'avalanche',Infinity)!=='down'),new Set([pursuer]));
});

test('one guarded banana trip spends the trap without counting a knockdown',()=>{
  const run=new PatrolRun(route,()=>true),player=makePlayer(100);
  const pursuer={id:1,x:0,z:97,heading:0,speed:0,bank:0};
  run.agents=[pursuer];
  run.stars=2;
  run.traps=[{x:0,z:97,until:3}];
  run.step(.03,player,()=>false);
  assert.equal(run.traps.length,0);
  assert.equal(run.trips.length,0);
  assert.equal(run.guardBlocks,1);
  run.traps=[{x:0,z:97,until:3}];
  run.step(.03,player,()=>false);
  assert.equal(run.trips[0].agent,pursuer);
});

test('ordinary chase hits chip health and only the finishing hit earns a knockdown',()=>{
  const run=new PatrolRun(route,()=>true),player=makePlayer(100);
  const agent={x:0,z:98,speed:14,heading:0,bank:0};
  assert.equal(run.kickHit(agent,player),'hit');
  assert.equal(agent.health,45);
  assert.equal(agent.launch,undefined);
  assert.equal(run.damage(agent,'banana',PATROL_ITEMS.banana.damage),'down');
  assert.equal(agent.health,0);
  assert.ok(agent.downUntil>run.time);
  assert.equal(run.damage(agent,'pulse',PATROL_ITEMS.pulse.damage),'blocked');
  assert.deepEqual(run.hits.map(({damage,down})=>[damage,down]),[[55,false],[45,true]]);
});

test('an avalanche is a single rare pickup and normal supply boxes never refill it',()=>{
  const run=new PatrolRun(route,()=>true);
  const rare=run.pickups.filter(p=>p.type==='avalanche');
  assert.equal(rare.length,1);
  assert.ok(rare[0].z>route.length*.65);
  run.inventory=['avalanche','pulse','banana'];
  assert.equal(run.refillType('avalanche'),'pulse');
  run.inventory=['avalanche','pulse','pulse','pulse','banana','banana','banana'];
  assert.equal(run.refillType('avalanche'),undefined);
});

test('a lagging pursuer tucks on clear downhill terrain and slows for flat terrain',()=>{
  const run=new PatrolRun(route,()=>true);
  const agent={x:0,z:130,speed:22,heading:0,bank:0,id:0};
  const player={...makePlayer(200),speed:29,vz:29};
  run.agents=[agent];
  run.stars=1;
  for(let i=0;i<24;i++)run.step(1/30,player,()=>false,(x,z)=>-z*.25);
  assert.equal(agent.tucking,true);
  assert.ok(agent.speed>player.speed+3);
  run.step(1/30,player,()=>false,()=>0);
  assert.equal(agent.tucking,false);
});

test('pursuers left well behind retire and reinforcements appear offscreen without teleporting',()=>{
  const run=new PatrolRun(route,()=>true);
  const old={x:0,z:250,speed:10,heading:0,bank:0,id:25};
  const player=makePlayer(500);
  run.agents=[old];run.stars=3;
  run.step(.05,player,()=>false);
  assert.ok(run.agents.includes(old));
  run.step(.05,player);
  assert.equal(run.agents.length,0);
  run.step(.67,player);
  assert.equal(run.agents.length,1);
  assert.notEqual(run.agents[0],old);
  assert.ok(player.z-run.agents[0].z>25);
});
