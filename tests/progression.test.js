import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_TALENTS,RunExperience,levelProgress,readProgress,saveProgress} from '../src/progression.js';
import {PatrolRun} from '../src/patrol-mode.js';
import {SkierKick} from '../src/kick.js';

const route={points:[{x:0,z:0},{x:0,z:3200}],length:3200,spawn:{distance:35}};
const player={x:0,z:100,heading:0,speed:0,vx:0,vz:0};

test('clean landings and escapes earn capped XP and a run only settles once',()=>{
  const profile={xp:0,talents:[...DEFAULT_TALENTS]},run=new RunExperience();
  run.landing({type:'land',quality:'recover',airTime:1,grab:true});
  assert.equal(run.landingXP,0);
  for(let i=0;i<10;i++){
    run.landing({type:'land',quality:'clean',airTime:.7,grab:true});
    run.escape();
  }
  assert.equal(run.settle(profile,true,true),64);
  assert.equal(run.settle(profile,true,true),0);
  assert.deepEqual(levelProgress(profile.xp),{level:2,xp:4,needed:80});
  assert.equal(new RunExperience().settle(profile,false,true),0);
});

test('new profiles and legacy saves enable all talents while explicit choices persist',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.deepEqual(readProgress(null),{xp:0,talents:DEFAULT_TALENTS});
  saveProgress(storage,{xp:120,talent:'agility'});
  assert.deepEqual(readProgress(storage),{xp:120,talents:DEFAULT_TALENTS});
  saveProgress(storage,{xp:59,talents:['recovery','unknown','recovery']});
  assert.deepEqual(readProgress(storage),{xp:59,talents:['recovery']});
  saveProgress(storage,{xp:59,talents:[]});
  assert.deepEqual(readProgress(storage),{xp:59,talents:[]});
});

test('selected talents affect damage, medkit healing, and the next run kick cooldown',()=>{
  const run=new PatrolRun(route,()=>false,()=>false);
  run.agents=[{x:0,z:96,heading:0,speed:0,bank:0}];
  run.stars=1;
  run.step(.8,player);
  assert.equal(run.health,91.5);
  run.step(.5,{...player,airborne:true});
  assert.equal(run.escapes,0);
  run.step(.2,{...player,z:120});
  assert.equal(run.escapes,1);
  run.step(.2,{...player,z:120});
  assert.equal(run.escapes,1);
  const recovery=new PatrolRun(route,()=>true,()=>false);
  const kit=recovery.pickups.find(p=>p.type==='medkit');
  recovery.health=30;
  assert.equal(recovery.step(.1,{...player,x:kit.x,z:kit.z}),'medkit');
  assert.equal(recovery.health,75);
  const kick=new SkierKick(()=>0,()=>true);
  assert.ok(kick.start(player,[{x:0,z:98}]));
  assert.equal(kick.cooldown,4.25);
});
