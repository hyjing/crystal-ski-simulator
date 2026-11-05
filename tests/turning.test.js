import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkier,stepSkier} from '../src/physics.js';
import {advanceTurnPlant} from '../src/skier-animation.js';
const flat={gradient:()=>({x:0,z:0})},dt=1/120;
const moving=()=>Object.assign(createSkier({x:0,z:0},{x:0,z:1}),{vz:12,speed:12});
test('a normal banked turn builds sideways world velocity with little ski-relative drift',()=>{
 const s=moving();for(let i=0;i<180;i++)stepSkier(s,{steer:1},flat,dt);
 assert.ok(s.x<-4&&s.vx<-5,'the actual trajectory must curve sideways');assert.ok(s.z>12&&s.vz>5);assert.ok(s.speed>10,'a supported turn must not throw away momentum');
 assert.ok(s.slip<.15);assert.ok(Math.abs(Math.atan2(s.vx,s.vz)-s.heading)<.03);
});
test('changing sides flattens the edge and retains existing lateral momentum',()=>{
 const s=moving();for(let i=0;i<120;i++)stepSkier(s,{steer:1},flat,dt);const previous={vx:s.vx,vz:s.vz,roll:s.edgeRoll};
 stepSkier(s,{steer:-1},flat,dt);assert.ok(s.vx<0);assert.ok(Math.hypot(s.vx-previous.vx,s.vz-previous.vz)<.15,'velocity cannot snap to the opposite side');
 let crosses=0,last=s.edgeRoll;for(let i=0;i<35;i++){stepSkier(s,{steer:-1},flat,dt);if(last>0&&s.edgeRoll<=0)crosses++;last=s.edgeRoll;}
 assert.equal(crosses,1);assert.ok(s.edgeRoll<-.4);
});
test('banking changes direction without creating kinetic energy on an inclined plane',()=>{
 const gx=.15,gz=-.35,terrain={gradient:()=>({x:gx,z:gz})},s=moving(),initial=.5*(s.vz*s.vz+(gz*s.vz)**2);
 for(let i=0;i<120*12;i++){stepSkier(s,{steer:Math.floor(i/240)%2?1:-1},terrain,dt);const released=-9.81*(gx*s.x+gz*s.z);assert.ok(.5*s.speed*s.speed<=initial+released+.05);}
});
test('actual linked ski turns plant once near the signed edge crossover, and release alone never plants',()=>{
 const s=moving(),gesture={};let contacts=0,time;
 for(let i=0;i<120;i++){stepSkier(s,{steer:1},flat,dt);advanceTurnPlant(gesture,s,dt);assert.equal(gesture.contactStarted,false);}
 for(let i=0;i<90;i++){stepSkier(s,{steer:-1},flat,dt);advanceTurnPlant(gesture,s,dt);if(gesture.contactStarted){contacts++;time=i*dt;assert.ok(s.edgeRoll<.04);assert.equal(gesture.plantSide,1);}}
 assert.equal(contacts,1);assert.ok(time>=.05&&time<=.18);
 for(let i=0;i<180;i++){stepSkier(s,{steer:0},flat,dt);advanceTurnPlant(gesture,s,dt);assert.equal(gesture.contactStarted,false);}
});
