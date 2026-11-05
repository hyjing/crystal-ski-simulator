import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {advanceTurnPlant} from '../src/skier-animation.js';
import {createAthleteRig,updateAthletePose} from '../src/athlete.js';
test('a turn-end gesture has one brief contact and recovers, without adding propulsion',()=>{
 const state={},skier={turn:1,heading:0,speed:8,poling:0,vx:0,vz:8};for(let i=0;i<10;i++)advanceTurnPlant(state,skier,1/60);assert.ok(!state.active);
 skier.turn=0;let contacts=0,contactFrames=0;for(let i=0;i<70;i++){advanceTurnPlant(state,skier,1/60);contacts+=Number(state.contactStarted);contactFrames+=Number(state.contact);}assert.equal(contacts,1);assert.ok(contactFrames>=3&&contactFrames<=10);assert.equal(state.active,false);assert.equal(skier.vz,8);
});
test('explicit double-poling cancels the turn-end gesture and stationary skiers do not plant',()=>{
 const state={},s={turn:1,heading:0,speed:8,poling:0};advanceTurnPlant(state,s,.1);s.turn=0;advanceTurnPlant(state,s,.1);assert.equal(state.active,true);s.poling=1;advanceTurnPlant(state,s,.1);assert.equal(state.active,false);
 const idle={};s.poling=0;s.speed=0;s.turn=1;advanceTurnPlant(idle,s,.1);s.turn=0;advanceTurnPlant(idle,s,.1);assert.ok(!idle.active);
});
test('turn-side changes do not move an in-progress gesture to the other hand',()=>{
 const state={},s={turn:1,heading:0,speed:8,poling:0};advanceTurnPlant(state,s,.1);s.turn=0;advanceTurnPlant(state,s,.1);const side=state.plantSide;s.turn=-1;advanceTurnPlant(state,s,.1);assert.equal(state.plantSide,side);
});
test('the articulated cloth pose stays finite and a turn pole touches the supplied snow surface',()=>{
 const scene=new THREE.Scene(),rig=createAthleteRig(scene),s={turn:1,heading:0,speed:8,poling:0,tuck:0,edgeAngle:.4,polePhase:0};rig.position.set(10,2,20);updateAthletePose(rig,s,1/60,()=>2);s.turn=0;let touched=false;
 for(let i=0;i<60;i++){updateAthletePose(rig,s,1/60,()=>2);if(rig.userData.poleContact){assert.ok(Math.abs(rig.userData.poleContact.y-2.025)<1e-8);touched=true;}}
 assert.equal(touched,true);for(const limb of [...rig.userData.arms,...rig.userData.legs])for(const value of limb.mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
});
