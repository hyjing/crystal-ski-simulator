import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createAthleteRig,updateAthletePose} from '../src/athlete.js';import {attachHumanoid,upperBodyCounterAngle} from '../src/humanoid.js';import {SkierMotion} from '../src/skier-motion.js';import {advanceSkiGesture,poleSnowContact} from '../src/ski-gesture.js';import {createSkier} from '../src/physics.js';import {stepAirborne} from '../src/airborne.js';import {fallAnimation} from '../src/npc-routines.js';
const bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),source=new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),clips=JSON.parse(fs.readFileSync(new URL('../public/assets/skier-motion.json',import.meta.url))).clips.map(c=>THREE.AnimationClip.parse(c)),flat={surface:()=>1500,gradient:()=>({x:0,z:0})};
async function fresh(){const a=createAthleteRig(new THREE.Scene()),rig=attachHumanoid(a,clone((await source).scene));rig.motion=new SkierMotion(rig.model,clips);return{a,rig};}
const position=(r,n)=>r.bones[n].getWorldPosition(new THREE.Vector3());
test('a tapped jump visibly preloads for 100ms then launches exactly once, and crashes cancel queued jumps',()=>{
 const s={...createSkier({x:0,z:0},{x:0,z:1}),vz:12,speed:12};let launches=0,preload=0,first;
 for(let i=0;i<240;i++){stepAirborne(s,{jump:i===0},flat,1/120);if(s.jumpPreparation>0&&!s.airborne)preload++;if(s.airEvent?.type==='takeoff'){launches++;first=i/120;}}
 assert.equal(launches,1);assert.ok(preload>=10&&preload<=12);assert.ok(first>=.09&&first<=.11);
 const crashed={...s,jumpQueued:.05,jumpPreparation:.5,crashRemaining:1};stepAirborne(crashed,{},flat,1/120);assert.equal(crashed.jumpQueued,0);assert.equal(crashed.jumpPreparation,0);
});
test('terrain absorption responds to broad curvature, stays bounded and has no flat-slope or airborne oscillation',()=>{
 const state={},s={x:0,z:0,heading:0,speed:18};let gesture;
 for(let i=0;i<120;i++)gesture=advanceSkiGesture(state,s,1/120,()=>0);assert.equal(gesture.absorption,0);
 for(let i=0;i<120;i++)gesture=advanceSkiGesture(state,s,1/120,(_,z)=>.10*z*z);assert.ok(gesture.absorption>.7&&gesture.absorption<=.75);
 gesture=advanceSkiGesture(state,{...s,airborne:true},1/120,(_,z)=>.10*z*z);assert.equal(gesture.absorption,0);
 for(let i=0;i<120;i++)gesture=advanceSkiGesture(state,s,1/120,(_,z)=>-.10*z*z);assert.ok(gesture.absorption>=-.18&&gesture.absorption<0);
});
test('edge release occurs once on a real flatten / reversal and fades instead of cycling while held',()=>{
 const state={},s={speed:12,edgeRoll:.7};advanceSkiGesture(state,s,1/120);s.edgeRoll=.05;assert.ok(advanceSkiGesture(state,s,1/120).release>.9);s.edgeRoll=-.6;advanceSkiGesture(state,s,1/120);let end;for(let i=0;i<120;i++)end=advanceSkiGesture(state,s,1/120);assert.ok(end.release<.01);
});
test('relaxed stance has flexed knees, hands forward and symmetric anatomy; turns load the outside leg',async()=>{
 const {a,rig}=await fresh();updateAthletePose(a,{speed:12},0,()=>0);a.updateMatrixWorld(true);
 const angles=()=>['l','r'].map(side=>position(rig,`thigh_${side}`).sub(position(rig,`calf_${side}`)).angleTo(position(rig,`foot_${side}`).sub(position(rig,`calf_${side}`))));
 for(const angle of angles())assert.ok(angle>1.2&&angle<2.95,`knee ${angle}`);
 for(const side of ['l','r'])assert.ok(position(rig,`hand_${side}`).z>position(rig,`upperarm_${side}`).z+.08);
 for(const bank of [-.9,.9]){updateAthletePose(a,{speed:16,edgeRoll:bank,edgeAngle:Math.abs(bank)},0,()=>0);const [left,right]=angles();assert.ok(bank>0?left>right:right>left,`outside knee: ${bank} ${left} ${right}`);}
 assert.ok(Math.abs(upperBodyCounterAngle(Math.PI/2,0,{speed:12,vx:12,vz:0}))<1e-8);
});
test('air clips fold legs and equipment remains attached to the actual animated boots',async()=>{
 const {a,rig}=await fresh(),heights=[];a.rotation.set(.2,.5,0);
 for(const state of [{flightTime:.01,airVy:5,airClearance:1},{flightTime:.6,airVy:0,airClearance:2},{flightTime:1.1,airVy:-5,airClearance:.2}]){updateAthletePose(a,{airborne:true,speed:12,...state},0,()=>0);assert.equal(rig.motion.stage,'air');heights.push(position(rig,'foot_l').distanceTo(position(rig,'pelvis')));
 for(let i=0;i<2;i++){const foot=position(rig,i?'foot_l':'foot_r'),ski=a.userData.skis[i].getWorldPosition(new THREE.Vector3());assert.ok(foot.distanceTo(ski)<.15);assert.ok(foot.distanceTo(ski)>.07);}}
 assert.ok(heights[1]<heights[0]-.08,`float should fold legs: ${heights}`);assert.ok(heights[2]>heights[1]+.08);
});
test('landing impact changes actual pelvis compression and recovery clips are event-phase locked',async()=>{
 const {a,rig}=await fresh(),heights=[];
 for(const strength of [0,1]){updateAthletePose(a,{speed:12,landingAnimationDuration:.6,landingAnimationRemaining:.42,landingStrength:strength},0,()=>0);heights.push(position(rig,'pelvis').y);assert.equal(rig.motion.stage,'landing');const action=rig.motion.actions.get(strength?'ski-landing-hard':'ski-landing-soft');assert.ok(Math.abs(action.time/action.getClip().duration-.3)<1e-6);}
 assert.ok(heights[1]<heights[0]-.04,`hard landing: ${heights}`);
 for(let i=0;i<180;i++)updateAthletePose(a,{speed:12},1/120,()=>0);assert.equal(rig.motion.stage,'ski');assert.ok(rig.motion.actions.get('ski-glide').getEffectiveWeight()>.999);
});
test('fall clips cover balance, impact, settle, brace and stand without changing skeleton segment lengths',async()=>{
 const {a,rig}=await fresh(),seen=new Set(),lengths=new Map(Object.values(rig.bones).map(b=>[b.name,b.position.length()]));let previous;
 for(let i=0;i<=384;i++){const remaining=3.2-i/120,f=fallAnimation(remaining,3.2);updateAthletePose(a,{speed:0,crashRemaining:Math.max(0,remaining),fallPhase:f.phase,fallAmount:f.amount,fallCrouch:f.crouch,fallBrace:f.brace},1/120,()=>0);seen.add(f.phase);for(const bone of Object.values(rig.bones)){assert.ok(bone.quaternion.toArray().every(Number.isFinite));if(bone.name!=='pelvis')assert.ok(Math.abs(bone.position.length()-lengths.get(bone.name))<1e-6);}const head=position(rig,'Head');if(previous)assert.ok(head.distanceTo(previous)<.08);previous=head;}
 assert.ok(['balance','impact','settle','brace','stand','upright'].every(p=>seen.has(p)));
});
test('feasible pole contacts preserve equipment length on flat and sloped snow and reject unreachable ground',()=>{
 for(const grade of [0,.2,-.2]){const hand=new THREE.Vector3(0,1.1,0),surface=(x,z)=>grade*z,p=poleSnowContact(hand,new THREE.Vector3(.1,-1,.4),1.378,surface);assert.ok(p);assert.ok(Math.abs(p.distanceTo(hand)-1.378)<1e-5);assert.ok(Math.abs(p.y-surface(p.x,p.z)-.025)<1e-8);}
 assert.equal(poleSnowContact(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,1),1.378,()=>0),null);
});
test('switching between clips, grab IK and ground recovery cannot snap the torso',async()=>{
 const {a,rig}=await fresh();let previous;
 for(let i=0;i<240;i++){const airborne=i<170,grab=i>=60&&i<110?.9:0;updateAthletePose(a,{speed:12,airborne,grab,flightTime:i/120,airVy:i<80?4:-4,airClearance:i<140?2:.2},1/120,()=>0);const current=rig.bones.spine_03.getWorldQuaternion(new THREE.Quaternion());if(previous)assert.ok(current.angleTo(previous)<.2,`torso snap at ${i}`);previous=current;}
});
test('real linked-turn contact reaches snow using a fixed pole without pulling the animated hand',async()=>{
 const {a,rig}=await fresh(),s={heading:0,speed:12,vx:0,vz:12,turn:1,steerInput:1,edgeRoll:.45,edgeAngle:.45};let touched=false,previous;
 for(let i=0;i<300;i++){const side=i<90?1:i<180?-1:1;s.turn=s.steerInput=side;s.heading-=side*.006;s.edgeRoll+=(side*.45-s.edgeRoll)*.12;a.position.x+=Math.sin(s.heading)*.1;a.position.z+=Math.cos(s.heading)*.1;a.rotation.y=s.heading;updateAthletePose(a,s,1/120,()=>0);const hand=position(rig,'hand_l');if(previous)assert.ok(hand.distanceTo(previous)<.14);previous=hand;
  if(a.userData.poleContact){touched=true;assert.ok(Math.abs(a.userData.poleContact.y-.025)<1e-6);const arm=a.userData.arms.find(arm=>arm.sign===a.userData.plant.plantSide),tip=arm.pole.localToWorld(new THREE.Vector3(0,.5,0));assert.ok(Math.abs(tip.y-.025)<.03);}
 }assert.ok(touched,'at least one feasible touch must survive actual animated hand position');
});
test('physical jump runs through preload, flight, impact absorption and return to skiing without a root / bone discontinuity',async()=>{
 const {a,rig}=await fresh(),s={...createSkier({x:0,z:0},{x:0,z:1}),vz:12,speed:12},seen=new Set();let previous;
 for(let i=0;i<480;i++){stepAirborne(s,{jump:i===0},flat,1/120);a.position.set(s.x,(s.airborne?s.airY:1500)-1500,s.z);updateAthletePose(a,s,1/120,()=>0);seen.add(rig.motion.stage);const head=position(rig,'Head');if(previous)assert.ok(head.distanceTo(previous)<.18,`jump head step at ${i}`);previous=head;}
 assert.ok(['preload','air','landing','ski'].every(s=>seen.has(s)));assert.ok(!s.airborne);assert.ok(!s.crashRemaining);
});


test('ski bindings stay with boots through linked turns, tuck, and sitting down',async()=>{
 const {a,rig}=await fresh();
 const suit=rig.model.getObjectByName('Unified_ski_suit');
 const {position:cloth,skinIndex,skinWeight}=suit.geometry.attributes;
 let anchoredCuffs=0;
 for(let i=0;i<cloth.count;i++){
  if(cloth.getY(i)>.205)continue;
  const foot=rig.bones[cloth.getX(i)>0?'foot_l':'foot_r'];
  assert.equal(suit.skeleton.bones[skinIndex.getX(i)],foot);
  assert.ok(skinWeight.getX(i)>.999);
  anchoredCuffs++;
 }
 assert.ok(anchoredCuffs>60);
 const hipPositions=[],kneePositions=[];
 for(const edgeRoll of [-.85,.85]){
  for(let i=0;i<45;i++)updateAthletePose(a,{speed:14,tuck:.92,edgeRoll,turnAcceleration:8},1/60,()=>0);
  hipPositions.push(position(rig,'pelvis').x);
  kneePositions.push(position(rig,'calf_l').x);
  for(const {ski,boot,soleY} of rig.bindings){
   const contact=boot.worldToLocal(ski.getWorldPosition(new THREE.Vector3()));
   assert.ok(contact.distanceTo(new THREE.Vector3(0,soleY-.004,-.114))<1e-6);
  }
 }
 assert.ok(hipPositions[0]-hipPositions[1]>.25);
 assert.ok(kneePositions[0]-kneePositions[1]>.13);
 for(let i=0;i<=60;i++){
  const sit=i/60;
  updateAthletePose(a,{pedestrian:true,holding:'ride',sitAmount:sit,ridePose:sit},1/60,()=>0);
  for(const {ski,boot,soleY} of rig.bindings){
   const contact=boot.worldToLocal(ski.getWorldPosition(new THREE.Vector3()));
   assert.ok(contact.distanceTo(new THREE.Vector3(0,soleY-.004,-.114))<1e-6);
  }
 }
});
