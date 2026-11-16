import test from 'node:test';
import assert from 'node:assert/strict';
import {createChaseMountain} from '../src/chase-mountain.js';
import {ChaseGoal,chaseGoal} from '../src/chase-goals.js';
import {PatrolRun} from '../src/patrol-mode.js';
import {RunExperience,readProgress} from '../src/progression.js';
import {pointAlongRoute} from '../src/terrain.js';

const simple={points:[{x:0,z:0},{x:0,z:3200}],length:3200,spawn:{distance:35}};
const makePlayer=(x,z)=>({x,z,heading:0,speed:31,vx:0,vz:31});
const {routes,terrain}=createChaseMountain();
const pine=routes.find(route=>route.id==='pine-switchbacks');

test('Pine has signed choices with shorter cuts and a longer aid route',()=>{
  assert.equal(pine.branches.length,3);
  const run=new PatrolRun(pine,()=>true);
  for(const branch of pine.branches){
    const length=branch.points.slice(1).reduce((total,p,i)=>total+Math.hypot(p.x-branch.points[i].x,p.z-branch.points[i].z),0);
    if(branch.kind==='shortcut'){
      assert.ok(length<branch.hi-branch.lo);
      assert.equal(branch.medkit,null);
    }else{
      assert.ok(length>branch.hi-branch.lo&&run.pickups.includes(branch.medkit));
    }
  }
  const [first,,last]=pine.branches;
  run.updateShortcuts(pointAlongRoute(pine,(first.lo+first.hi)/2),terrain.surface);
  assert.equal(run.shortcuts.size,0);
  run.branchSample=null;
  const racer={x:first.gate.x,z:first.gate.z+8,id:0,tucking:true};
  run.agents=[racer];
  run.updateShortcuts(first.gate,terrain.surface);
  assert.equal(racer.tucking,false);
  assert.ok(racer.shortcutDelayUntil>run.time);
  run.branchSample=null;
  run.updateShortcuts(last.gate,terrain.surface);
  assert.equal(run.goal.status(run).complete,true);
  const experience=new RunExperience(),profile=readProgress(null);
  assert.equal(experience.settle(profile,true,true,run.goal.reward(run,true)).coins,42);
  assert.equal(experience.settle(profile,true,true,run.goal.reward(run,true)).coins,0);
});

test('at high heat a named fork warns before a scout joins',()=>{
  const run=new PatrolRun(pine,()=>true);
  const branch=pine.branches.at(-1),progress=branch.lo-100;
  const p=pointAlongRoute(pine,progress),player=makePlayer(p.x,p.z);
  run.stars=3;
  run.updateIntercept(progress,player,()=>false);
  assert.equal(run.intercept.branch,branch);
  assert.equal(run.agents.length,0);
  run.time=run.intercept.at-.05;
  run.updateIntercept(progress,player,()=>false);
  assert.equal(run.agents.length,0);
  run.time+=.1;
  run.updateIntercept(progress,player,()=>false);
  assert.equal(run.agents[0].role,'scout');
  assert.equal(run.intercept,null);
  run.updateIntercept(progress,player,()=>false);
  assert.equal(run.intercept,null);
});

test('a pulse can push a pursuer into a trap, and a glider landing can finish a second target',()=>{
  const run=new PatrolRun(simple,()=>true);
  const player=makePlayer(0,100);
  const target={x:0,z:94,heading:0,speed:15,bank:0,id:0,health:75};
  run.agents=[target];run.stars=1;run.inventory=['pulse'];
  run.traps=[{x:0,z:90,until:4}];
  assert.ok(run.use(player));
  run.step(.25,player,()=>false);
  assert.equal(target.health,0);
  assert.equal(run.trips[0].combo,true);
  assert.deepEqual(run.hits.map(({source})=>source),['pulse','banana']);
  const nearby={x:5,z:102,heading:0,speed:10,bank:0,health:12};
  run.agents.push(nearby);
  run.evadeLanding({type:'land',quality:'clean',airTime:1,glider:true},player);
  assert.equal(nearby.health,0);
  assert.equal(run.hits.at(-1).source,'glider');
});

test('each Whitepeak route has its own finish bonus, including streak and cargo conditions',()=>{
  assert.equal(new Set(routes.map(route=>route.goal.key)).size,6);
  const run={shortcuts:new Set(),escapes:0,health:86,inventory:[],stars:1,contact:0};
  const config=id=>chaseGoal({id});
  const park=new ChaseGoal(config('skyline-park'));
  const clean={type:'land',quality:'clean',airTime:.6};
  park.landing(clean);park.landing({type:'crash'});park.landing(clean);
  assert.equal(park.reward(run,true),0);
  park.landing(clean);
  assert.equal(park.reward(run,true),24);
  assert.equal(park.reward(run,false),0);
  const wind=new ChaseGoal(config('windward-bowl'));
  wind.step(2.8,{speed:31},run);wind.step(.3,{speed:27},run);
  assert.equal(wind.reward(run,true),0);
  wind.step(3,{speed:31},run);
  assert.equal(wind.reward(run,true),18);
  assert.equal(new ChaseGoal(config('blueglass-traverse')).reward(run,true),18);
  run.escapes=2;
  assert.equal(new ChaseGoal(config('frost-chute')).reward(run,true),22);
  const cargo=new ChaseGoal(config('split-basin'));
  run.inventory=['avalanche'];
  assert.equal(cargo.reward(run,true),0);
  run.shortcuts.add({});
  assert.equal(cargo.reward(run,true),28);
  run.inventory=[];
  assert.equal(cargo.reward(run,true),0);
});

test('reinforcements alternate rear and both flanks and only use clear offscreen entries',()=>{
 const run=new PatrolRun(simple,()=>true),player={x:0,z:600,heading:0,speed:20,vx:0,vz:20};
 const points=[];
 for(let i=0;i<3;i++){
  run.nextAgent=i;
  points.push(run.reinforcement(player,600,()=>true,()=>0));
 }
 assert.deepEqual(points.map(p=>p.approach),['rear','left','right']);
 assert.ok(points.every(p=>p.z<555));
 assert.ok(points[1].x< -25&&points[2].x>25);
 assert.ok(points[1].heading>0&&points[2].heading<0);
 run.nextAgent=1;
 assert.equal(run.reinforcement(player,600,p=>p.x>25,()=>0).approach,'right');
 assert.equal(run.reinforcement(player,600,()=>false,()=>0),undefined);
});

test('a sprinter charges at two stars and a cutter telegraphs a fixed intercept that shields cancel',()=>{
 const player={x:0,z:600,heading:0,speed:20,vx:0,vz:20};
 const sprinter={x:0,z:580,heading:0,speed:15,bank:0,role:'sprinter'};
 const rearRun=new PatrolRun(simple,()=>true);
 rearRun.agents=[sprinter];rearRun.stars=2;rearRun.nextDash=0;
 rearRun.step(.02,player,()=>false);
 assert.equal(rearRun.dash.kind,'sprint');
 const start=rearRun.dash.at;
 while(rearRun.time<start+.34)rearRun.step(.04,player,()=>false);
 assert.ok(sprinter.speed>28);
 const cutter={x:-15,z:590,heading:0,speed:17,bank:0,role:'cutter'};
 const sideRun=new PatrolRun(simple,()=>true);
 sideRun.agents=[cutter];sideRun.stars=3;sideRun.nextDash=0;
 sideRun.step(.02,player,()=>false);
 assert.equal(sideRun.dash.kind,'cut');
 assert.equal(sideRun.dash.agent,cutter);
 assert.ok(sideRun.dash.point.z>player.z+9);
 const gate=sideRun.dash.point;
 sideRun.step(.2,{...player,x:9},()=>false);
 assert.equal(sideRun.dash.point,gate);
 sideRun.inventory=['shield'];
 assert.ok(sideRun.use(player));
 sideRun.step(.02,player,()=>false);
 assert.equal(sideRun.dash,null);
});

test('the laser telegraphs its aim, can miss, and an active shield returns the beam to its shooter',()=>{
 const player={x:0,z:600,heading:0,speed:20,vx:0,vz:20};
 const setup=(mounted=false)=>{
  const run=new PatrolRun(simple,()=>true,()=>false),agent={x:0,z:573,heading:0,speed:18,bank:0,role:'laser',health:35};
  if(mounted)Object.assign(agent,{mount:'plane',flightY:12});
  run.stars=4;run.nextDash=0;run.agents=[agent];
  run.step(.05,player,()=>false);
  assert.equal(run.dash?.kind,'laser');
  assert.equal(run.shots.length,0);
  assert.ok(run.dash.point.z>player.z);
  return {run,agent};
 };
 const direct=setup();
 direct.run.step(1.06,{...player,z:620},()=>false);
 assert.equal(direct.run.health,86);
 assert.equal(direct.run.shots[0].kind,'laser');
 const dodged=setup();
 dodged.run.step(1.06,{...player,x:6,z:620},()=>false);
 assert.equal(dodged.run.health,100);
 assert.equal(dodged.run.shots[0].result,'miss');
 const reflected=setup(true);
 reflected.run.inventory=['shield'];
 assert.ok(reflected.run.use(player));
 reflected.run.step(1.06,{...player,z:620},()=>false);
 assert.equal(reflected.run.health,100);
 assert.equal(reflected.agent.health,0);
 assert.deepEqual(reflected.run.shots.map(shot=>shot.kind),['laser','reflection']);
 assert.equal(reflected.run.hits[0].combo,'激光反射');
 assert.equal(reflected.run.shots[1].end.z,reflected.run.shots[0].z);
 assert.ok(reflected.run.shots[1].end.y>10);
 reflected.run.step(.1,{...player,z:622},()=>false);
 assert.equal(reflected.run.hits.length,1);
});

test('ice causes a ground-only skid, snowballs impact their marked point, and escort shields break on separation',()=>{
 const player={x:0,z:600,heading:0,speed:20,vx:0,vz:20};
 const runFor=(role,agent)=>{
  const run=new PatrolRun(simple,()=>true);
  run.stars=3;run.nextDash=0;
  run.agents=[{x:-12,z:582,heading:0,speed:0,bank:0,role},...(agent?[agent]:[])];
  run.step(.05,player,()=>false);
  assert.equal(run.dash?.kind,role);
  return run;
 };
 const icy=runFor('ice'),icePoint=icy.dash.point;
 icy.step(.91,player,()=>false);
 assert.ok(icy.enemyIce[0].segments.length>=3);
 icy.step(.04,{...player,...icePoint,airborne:true,airClearance:2},()=>false);
 assert.equal(icy.traction,1);
 icy.step(.04,{...player,...icePoint},()=>false);
 assert.ok(icy.traction<1);
 const snowy=runFor('snowball'),snowPoint=snowy.dash.point;
 snowy.step(.66,player,()=>false);
 assert.ok(!snowy.snowballs[0].resolved);
 snowy.step(.43,{...player,...snowPoint},()=>false);
 assert.equal(snowy.health,95);
 const moving={...player};
 snowy.boost(moving,.2);
 assert.ok(moving.speed<20);
 const teammate={x:-6,z:588,heading:0,speed:0,bank:0,role:'guard',guardUsed:true};
 const escorted=runFor('escort',teammate);
 escorted.step(.66,player,()=>false);
 assert.equal(teammate.escort,escorted.agents[0]);
 assert.ok(teammate.guardUntil>escorted.time);
 escorted.agents[0].x=-75;
 escorted.step(.04,player,()=>false);
 assert.equal(teammate.guardUntil,0);
 assert.equal(teammate.escort,null);
});

test('a plane occupies one pursuer slot, stays above the slope, and poses no ground capture threat',()=>{
 const player={x:0,z:600,heading:0,speed:20,vx:0,vz:20};
 const run=new PatrolRun(simple,()=>true),ground=(x,z)=>x*.3-z*.14;
 run.furthest=700;run.stars=4;run.nextAgent=4;
 run.step(.04,player,point=>point.flightY>ground(point.x,point.z)+8,ground);
 const plane=run.agents[0];
 assert.equal(run.agents.length,1);
 assert.equal(plane?.mount,'plane');
 assert.ok(plane.flightY>=ground(plane.x,plane.z)+7);
 assert.equal(run.damage(plane,'pulse',45),'blocked');
 assert.equal(run.damage(plane,'autofrost',15),'hit');
 Object.assign(plane,{x:player.x,z:player.z});
 run.step(.04,player,()=>false,ground,()=>assert.fail('a plane must not run ground collision checks'));
 assert.equal(run.health,100);
 assert.equal(run.contact,0);
 assert.ok(plane.flightY>=ground(plane.x,plane.z)+7);
});
