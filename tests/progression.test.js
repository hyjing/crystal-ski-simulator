import test from 'node:test';
import assert from 'node:assert/strict';
import {RunExperience,levelProgress,readProgress,saveProgress,chooseUpgrade,upgradePoints,buyItem,itemStacks} from '../src/progression.js';
import {PatrolRun} from '../src/patrol-mode.js';
import {SkierKick} from '../src/kick.js';

const route={points:[{x:0,z:0},{x:0,z:3200}],length:3200,spawn:{distance:35}};
const player={x:0,z:100,heading:0,speed:0,vx:0,vz:0};

test('clean landings and escapes earn capped XP and a run only settles once',()=>{
  const profile=readProgress(null),run=new RunExperience();
  run.landing({type:'land',quality:'recover',airTime:1,grab:true});
  assert.equal(run.landingXP,0);
  for(let i=0;i<10;i++){
    run.landing({type:'land',quality:'clean',airTime:.7,grab:true});
    run.escape();
  }
  const target={};
  assert.ok(run.knockdown(target));
  assert.equal(run.knockdown(target),false);
  assert.ok(run.knockdown({}));
  assert.deepEqual(run.settle(profile,true,true),{xp:80,coins:32,knockdowns:2});
  assert.deepEqual(run.settle(profile,true,true),{xp:0,coins:0,knockdowns:0});
  assert.deepEqual(levelProgress(profile.xp),{level:2,xp:20,needed:80});
  const caught=new RunExperience();
  caught.knockdown({});
  assert.deepEqual(caught.settle(profile,false,true),{xp:8,coins:6,knockdowns:1});
});

test('level points each buy one unique attribute or item upgrade and legacy XP is preserved',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const fresh=readProgress(null);
  assert.equal(chooseUpgrade(fresh,'agility'),false);
  saveProgress(storage,{xp:120,talents:['recovery','agility','stamina']});
  const profile=readProgress(storage);
  assert.deepEqual(profile,{xp:120,coins:0,upgrades:[],supplies:[]});
  assert.equal(upgradePoints(profile),1);
  assert.ok(chooseUpgrade(profile,'banana'));
  assert.equal(chooseUpgrade(profile,'recovery'),false);
  profile.xp=140;
  assert.equal(chooseUpgrade(profile,'banana'),false);
  assert.ok(chooseUpgrade(profile,'recovery'));
  saveProgress(storage,profile);
  assert.deepEqual(readProgress(storage).upgrades,['banana','recovery']);
});

test('shop checks price and persists three stacks of up to three consumables',()=>{
  const profile=readProgress(null);
  profile.coins=50;
  assert.equal(buyItem(profile,'no-such-item'),false);
  assert.ok(buyItem(profile,'avalanche'));
  assert.ok(buyItem(profile,'banana'));
  assert.equal(buyItem(profile,'shield'),false);
  assert.ok(buyItem(profile,'boost'));
  assert.equal(profile.coins,2);
  profile.coins=100;
  assert.equal(buyItem(profile,'shield'),false);
  assert.ok(buyItem(profile,'banana'));
  assert.ok(buyItem(profile,'banana'));
  assert.equal(buyItem(profile,'banana'),false);
  assert.equal(profile.coins,76);
  let data;
  const storage={getItem:()=>data,setItem:(key,value)=>{data=value;}};
  saveProgress(storage,profile);
  assert.deepEqual(itemStacks(readProgress(storage).supplies),[
    {type:'avalanche',count:1},{type:'banana',count:3},{type:'boost',count:1},
  ]);
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
  const recovery=new PatrolRun(route,()=>true,()=>false,['recovery']);
  const kit=recovery.pickups.find(p=>p.type==='medkit');
  recovery.health=30;
  assert.equal(recovery.step(.1,{...player,x:kit.x,z:kit.z}),'medkit');
  assert.equal(recovery.health,75);
  const kick=new SkierKick(()=>0,()=>true);
  kick.reset(['agility']);
  assert.ok(kick.start(player,[{x:0,z:98}]));
  assert.equal(kick.cooldown,4.25);
});
