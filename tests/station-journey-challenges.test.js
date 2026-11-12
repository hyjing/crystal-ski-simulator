import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import fs from 'node:fs';
import {CHAIR_CUSHION_Y,CHAIR_RIDER_Y,CABIN_FLOOR_Y,liftServiceStops,sampleCarrierPose} from '../src/lift-geometry.js';
import {liftOrbit} from '../src/camera-look.js';
import {LiftJourney,carrierSeat} from '../src/lift-journey.js';import {stationPoint,staffActivity} from '../src/lift-station-layout.js';import {RunChallenge,routeGates,practiceTerrain,practiceHeight,recordRun} from '../src/run-challenges.js';import {ChallengeRenderer} from '../src/challenge-renderer.js';import {StationLife,STATION_ACTORS} from '../src/station-life.js';import {createAthleteRig,updateAthletePose} from '../src/athlete.js';import {createTerrain,getLiftRuns} from '../src/terrain.js';import {addResort,liftExitSpawn} from '../src/resort.js';import {prepareStationTerrain,addStationStructures} from '../src/stations.js';import {MOUNTAINS,mountainAsset} from '../src/mountains.js';import {StructureWorld} from '../src/structure-collision.js';import {yieldToSkier} from '../src/traffic-brain.js';import {createSkier,stepSkier} from '../src/physics.js';import {PowderSurface} from '../src/powder.js';
const lower={id:'L:lower',liftId:'L',role:'lower',x:0,z:0,heading:Math.PI},upper={...lower,id:'L:upper',role:'upper',z:100,heading:0},surface=()=>1500,route={id:'test',name:'test',length:1000,spawn:{x:0,z:130,heading:0,distance:30},points:[{x:0,z:0},{x:0,z:1000}]};
const chair=(ascending=true)=>({liftId:'L',ascending,travelProgress:0,total:100,collider:{position:new THREE.Vector3(0,302,0),quaternion:new THREE.Quaternion()}});
const waiting=j=>{for(let i=0;i<400&&j.phase!=='waiting';i++)j.update(.1,[],surface);assert.equal(j.phase,'waiting');};
test('the rider waits on the load mark until the chair arrives, then stands before releasing it at the upper mark',()=>{
 const j=new LiftJourney(),c=chair(),down=chair(false);
 j.begin(lower,upper,route,{x:0,z:-20});waiting(j);
 const mark={...j.frame};
 j.update(.1,[down],surface);assert.equal(j.phase,'waiting');
 j.update(.1,[down,c],surface);assert.equal(j.phase,'boarding');assert.equal(c.playerReserved,true);
 for(let i=0;i<10;i++)j.update(.1,[c],surface);
 assert.deepEqual({x:j.frame.x,z:j.frame.z,sit:j.frame.sit},{x:mark.x,z:mark.z,sit:0});
 c.travelProgress=3.2;
 for(let i=0;i<9;i++)j.update(.1,[c],surface);
 assert.equal(j.phase,'riding');
 c.collider.position.set(3,330,65);c.travelProgress=65;
 j.update(.1,[c],surface);
 assert.equal(j.frame.x,carrierSeat(c).x);
 assert.equal(j.frame.y,330+CHAIR_RIDER_Y);
 c.travelProgress=97;
 j.update(.1,[c],surface);
 assert.equal(j.phase,'dismounting');
 assert.equal(c.playerReserved,true);
 assert.equal(j.frame.sit,1);
 for(let i=0;i<9;i++)j.update(.1,[c],surface);
 assert.equal(j.phase,'unloading');
 assert.equal(j.frame.sit,0);
 assert.equal(c.playerReserved,false);
 for(let i=0;i<130&&j.active;i++)j.update(.1,[c],surface);
 assert.equal(j.phase,'complete');
 assert.equal(j.frame.x,route.spawn.x);
 assert.equal(j.frame.z,route.spawn.z);
 assert.ok(Math.abs(j.frame.y-299.885)<1e-6);
});
test('skip starts at the upper platform and cancellation releases a reserved carrier',()=>{
 const j=new LiftJourney(),c=chair();
 j.begin(lower,upper,route,{x:0,z:0});waiting(j);
 j.update(.1,[c],surface);j.cancel();
 assert.equal(c.playerReserved,false);
 j.begin(lower,upper,route,{x:0,z:0});
 j.skip(()=>1900);
 assert.equal(j.frame.y,699.885);
 assert.equal(j.frame.z,100);
 j.cancel();assert.equal(j.active,false);
});

test('service marks are sampled from the same lane and height as the animated chair and cabin',()=>{
 const fixture={side:1,total:100,ground:()=>300,segments:[
  {a:{x:0,y:305,z:0},b:{x:0,y:305,z:100},l:100,start:0,rx:2.5,rz:0},
 ]};
 for(const cabin of [false,true]){
  const c={...fixture,cabin},stops=liftServiceStops(c);
  for(const stop of Object.values(stops)){
   const pose=sampleCarrierPose(c,stop.progress);
   assert.equal(pose.open,1);
   assert.equal(stop.z,cabin?pose.z:pose.z-.09);
   assert.ok(Math.abs(stop.x-(pose.x+(cabin?1.52:-.31)))<1e-9);
   assert.ok(Math.abs(pose.y+(cabin?CABIN_FLOOR_Y:CHAIR_CUSHION_Y)-(cabin?300.04:300.565))<1e-9);
  }
  assert.equal(sampleCarrierPose(c,50).open,0);
 }
});
test('terminal frame and guide gestures follow real ascending chair proximity, with a separate maintenance cycle',()=>{assert.deepEqual(stationPoint({...lower,heading:Math.PI/2},2,3),{x:3,z:-1.9999999999999998});const c=chair();assert.equal(staffActivity(lower,[c],1).gesture,'guide');assert.equal(staffActivity(lower,[chair(false)],1,0,{x:0,z:0}).gesture,'wave');assert.equal(staffActivity(lower,[],1,1).gesture,'shovel');assert.equal(staffActivity(lower,[],9,1).gesture,'inspect');});
test('station crowd stays within six actors, obeys toggle and only selects nearby stations',()=>{const scene=new THREE.Scene(),actors=Array.from({length:STATION_ACTORS},()=>{const a=createAthleteRig(scene);a.userData.shovel=new THREE.Group();return a;}),life=new StationLife([lower,upper,{...lower,id:'far',x:1000}],actors,surface);life.update(1,{x:0,z:0},[],true);assert.equal(actors.filter(a=>a.visible).length,6);assert.ok(life.selected.every(s=>s.id!=='far'));life.update(1.1,{x:0,z:0},[],false);assert.ok(actors.every(a=>!a.visible));life.update(3,{x:3000,z:0},[],true);assert.ok(actors.every(a=>!a.visible));});
test('ordered timing gates support swept fast crossings and charge crashes once per incident',()=>{const c=new RunChallenge(route,'time');for(const gate of c.gates){const s={x:gate.x,z:gate.z+20};assert.equal(c.step({x:gate.x,z:gate.z-20},s,.1),true);}assert.equal(c.result().complete,true);c.step({x:0,z:0},{x:0,z:0,crashRemaining:3},.1);c.step({x:0,z:0},{x:0,z:0,crashRemaining:2},.1);assert.equal(c.penalty,5);assert.ok(c.result().time>5);});
test('slalom gates require alternating lanes and missed gates cannot earn a complete record',()=>{const gates=routeGates(route,'turns');assert.ok(gates[0].x*gates[1].x<0);assert.ok(Math.abs(gates[0].x)>gates[0].radius);const c=new RunChallenge(route,'turns');for(const g of c.gates)c.step({x:0,z:g.z-40},{x:0,z:g.z+40},.1);assert.equal(c.missed,c.gates.length);assert.equal(c.result().complete,false);assert.equal(c.penalty,c.gates.length*5);});
test('practice ramp mesh vertices and physical surface agree, and clearing mode restores terrain',()=>{const base={surface:(x,z)=>1500-z*.2,sample:(x,z)=>1500-z*.2,gradient:()=>({x:0,z:-.2})},t=practiceTerrain(base),f={x:0,z:200,heading:.3,height:1.15};t.setPractice([f]);assert.ok(Math.abs(t.surface(0,200)-base.surface(0,200)-1.15)<1e-8);const r=new ChallengeRenderer(new THREE.Scene(),t);r.configure(new RunChallenge(route,'freestyle'),[f]);const mesh=r.group.children[0],p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-(t.surface(p.getX(i),p.getZ(i))-1200+.025))<.00003);for(const u of [-7,5])assert.equal(practiceHeight([f],f.x+Math.sin(f.heading)*u,f.z+Math.cos(f.heading)*u)<1e-12,true);t.setPractice([]);assert.equal(t.surface(0,200),base.surface(0,200));r.clear();assert.equal(r.group.children.length,0);});
test('practice powder uniforms carry the same analytic bumps, without overwriting the base DEM',()=>{const t=practiceTerrain(createTerrain({width:3,height:3,spacing:10,heights:new Array(9).fill(1500)})),p=new PowderSurface(new THREE.Scene(),t,{capabilities:{getMaxAnisotropy:()=>1}}),features=[{x:1,z:2,heading:.3,height:1.15}];t.setPractice(features);p.setPractice(features);assert.equal(p.uniforms.practiceCount.value,1);assert.deepEqual(p.uniforms.practiceFeatures.value[0].toArray(),[1,2,.3,1.15]);assert.equal(p.demTexture.image.data[0],1500);p.setPractice([]);assert.equal(p.uniforms.practiceCount.value,0);});
test('personal records only improve and unavailable storage does not break finishing',()=>{const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};assert.equal(recordRun(storage,'r',30),30);assert.equal(recordRun(storage,'r',40),30);assert.equal(recordRun(storage,'r',25),25);assert.equal(recordRun(storage,'r',NaN),null);assert.equal(recordRun({getItem(){throw Error('denied');}},'r',20),null);});
test('slow NPC yields with clearance hysteresis, rather than fluttering between stop and go',()=>{const s={point:{x:0,z:0},heading:0,speed:2};assert.equal(yieldToSkier(s,{x:0,z:4},.1),true);for(let i=0;i<10;i++)assert.equal(yieldToSkier(s,{x:0,z:i%2?8:10},.1),true);for(let i=0;i<9;i++)yieldToSkier(s,{x:0,z:12},.1);assert.equal(s.yielding,false);assert.equal(yieldToSkier({...s,speed:12},{x:0,z:4},.1),false);});
test('reversal crosses edges promptly while preserving momentum, and stationary leaning is balanced',()=>{const s={...createSkier({x:0,z:0},{x:0,z:1}),vz:12,speed:12};for(let i=0;i<120;i++)stepSkier(s,{steer:1},{gradient:()=>({x:0,z:0})},1/120);let time=0;while(s.edgeRoll>0&&time<.2){const old={...s};stepSkier(s,{steer:-1},{gradient:()=>({x:0,z:0})},1/120);assert.ok(Math.hypot(s.vx-old.vx,s.vz-old.vz)<.2);time+=1/120;}assert.ok(time<=.06,`edge crossover ${time}`);const a=createAthleteRig(new THREE.Scene());updateAthletePose(a,{speed:0,edgeRoll:.9},0,()=>0);assert.equal(a.userData.lean,0);updateAthletePose(a,{speed:12,edgeRoll:.9},0,()=>0);assert.equal(a.userData.lean,.9);});
test('all resort terminal metadata matches moving lift IDs and primary-route exits still clear new queue fences',()=>{const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};try{for(const id of Object.keys(MOUNTAINS)){const read=n=>JSON.parse(fs.readFileSync(new URL(`../public/${mountainAsset(id,n)}`,import.meta.url))),raw=createTerrain(read('dem.json')),runs=read('lift-runs.json'),infra=read('infrastructure.json'),rs=getLiftRuns(raw,runs),{terrain,areas}=prepareStationTerrain(raw,rs,infra),scene=new THREE.Scene(),controller=addResort(scene,terrain,infra);addStationStructures(scene,terrain,infra,areas);const world=new StructureWorld(scene);for(const r of rs){const p=liftExitSpawn(terrain,r,infra);assert.ok(!world.blocked(p.x,p.z,terrain.surface(p.x,p.z)),`${id} ${r.id}`);assert.ok(scene.userData.liftTerminals.some(s=>s.role==='upper'&&s.liftId===String(r.liftId)));}for(const c of controller.allCarriers.filter(c=>c.ascending)){const before=c.travelProgress;controller(.1);assert.ok(Number.isFinite(c.travelProgress));if(before<c.total-1)assert.ok(c.travelProgress>=before);}scene.traverse(o=>o.geometry?.dispose());}}finally{globalThis.document=old;}});

test('real routes generate finite oriented gates and bounded downhill practice bumps',async()=>{const {practiceBumps}=await import('../src/run-challenges.js');let total=0;for(const id of Object.keys(MOUNTAINS)){const read=n=>JSON.parse(fs.readFileSync(new URL(`../public/${mountainAsset(id,n)}`,import.meta.url))),t=createTerrain(read('dem.json')),rs=getLiftRuns(t,read('lift-runs.json'));for(const r of rs){r.spawn={distance:55};for(const g of routeGates(r,'turns'))assert.ok([g.x,g.z,g.heading].every(Number.isFinite));const features=practiceBumps(r,t);assert.ok(features.length<=3);total+=features.length;for(const f of features){assert.ok([f.x,f.z,f.heading].every(Number.isFinite));const g=t.gradient(f.x,f.z);assert.ok(g.x*Math.sin(f.heading)+g.z*Math.cos(f.heading)<-.08);assert.ok(f.distance>185&&f.distance<r.length-130);}}}assert.ok(total>40);});
test('station motor attenuates by distance, chimes only after opt-in and throttles boarding announcements',async()=>{const {StationAudio}=await import('../src/station-audio.js');let starts=0,lastGain;const context={currentTime:1,destination:{},createOscillator:()=>({frequency:{value:0},connect(){return this;},start(){starts++;},stop(){},disconnect(){}}),createGain:()=>({gain:{value:0,setTargetAtTime(v){lastGain=v;},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},disconnect(){}})},a=new StationAudio(context);assert.equal(starts,2);a.update([lower],{x:0,z:0},false,0,true);assert.equal(starts,2);assert.equal(lastGain,0);a.update([lower],{x:0,z:0},true,1,true);assert.equal(starts,4);assert.ok(lastGain>0);a.update([lower],{x:0,z:0},true,2,true);assert.equal(starts,4);a.update([lower],{x:0,z:1000},true,3,false);assert.equal(lastGain,0);});
test('staff guide, waving and shoveling use the actual human skeleton with bounded hands and continuous transitions',async()=>{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{attachHumanoid}=await import('../src/humanoid.js'),{SkierMotion}=await import('../src/skier-motion.js'),bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),actor=createAthleteRig(new THREE.Scene()),rig=attachHumanoid(actor,model.scene),clips=JSON.parse(fs.readFileSync(new URL('../public/assets/skier-motion.json',import.meta.url))).clips.map(c=>THREE.AnimationClip.parse(c));rig.motion=new SkierMotion(rig.model,clips);let previous;for(let i=0;i<360;i++){updateAthletePose(actor,{pedestrian:true,holding:'staff',staffGesture:['inspect','guide','wave','shovel'][Math.floor(i/90)],staffPhase:(i%90)/90},1/60,()=>0);const hands=actor.userData.arms.map(arm=>{const side=arm.sign>0?'l':'r',s=rig.bones[`upperarm_${side}`].getWorldPosition(new THREE.Vector3()),h=rig.bones[`hand_${side}`].getWorldPosition(new THREE.Vector3());assert.ok(h.toArray().every(Number.isFinite));assert.ok(s.distanceTo(h)<(rig.lengths[side].upper+rig.lengths[side].lower)*1.01);return h;});if(previous)for(let j=0;j<2;j++)assert.ok(hands[j].distanceTo(previous[j])<.13);previous=hands;}});


test('lift queue rounds corners without stopping and pause preserves the reserved seat and frame',()=>{
 const journey=new LiftJourney(),c=chair();
 journey.begin(lower,upper,route,{x:0,y:299.93,z:-20,heading:Math.PI});
 let crossed=false,prior=journey.frame;
 for(let i=0;i<3000&&journey.phase!=='waiting';i++){
  const phase=journey.phase,frame=journey.update(1/60,[],surface);
  const speed=Math.hypot(frame.x-prior.x,frame.z-prior.z)*60;
  assert.ok(speed<=2.81);
  if(phase==='queue'&&journey.phase==='approaching'){assert.ok(speed>2.5);crossed=true;}
  prior=frame;
 }
 assert.ok(crossed);
 journey.update(.1,[c],surface);
 c.travelProgress=3.2;
 for(let i=0;i<5;i++)journey.update(.1,[c],surface);
 assert.ok(journey.frame.sit>0&&journey.frame.sit<1);
 const frozen={...journey.frame},age=journey.age;
 journey.pause();
 assert.equal(journey.clockRate(),0);
 c.collider.position.y+=1;
 assert.deepEqual(journey.update(.1,[c],surface),frozen);
 assert.equal(journey.age,age);
 assert.equal(c.playerReserved,true);
 journey.resume();
 assert.notDeepEqual(journey.update(.1,[c],surface),frozen);
});

test('lift orbit pitches above and below the seat and supports a closer zoom',()=>{
 const p={x:4,y:19,z:12},above=liftOrbit(p,0,0,-.45,0),below=liftOrbit(p,0,0,.65,0);
 assert.ok(above.eye.y>above.target.y);
 assert.ok(below.eye.y<below.target.y);
 const close=liftOrbit(p,0,0,0,-6),wide=liftOrbit(p,0,0,0,6);
 assert.ok(Math.abs(close.eye.z-p.z)<Math.abs(wide.eye.z-p.z));
});


test('automatic lift queue routes around a solid fence between the skier and the entrance',()=>{
 const journey=new LiftJourney(),start={x:0,z:-20,heading:0};
 const clear=p=>!(p.x>2&&p.x<8&&p.z> -29&&p.z< -22);
 assert.equal(journey.begin(lower,upper,route,start,clear),true);
 for(let i=0;i<400&&journey.phase!=='waiting';i++){
  const frame=journey.update(.1,[],surface);
  assert.ok(clear(frame),`blocked at ${frame.x}, ${frame.z}`);
 }
 assert.equal(journey.phase,'waiting');
});

test('gondola riders board through the open side and step back onto the upper platform',()=>{
 const c={...chair(),cabin:true,side:1,ground:()=>300,segments:[
  {a:{x:0,y:305,z:0},b:{x:0,y:305,z:100},l:100,start:0,rx:2.5,rz:0},
 ]};
 const stops=liftServiceStops(c);
 const j=new LiftJourney(),from={...lower,service:stops.lower},to={...upper,service:stops.upper};
 const place=progress=>{
  const pose=sampleCarrierPose(c,progress);
  c.collider.position.set(pose.x,pose.y,pose.z);
  c.collider.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),pose.heading);
  c.travelProgress=progress;
 };
 j.begin(from,to,route,{x:0,z:-20});waiting(j);
 assert.equal(j.frame.x,stops.lower.x);
 assert.ok(Math.abs(j.frame.z-stops.lower.z)<1e-9);
 place(0);
 j.update(.1,[c],surface);
 assert.equal(j.phase,'boarding');
 assert.equal(j.frame.x,stops.lower.x);
 place(stops.lower.progress);
 for(let i=0;i<12;i++)j.update(.1,[c],surface);
 assert.equal(j.phase,'riding');
 assert.equal(j.frame.x,2.5);
 assert.equal(j.frame.sit,0);
 place(stops.upper.progress);
 j.update(.1,[c],surface);
 assert.equal(j.phase,'dismounting');
 for(let i=0;i<12;i++)j.update(.1,[c],surface);
 assert.equal(j.phase,'unloading');
 assert.ok(Math.abs(j.frame.x-stops.upper.x)<.04);
 assert.equal(c.playerReserved,false);
});
