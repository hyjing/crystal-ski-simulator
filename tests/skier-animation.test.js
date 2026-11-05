import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {advanceTurnPlant} from '../src/skier-animation.js';
import {createAthleteRig,updateAthletePose} from '../src/athlete.js';
const step=1/120;
function completedTurn(state,side=1){const s={turn:side,steerInput:side,edgeRoll:side*.45,heading:0,speed:8,poling:0,vx:0,vz:8};for(let i=0;i<60;i++){s.heading-=side*.006;advanceTurnPlant(state,s,step);}return s;}
test('release, holding one arc, and same-side re-engagement never plant a pole',()=>{
 const state={},s=completedTurn(state);assert.ok(!state.active);for(let i=0;i<180;i++){s.heading-=.006;advanceTurnPlant(state,s,step);assert.equal(state.contactStarted,false);}
 s.turn=s.steerInput=0;s.edgeRoll=0;for(let i=0;i<20;i++){advanceTurnPlant(state,s,step);assert.ok(!state.active);}s.turn=s.steerInput=1;for(let i=0;i<60;i++){s.heading-=.006;advanceTurnPlant(state,s,step);assert.equal(state.contactStarted,false);}
});
test('linked left/right turns touch the new inside pole once, near edge change',()=>{
 for(const oldSide of [-1,1]){const state={},s=completedTurn(state,oldSide);s.turn=s.steerInput=-oldSide;let events=0,frames=0,contactTime=0;
  for(let i=0;i<90;i++){s.heading+=oldSide*.006;s.edgeRoll=oldSide*.45*(1-Math.min(2,i/6));advanceTurnPlant(state,s,step);if(state.contactStarted){events++;contactTime=i*step;assert.equal(state.plantSide,oldSide);}frames+=Number(state.contact);}
  assert.equal(events,1);assert.ok(contactTime>=.05&&contactTime<=.15);assert.ok(frames>=5&&frames<=10);assert.equal(state.active,false);assert.equal(s.vz,8);
 }
});
test('opposite taps without completed turns and long straight gaps do not create random plants',()=>{
 const state={},s={turn:1,steerInput:1,edgeRoll:.1,heading:0,speed:8,poling:0};for(let i=0;i<100;i++){s.turn=s.steerInput=i%2?1:-1;s.edgeRoll=s.turn*.1;s.heading+=.001;advanceTurnPlant(state,s,step);assert.equal(state.contactStarted,false);}
 const settled={},a=completedTurn(settled);a.turn=a.steerInput=0;for(let i=0;i<120;i++)advanceTurnPlant(settled,a,step);a.turn=a.steerInput=-1;a.edgeRoll=-.4;for(let i=0;i<30;i++){advanceTurnPlant(settled,a,step);assert.equal(settled.contactStarted,false);}
});
test('a short neutral edge release can link turns, but Shift and stopping cancel the gesture',()=>{
 const state={},s=completedTurn(state);s.turn=s.steerInput=0;s.edgeRoll=0;for(let i=0;i<12;i++)advanceTurnPlant(state,s,step);s.turn=s.steerInput=-1;s.edgeRoll=-.1;advanceTurnPlant(state,s,step);assert.equal(state.active,true);s.poling=1;advanceTurnPlant(state,s,step);assert.equal(state.active,false);
 s.poling=0;s.speed=0;s.turn=s.steerInput=1;advanceTurnPlant(state,s,step);s.turn=s.steerInput=-1;advanceTurnPlant(state,s,step);assert.ok(!state.active);
});
test('a pending touch is cancelled if the opposite input is released before edge change',()=>{
 const state={},s=completedTurn(state);s.turn=s.steerInput=-1;advanceTurnPlant(state,s,step);s.turn=s.steerInput=0;s.edgeRoll=0;advanceTurnPlant(state,s,step);assert.equal(state.active,false);assert.equal(state.contact,false);
});
test('the articulated cloth pose stays finite and the linked-turn pole touches the snow',()=>{
 const scene=new THREE.Scene(),rig=createAthleteRig(scene),s={turn:1,steerInput:1,edgeRoll:.4,heading:0,speed:8,poling:0,tuck:0,edgeAngle:.4,polePhase:0};rig.position.set(10,2,20);
 for(let i=0;i<60;i++){s.heading-=.006;updateAthletePose(rig,s,step,()=>2);}s.turn=s.steerInput=-1;s.edgeRoll=-.1;let touched=false;
 for(let i=0;i<90;i++){s.heading+=.006;updateAthletePose(rig,s,step,()=>2);if(rig.userData.poleContact){assert.ok(Math.abs(rig.userData.poleContact.y-2.025)<1e-8);touched=true;}}
 assert.equal(touched,true);for(const limb of [...rig.userData.arms,...rig.userData.legs])for(const value of limb.mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
});

test('a short frame hitch still presents one contact frame, without a duplicate touch',()=>{
 for(const frame of [1/60,1/30,.1]){const state={},s=completedTurn(state);s.turn=s.steerInput=-1;s.edgeRoll=-.1;let events=0,visible=0;
  for(let i=0;i<Math.ceil(.8/frame);i++){advanceTurnPlant(state,s,frame);events+=Number(state.contactStarted);visible+=Number(state.contact);}
  assert.equal(events,1);assert.ok(visible>=1);
 }
});
