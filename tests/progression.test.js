import test from 'node:test';
import assert from 'node:assert/strict';
import {RunExperience,levelProgress,readProgress,saveProgress,chooseUpgrade,upgradePoints,upgradeRank,buyItem,itemStacks,shopStock} from '../src/progression.js';
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

test('repeated upgrades charge one point at increasing XP thresholds and stop at rank three',()=>{
  const profile=readProgress(null);
  assert.equal(chooseUpgrade(profile,'banana'),false);
  const thresholds=[60,140,240];
  for(const [index,xp] of thresholds.entries()){
    profile.xp=xp-1;
    assert.equal(chooseUpgrade(profile,'banana'),false);
    assert.equal(levelProgress(profile.xp).needed,60+index*20);
    profile.xp=xp;
    assert.ok(chooseUpgrade(profile,'banana'));
    assert.equal(upgradeRank(profile.upgrades,'banana'),index+1);
    assert.equal(upgradePoints(profile),0);
  }
  profile.xp=360;
  assert.equal(chooseUpgrade(profile,'banana'),false);
  assert.equal(upgradePoints(profile),1);
  assert.ok(chooseUpgrade(profile,'recovery'));
});

test('saved one-time upgrades become rank one and repeat ranks survive reload within budget',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  saveProgress(storage,{xp:120,talents:['recovery','agility','stamina']});
  assert.deepEqual(readProgress(storage),{xp:120,coins:0,upgrades:[],supplies:[]});
  saveProgress(storage,{xp:240,coins:80,upgrades:['banana'],supplies:['banana']});
  const profile=readProgress(storage);
  assert.equal(upgradeRank(profile.upgrades,'banana'),1);
  assert.ok(chooseUpgrade(profile,'banana'));
  saveProgress(storage,profile);
  assert.deepEqual(readProgress(storage),{xp:240,coins:80,upgrades:['banana','banana'],supplies:['banana']});
  saveProgress(storage,{xp:360,upgrades:['bogus','banana','banana','banana','banana','recovery','agility']});
  assert.deepEqual(readProgress(storage).upgrades,['banana','banana','banana','recovery']);
});

test('shop checks price and persists three stacks of up to three consumables',()=>{
  const profile=readProgress(null);
  profile.coins=80;
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


test('higher ranks reach item counts, area, duration, and attribute effects in the run',()=>{
  const upgrades=[
    'banana','banana','banana','crew','crew','crew','pulse','pulse','pulse',
    'mist','mist','mist','stamina','stamina','recovery','recovery','agility','agility','agility',
  ];
  const run=new PatrolRun(route,()=>true,()=>true,upgrades,upgrades);
  const caster={...player,speed:24,vz:24};
  const use=type=>{run.inventory=[type];assert.ok(run.use(caster));};
  use('banana');
  assert.equal(run.traps.length,4);
  assert.equal(new Set(run.traps.map(trap=>trap.z)).size,4);
  use('crew');
  assert.equal(run.allies.length,4);
  assert.ok(run.allies.every(ally=>ally.until===7));
  use('pulse');
  assert.equal(run.waves[0].radius,37);
  assert.equal(run.waves[0].duration,.62);
  assert.equal(run.waves[0].damage,66);
  use('mist');
  assert.equal(run.effects.mist.duration,7);
  assert.equal(run.effects.mist.radius,23);
  assert.equal(run.damageRate,9.375);
  assert.equal(run.medkitHeal,55);
  const kick=new SkierKick(()=>0,()=>true);
  kick.reset(upgrades);
  assert.equal(kick.baseCooldown,2.75);
});

test('bulk purchases stack in a full three-kind loadout and reject over-budget orders atomically',()=>{
  const profile={coins:24,supplies:['shield','boost','banana']};
  assert.deepEqual(shopStock(profile,'banana'),{room:2,affordable:2,max:2});
  assert.equal(shopStock(profile,'pulse').room,0);
  for(const blocked of [0,1.5,3]){
    assert.equal(buyItem(profile,'banana',blocked),false);
    assert.deepEqual(profile,{coins:24,supplies:['shield','boost','banana']});
  }
  assert.ok(buyItem(profile,'banana',2));
  assert.equal(profile.coins,0);
  assert.deepEqual(itemStacks(profile.supplies),[
    {type:'shield',count:1},{type:'boost',count:1},{type:'banana',count:3},
  ]);
  profile.coins=100;
  assert.equal(buyItem(profile,'banana'),false);
  assert.equal(buyItem(profile,'pulse'),false);
});


test('retired supplies refund their purchase price and retired ranks return their points',()=>{
  let value;
  const storage={getItem:()=>value,setItem:(key,next)=>{value=next;}};
  saveProgress(storage,{xp:240,coins:20,upgrades:['decoy','boost','snowball'],supplies:['decoy','snowball','shield','decoy']});
  const profile=readProgress(storage);
  assert.deepEqual(profile,{xp:240,coins:62,upgrades:['boost'],supplies:['shield']});
  assert.equal(upgradePoints(profile),2);
  assert.equal(buyItem(profile,'snowball'),false);
  saveProgress(storage,profile);
  assert.deepEqual(readProgress(storage),profile);
});

test('passive branches require their root and preserve old ranks while refunding old stock',()=>{
 const profile={xp:360,coins:0,upgrades:[],supplies:[]};
 assert.equal(chooseUpgrade(profile,'autofrost'),false);
 assert.ok(chooseUpgrade(profile,'stamina'));
 assert.ok(chooseUpgrade(profile,'autofrost'));
 assert.equal(chooseUpgrade(profile,'frosttrail'),false);
 assert.ok(chooseUpgrade(profile,'agility'));
 assert.ok(chooseUpgrade(profile,'frosttrail'));
 let value;
 const storage={getItem:()=>value,setItem:(_,next)=>{value=next;}};
 saveProgress(storage,{xp:140,coins:7,upgrades:['autofrost'],supplies:['frosttrail','autofrost','shield']});
 const legacy=readProgress(storage);
 assert.deepEqual(legacy,{xp:140,coins:47,upgrades:['autofrost'],supplies:['shield']});
 assert.ok(chooseUpgrade(legacy,'autofrost'));
 saveProgress(storage,legacy);
 assert.deepEqual(readProgress(storage),legacy);
});
