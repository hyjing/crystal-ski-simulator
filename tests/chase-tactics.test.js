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
