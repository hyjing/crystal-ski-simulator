import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createSkier,stepSkier} from '../src/physics.js';import {createAthleteRig,updateAthletePose} from '../src/athlete.js';import {attachHumanoid} from '../src/humanoid.js';import {SkierMotion} from '../src/skier-motion.js';import {targetNpcPose,blendNpcPose} from '../src/npc-pose.js';
const bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),source=new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),clips=JSON.parse(fs.readFileSync(new URL('../public/assets/skier-motion.json',import.meta.url))).clips.map(c=>THREE.AnimationClip.parse(c));
async function fresh(animated=true){const a=createAthleteRig(new THREE.Scene()),rig=attachHumanoid(a,clone((await source).scene));if(animated)rig.motion=new SkierMotion(rig.model,clips);return{a,rig};}
function assertAttached(a){a.updateMatrixWorld(true);for(const arm of a.userData.arms){const grip=arm.palmSocket.getWorldPosition(new THREE.Vector3()),shaftStart=arm.pole.localToWorld(new THREE.Vector3(0,-.5,0)),shaftTip=arm.pole.localToWorld(new THREE.Vector3(0,.5,0)),wrist=arm.palmSocket.parent.getWorldPosition(new THREE.Vector3());assert.ok(grip.distanceTo(shaftStart)<1e-7,`pole separated from palm by ${grip.distanceTo(shaftStart)}`);assert.ok(grip.distanceTo(wrist)>.05,'socket must be inside the palm, not at the wrist joint');assert.ok(Math.abs(shaftTip.distanceTo(shaftStart)-2.65*.52)<1e-7);assert.ok(arm.pole.getObjectByName('Ski pole grip'));}}
test('shaft and visible grip stay at the palm through every double-pole frame, turn and tuck blend',async()=>{
 for(const animated of [false,true]){const {a}=await fresh(animated);a.position.set(90,30,-200);a.rotation.set(.25,1.3,-.2);for(let i=0;i<360;i++){updateAthletePose(a,{speed:12,poling:1,polePhase:i/90%1,tuck:(1-Math.cos(i/70))*.5,edgeRoll:Math.sin(i/90)*.7},1/120,()=>30);assertAttached(a);}}
});
test('the full double-pole cycle keeps both wrists outside the shoulders and palm fingers pointing forward / outward',async()=>{
 for(const animated of [false,true]){const {a,rig}=await fresh(animated);for(let i=0;i<=120;i++){updateAthletePose(a,{speed:12,poling:1,polePhase:i/120},0,()=>0);for(const sign of [-1,1]){const suffix=sign>0?'l':'r',hand=rig.bones[`hand_${suffix}`],shoulder=rig.bones[`upperarm_${suffix}`].getWorldPosition(new THREE.Vector3()),p=hand.getWorldPosition(new THREE.Vector3()),fingers=new THREE.Vector3(0,1,0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));assert.ok(sign*(p.x-shoulder.x)>.14,'wrists must not fold across the torso');assert.ok(sign*fingers.x>-.03,'palm fingers must not point inward');assert.ok(fingers.z>.45,'fingers should point forward during the pole stroke');}}}
});
test('final player clip-to-grab transitions update equipment after the blended arm pose',async()=>{
 const {a}=await fresh();for(let i=0;i<240;i++){updateAthletePose(a,{speed:12,airborne:i>40&&i<190,grab:i>75&&i<140?.9:0,poling:i<40?1:0,polePhase:i/90%1,flightTime:i/120,airVy:i<120?4:-4,airClearance:2},1/120,()=>0);assertAttached(a);}
});
test('staggered NPC targets cannot detach poles on any intermediate rendered frame',async()=>{
 const {a}=await fresh();updateAthletePose(a,{speed:10,poling:1,polePhase:0},0,()=>0);
 for(let i=0;i<240;i++){a.position.z+=.08;a.rotation.y+=.002;if(i%8===0)targetNpcPose(a,()=>updateAthletePose(a,{speed:10,poling:1,polePhase:i/120%1,edgeRoll:Math.sin(i/70)*.5},8/120,()=>0));blendNpcPose(a,1/120);assertAttached(a);}
});
test('crouched aerodynamic posture keeps hands on their own sides rather than reaching inward',async()=>{
 const {a,rig}=await fresh();for(const pole of [0,.25,.5,.75,1]){updateAthletePose(a,{speed:20,tuck:1,poling:pole,polePhase:.3},0,()=>0);for(const sign of [-1,1]){const side=sign>0?'l':'r',w=rig.bones[`hand_${side}`].getWorldPosition(new THREE.Vector3()),shoulder=rig.bones[`upperarm_${side}`].getWorldPosition(new THREE.Vector3());assert.ok(sign*(w.x-shoulder.x)>.025);}assertAttached(a);}
});
function assertElbowsOutside(a,rig){
 const q=rig.bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get('spine_03').q.clone().invert()),right=new THREE.Vector3(1,0,0).applyQuaternion(q),up=new THREE.Vector3(0,1,0).applyQuaternion(q);
 for(const sign of [-1,1]){const side=sign>0?'l':'r',shoulder=rig.bones[`upperarm_${side}`].getWorldPosition(new THREE.Vector3()),elbow=rig.bones[`lowerarm_${side}`].getWorldPosition(new THREE.Vector3()),delta=elbow.sub(shoulder),outside=delta.dot(right)*sign;assert.ok(outside>.055,`${side} elbow collapsed inward: ${outside}`);assert.ok(delta.dot(up)<.01,'elbow must not pop above the shoulder');}
 assertAttached(a);
}
test('elbows stay outside the chest through the entire pole stroke including its previously collapsed rear phase',async()=>{
 for(const animated of [false,true]){const {a,rig}=await fresh(animated);for(let i=0;i<=240;i++){updateAthletePose(a,{speed:12,poling:1,polePhase:i/240},0,()=>0);assertElbowsOutside(a,rig);}}
});
test('torso-relative elbow clearance survives tuck, carve, counter-rotation and continuous clip blends',async()=>{
 for(const animated of [false,true]){const {a,rig}=await fresh(animated);a.position.set(100,60,-200);a.rotation.set(.2,1.4,-.18);for(let i=0;i<480;i++){const bank=Math.sin(i/60)*.9;updateAthletePose(a,{speed:16,vx:0,vz:16,heading:0,downhillHeading:Math.sin(i/90)*.7,edgeRoll:bank,tuck:(1-Math.cos(i/70))*.5,poling:(1+Math.sin(i/50))*.5,polePhase:i/90%1},1/120,()=>60);assertElbowsOutside(a,rig);}}
});
test('interpolated NPC elbows remain outside the torso and do not flip between delayed targets',async()=>{
 const {a,rig}=await fresh();updateAthletePose(a,{speed:10,poling:1,polePhase:0},0,()=>0);let previous;
 for(let i=0;i<360;i++){if(i%8===0)targetNpcPose(a,()=>updateAthletePose(a,{speed:10,poling:1,polePhase:i/120%1,tuck:(1-Math.cos(i/90))*.5,edgeRoll:Math.sin(i/80)*.7},8/120,()=>0));blendNpcPose(a,1/120);assertElbowsOutside(a,rig);const q=rig.bones.lowerarm_l.getWorldQuaternion(new THREE.Quaternion());if(previous)assert.ok(q.angleTo(previous)<.25,'interpolated elbow flip');previous=q;}
});

function assertHandClearance(a,rig,min=.13){const q=rig.bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get('spine_03').q.clone().invert()),right=new THREE.Vector3(1,0,0).applyQuaternion(q);for(const sign of [-1,1]){const side=sign>0?'l':'r',shoulder=rig.bones[`upperarm_${side}`].getWorldPosition(new THREE.Vector3()),hand=rig.bones[`hand_${side}`].getWorldPosition(new THREE.Vector3());assert.ok(hand.sub(shoulder).dot(right)*sign>min,`${side} hand folded inside lateral clearance`);}assertAttached(a);}
test('actual W-held skiing keeps both hands outside the chest through steering, pole strokes and release',async()=>{for(const animated of [false,true]){const {a,rig}=await fresh(animated),s={...createSkier({x:0,z:0},{x:0,z:1}),vz:16,speed:16};for(let i=0;i<960;i++){stepSkier(s,{tuck:i>30&&i<840?1:0,steer:i<180?0:Math.floor(i/180)%2?1:-1,pole:i>=480&&i<650},{gradient:()=>({x:0,z:0})},1/120);a.position.set(s.x,0,s.z);a.rotation.y=s.heading;updateAthletePose(a,{...s,downhillHeading:0},1/120,()=>0);assertHandClearance(a,rig);}}});
test('NPC rendered interpolation preserves open hands during full tuck and alternating arcs',async()=>{const {a,rig}=await fresh();updateAthletePose(a,{speed:16,tuck:1},0,()=>0);for(let i=0;i<360;i++){if(i%8===0)targetNpcPose(a,()=>updateAthletePose(a,{speed:16,tuck:1,edgeRoll:Math.sin(i/70)*.9,poling:i>150&&i<250?1:0,polePhase:i/90%1},8/120,()=>0));blendNpcPose(a,1/120);assertHandClearance(a,rig,.115);}});
