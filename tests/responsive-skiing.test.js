import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createSkier,stepSkier} from '../src/physics.js';import {advanceSkiGesture} from '../src/ski-gesture.js';import {createAthleteRig,updateAthletePose} from '../src/athlete.js';import {attachHumanoid} from '../src/humanoid.js';import {SkierMotion} from '../src/skier-motion.js';
const flat={gradient:()=>({x:0,z:0})},moving=v=>({...createSkier({x:0,z:0},{x:0,z:1}),vz:v,speed:v}),step=1/120;
function simulate(s,input,frames){for(let i=0;i<frames;i++)stepSkier(s,input,flat,step);return s;}
test('initial turns bend the real path promptly at recreational and fast skiing speeds',()=>{
 for(const [v,angle] of [[12,.36],[20,.23]]){const s=moving(v);simulate(s,{steer:1},60);assert.ok(Math.abs(s.heading)>angle);assert.ok(s.x<-.8);assert.ok(s.vx<-2);assert.ok(s.slip<.15);assert.ok(s.speed<=v);}
 const s=moving(20);simulate(s,{steer:1},24);assert.ok(Math.abs(s.heading)>.05);assert.ok(s.edgeAngle>.7);
});
test('fast edge changes retain momentum and flatten once; released steering promptly levels the skis',()=>{
 const s=moving(12);simulate(s,{steer:1},120);let crossings=0,last=s.edgeRoll;
 for(let i=0;i<18;i++){const old={vx:s.vx,vz:s.vz};stepSkier(s,{steer:-1},flat,step);assert.ok(Math.hypot(s.vx-old.vx,s.vz-old.vz)<.2);if(last>0&&s.edgeRoll<=0)crossings++;last=s.edgeRoll;}assert.equal(crossings,1);assert.ok(s.edgeRoll<-.4);
 simulate(s,{steer:0},24);assert.ok(Math.abs(s.edgeRoll)<.04);assert.equal(s.turn,0);
});
test('analog steering remains progressive instead of making light inputs act like full lock',()=>{
 const angles=[.2,.5,1].map(steer=>Math.abs(simulate(moving(12),{steer},60).heading));assert.ok(angles[0]<angles[1]&&angles[1]<angles[2]);assert.ok(angles[0]<angles[2]*.35);
});
test('body response follows changing load, settles at steady load and stays still at rest',()=>{
 const state={},s={speed:12,edgeRoll:.7,turnAcceleration:10};let result;
 for(let i=0;i<240;i++)result=advanceSkiGesture(state,s,step);assert.ok(result.dynamic.flex>.025&&result.dynamic.flex<.03);const settled=result.dynamic.flex;
 for(let i=0;i<120;i++)result=advanceSkiGesture(state,s,step);assert.ok(Math.abs(result.dynamic.flex-settled)<1e-8);assert.ok(Math.abs(result.dynamic.roll)<1e-8);
 result=advanceSkiGesture(state,{...s,edgeRoll:-.7},step);assert.ok(result.dynamic.roll>0&&result.dynamic.roll<.06);
 for(let i=0;i<240;i++)result=advanceSkiGesture(state,{speed:0,edgeRoll:0,turnAcceleration:0},step);assert.ok(Math.abs(result.dynamic.flex)<1e-8);assert.ok(Math.abs(result.dynamic.pitch)<1e-8);assert.ok(Math.abs(result.dynamic.roll)<1e-8);
});
const bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),source=new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),clips=JSON.parse(fs.readFileSync(new URL('../public/assets/skier-motion.json',import.meta.url))).clips.map(c=>THREE.AnimationClip.parse(c));
async function fresh(){const a=createAthleteRig(new THREE.Scene()),rig=attachHumanoid(a,clone((await source).scene));rig.motion=new SkierMotion(rig.model,clips);return{a,rig};}
const position=(r,n)=>r.bones[n].getWorldPosition(new THREE.Vector3());
test('snow reaction produces actual knee absorption with grounded feet, rather than rigid whole-body bobbing',async()=>{
 const {a,rig}=await fresh(),s={speed:12,edgeRoll:.45,turnAcceleration:0};for(let i=0;i<120;i++)updateAthletePose(a,s,step,()=>0);const hip=position(rig,'pelvis').y,feet=['l','r'].map(side=>position(rig,`foot_${side}`));
 for(let i=0;i<120;i++)updateAthletePose(a,{...s,turnAcceleration:12},step,()=>0);assert.ok(hip-position(rig,'pelvis').y>.025);assert.ok(hip-position(rig,'pelvis').y<.04);for(let i=0;i<2;i++)assert.ok(position(rig,`foot_${i?'r':'l'}`).distanceTo(feet[i])<.012);
});
test('a physics-driven linked turn stays articulated with outward elbows and attached poles while loading and releasing',async()=>{
 const {a,rig}=await fresh(),s=moving(12);let previous,sawFlex=false;
 for(let i=0;i<480;i++){stepSkier(s,{steer:Math.floor(i/120)%2?-1:1},flat,step);a.position.set(s.x,0,s.z);a.rotation.y=s.heading;updateAthletePose(a,{...s,downhillHeading:0},step,()=>0);sawFlex||=a.userData.gesture.bodyFlex>.02;const hip=position(rig,'pelvis');if(previous)assert.ok(hip.distanceTo(previous)<.15);previous=hip;
  const torso=rig.bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get('spine_03').q.clone().invert()),right=new THREE.Vector3(1,0,0).applyQuaternion(torso);
  for(const arm of a.userData.arms){const side=arm.sign>0?'l':'r',shoulder=position(rig,`upperarm_${side}`),elbow=position(rig,`lowerarm_${side}`);assert.ok(elbow.sub(shoulder).dot(right)*arm.sign>.055);assert.ok(arm.palmSocket.getWorldPosition(new THREE.Vector3()).distanceTo(arm.pole.localToWorld(new THREE.Vector3(0,-.5,0)))<1e-7);}
 }assert.ok(sawFlex);
});
