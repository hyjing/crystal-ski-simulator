import test from 'node:test';import assert from 'node:assert/strict';
import {createSkier,stepSkier} from '../src/physics.js';import {stepAirborne,landingQuality} from '../src/airborne.js';import {recoverLook} from '../src/camera-look.js';
const flat={surface:()=>1500,gradient:()=>({x:0,z:0}),spacing:1},fresh=()=>({...createSkier({x:0,z:0},{x:0,z:1}),vz:12,speed:12});
test('ground-only motion retains the existing ski controller',()=>{const a=fresh(),b=fresh();for(let i=0;i<120;i++){const input={steer:i<60?.5:-.4,edge:0,pole:false};stepSkier(a,input,flat,1/120);stepAirborne(b,input,flat,1/120);}for(const k of ['x','z','vx','vz','heading','speed'])assert.equal(a[k],b[k]);assert.ok(!b.airborne);});
test('a convex crest causes natural ballistic takeoff without a jump key',()=>{const h=z=>1500+2*Math.exp(-z*z/8),terrain={surface:(_,z)=>h(z),gradient:(_,z)=>({x:0,z:-z*.5*Math.exp(-z*z/8)}),spacing:1},s=fresh();s.z=-2;s.vz=s.speed=16;let tookOff=false;for(let i=0;i<240;i++){stepAirborne(s,{},terrain,1/120);if(s.airborne){tookOff=true;break;}}assert.ok(tookOff);assert.ok(s.airVy>0);assert.ok(s.airY>terrain.surface(s.x,s.z));});
test('air tricks rotate the skier without steering horizontal momentum',()=>{const a=fresh(),b=fresh();stepAirborne(a,{jump:true},flat,1/120);stepAirborne(b,{jump:true},flat,1/120);for(let i=0;i<22;i++){stepAirborne(a,{spin:1,grab:true,steer:1,edge:1,pole:true},flat,1/120);stepAirborne(b,{},flat,1/120);}assert.ok(a.airborne&&a.trickYaw>.5&&a.grab>.7);assert.equal(a.vx,b.vx);assert.equal(a.vz,b.vz);assert.equal(a.poling,0);});
test('a hop returns to the ground once, awards a clean landing and cannot repeat while held',()=>{const s=fresh();let landings=0;for(let i=0;i<240;i++){stepAirborne(s,{jump:true},flat,1/120);if(s.airEvent?.type==='land')landings++;}assert.equal(landings,1);assert.equal(s.airborne,false);assert.ok(s.freestyleScore>=50);assert.equal(s.airY,1500);});
test('landing accepts aligned switch landings but rejects sideways or hard impact',()=>{assert.equal(landingQuality(Math.PI,0,3).clean,true);assert.equal(landingQuality(Math.PI,0,3).switchLanding,true);assert.equal(landingQuality(Math.PI/2,0,3).clean,false);assert.equal(landingQuality(0,0,9).clean,false);const s={...fresh(),airborne:true,airY:1500.01,airVy:-4,flightTime:.5,trickYaw:Math.PI/2,spinRate:0,grab:0,grabTime:0,launchHeight:1500,airPeak:1};stepAirborne(s,{},flat,1/120);assert.equal(s.airEvent.type,'crash');assert.ok(s.crashRemaining>0);assert.equal(s.speed,0);});
test('mouse look waits after release and smoothly returns by the shortest angle',()=>{assert.deepEqual(recoverLook(1,.2,1,1/60,true),{yaw:1,pitch:.2});assert.deepEqual(recoverLook(1,.2,3,1/60,false),{yaw:1,pitch:.2});let yaw=5.8,pitch=.3;for(let i=0;i<240;i++){const next=recoverLook(yaw,pitch,2,1/60,true);yaw=next.yaw;pitch=next.pitch;}assert.ok(Math.abs(yaw)<.002&&Math.abs(pitch)<.002);});

test('gameplay jump gives a useful trick window on flat and moderate slopes without adding horizontal speed',()=>{
 for(const grade of [0,-.27])for(const speed of [6,12,22]){
  const terrain={surface:(_,z)=>1500+grade*z,gradient:()=>({x:0,z:grade}),spacing:1},s={...fresh(),vz:speed,speed};let peak=0,event;
  stepAirborne(s,{jump:true},terrain,1/120);assert.ok(s.airborne);assert.ok(s.vz<=speed);
  for(let i=0;i<240&&s.airborne;i++){stepAirborne(s,{},terrain,1/120);peak=Math.max(peak,s.airY-terrain.surface(s.x,s.z));if(s.airEvent?.type==='land'||s.airEvent?.type==='crash')event=s.airEvent;}
  assert.equal(event?.type,'land',`grade ${grade} speed ${speed}`);assert.ok(event.airTime>1&&event.airTime<1.5);assert.ok(peak>1.3&&peak<2.5);
 }
});

test('assisted pop allows a controlled 360 plus grab and a clean landing',()=>{
 const s=fresh();stepAirborne(s,{jump:true},flat,1/120);let landing;
 for(let i=0;i<240&&s.airborne;i++){stepAirborne(s,{spin:i<96?1:0,grab:true},flat,1/120);if(s.airEvent)landing=s.airEvent;}
 assert.equal(landing?.type,'land');assert.equal(landing.rotation,360);assert.equal(landing.grab,true);assert.equal(s.freestyleScore,450);
});
test('small DEM-scale bumps are absorbed without repeated micro takeoffs or free points',()=>{
 for(const spacing of [1,5,7.4])for(const amplitude of [.05,.10]){
  const h=z=>1500-.10*z+amplitude*Math.exp(-z*z/2),terrain={surface:(_,z)=>h(z),gradient:(_,z)=>({x:0,z:-.10-amplitude*z*Math.exp(-z*z/2)}),spacing},s={...fresh(),z:-8,vz:16,speed:16};let takeoffs=0;
  for(let i=0;i<360;i++){stepAirborne(s,{},terrain,1/120);if(s.airEvent?.type==='takeoff')takeoffs++;}assert.equal(takeoffs,0,`spacing ${spacing}, amplitude ${amplitude}`);assert.equal(s.freestyleScore,0);
 }
});
test('a real convex launch stays airborne meaningfully instead of immediately recontacting',()=>{
 const h=z=>1500+2*Math.exp(-z*z/8),terrain={surface:(_,z)=>h(z),gradient:(_,z)=>({x:0,z:-z*.5*Math.exp(-z*z/8)}),spacing:1},s={...fresh(),z:-2,vz:16,speed:16};let count=0,landing;
 for(let i=0;i<480;i++){stepAirborne(s,{},terrain,1/120);if(s.airEvent?.type==='takeoff')count++;if(s.airEvent?.type==='land'||s.airEvent?.type==='crash')landing=s.airEvent;}
 assert.equal(count,1);assert.ok(landing);assert.ok(landing.airTime>.3);assert.equal(s.airborne,false);
});
test('a sharp rising approach cannot trigger an immediate one-frame false launch',()=>{
 const h=z=>1500-.1*z+2*Math.exp(-z*z/2),terrain={surface:(_,z)=>h(z),gradient:(_,z)=>({x:0,z:-.1-2*z*Math.exp(-z*z/2)}),spacing:5},s={...fresh(),z:-8,vz:16,speed:16};let landing;
 for(let i=0;i<720;i++){stepAirborne(s,{},terrain,1/120);if(s.airEvent?.type==='land'||s.airEvent?.type==='crash')landing=s.airEvent;}
 assert.ok(landing);assert.ok(landing.airTime>.3);
});

test('manual jump requires 18 km/h and reports slow presses without launching later from a held button',()=>{for(const speed of [0,3,4.9]){const s={...fresh(),vz:speed,speed};stepAirborne(s,{jump:true},flat,1/120);assert.ok(!s.airborne);assert.equal(s.airEvent?.type,'jump-blocked');s.vz=s.speed=12;stepAirborne(s,{jump:true},flat,1/120);assert.ok(!s.airborne);}const s={...fresh(),vz:5,speed:5};stepAirborne(s,{jump:true},flat,1/120);assert.equal(s.airborne,true);});
test('a convex crest stays grounded below the natural launch speed even on an otherwise valid jump feature',()=>{const h=z=>1500+2*Math.exp(-z*z/8),terrain={surface:(_,z)=>h(z),gradient:(_,z)=>({x:0,z:-z*.5*Math.exp(-z*z/8)}),spacing:1};for(const speed of [5,8,11.9]){const s={...fresh(),z:-5,vz:speed,speed};for(let i=0;i<240;i++){s.vx=0;s.vz=s.speed=speed;stepAirborne(s,{},terrain,1/120);assert.ok(!s.airborne,`speed ${speed}`);}}});
test('straight planar descents never auto-launch at any tested speed',()=>{for(const grade of [-.1,-.3,-.6])for(const speed of [12,20,35]){const terrain={surface:(_,z)=>1500+grade*z,gradient:()=>({x:0,z:grade}),spacing:5},s={...fresh(),vz:speed,speed};for(let i=0;i<240;i++){stepAirborne(s,{},terrain,1/120);assert.ok(!s.airborne);}}});
