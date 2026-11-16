import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PatrolRun} from '../src/patrol-mode.js';
import {ChaseTrailEffects} from '../src/chase-trail-effects.js';
import {layTrails,trailContact} from '../src/chase-trails.js';
import {createChaseMountain} from '../src/chase-mountain.js';
import {addWhitepeakBackdrop} from '../src/scenery.js';

const route={points:[{x:0,z:0},{x:0,z:3200}],length:3200,spawn:{distance:35}};
const surface=()=>0;
const player={x:0,z:100,vx:0,vz:22,heading:0,speed:22};
const makePursuer=(x,z,options={})=>({x,z,heading:0,speed:14,health:100,bank:0,...options});

test('avalanche leads a rear pursuer and corrects the impact within its original area',()=>{
  const run=new PatrolRun(route,()=>true,()=>false);
  const rear=makePursuer(-8,46),guard=makePursuer(0,65,{guardUntil:3}),ahead=makePursuer(0,120);
  run.agents=[rear,guard,ahead];run.inventory=['avalanche'];run.stars=1;
  assert.ok(run.use(player));
  const bomb=run.bombs[0];
  assert.equal(bomb.target,rear);
  assert.equal(bomb.end.x,-8);
  assert.ok(bomb.end.z>rear.z&&bomb.end.z<60);
  rear.z+=12;
  const blast=[];
  run.step(.6,player,()=>false,surface,()=>null,value=>blast.push(value)&&null);
  assert.equal(blast.length,1);
  assert.ok(Math.abs(blast[0].z-rear.z)<2);
});

test('trails follow the real path, catch a fast crossing, and break across airtime',()=>{
  const writer={flametrail:{last:{x:0,z:0},linger:4.5,extra:0}};
  const segments=layTrails([],writer,{x:0,z:10},.1);
  assert.equal(segments.length,3);
  assert.ok(trailContact(segments,{x:-10,z:5},{x:10,z:5},surface).flametrail);
  const crossed=layTrails(segments,writer,{x:0,z:23,airborne:true},.2);
  assert.equal(crossed.length,3);
  assert.equal(layTrails(crossed,writer,{x:0,z:23},4.7).length,0);
  const view=new ChaseTrailEffects(new THREE.Group());
  view.update(segments,surface,.2);
  assert.equal(view.layers.flametrail.plume.count,3);
  assert.equal(view.layers.frosttrail.ribbon.count,0);
  view.update([],surface,5);
  assert.equal(view.layers.flametrail.plume.count,0);
});

test('frost and fire trigger a one-time thermal hit, and mirage feeds a separate follow-up',()=>{
  const run=new PatrolRun(route,()=>true,()=>false);
  const target=makePursuer(0,106);
  run.agents=[target];run.stars=1;
  run.inventory=['frosttrail','flametrail','miragetrail'];
  assert.ok(run.use(player));
  run.step(.11,{...player,z:109},()=>false);
  assert.equal(target.health,90);
  assert.ok(target.chillUntil>run.time);
  assert.ok(run.use(player));
  run.step(.11,{...player,z:109},()=>false);
  assert.equal(target.chillUntil,0);
  assert.equal(target.health,66);
  assert.equal(run.hits.at(-1).combo,'融裂');
  run.step(1.01,{...player,z:109},()=>false);
  assert.equal(target.health,58);
  assert.ok(run.use(player));
  run.step(.11,{...player,z:109},()=>false);
  assert.ok(target.mirage?.until>run.time);
  assert.ok(Math.abs(target.mirage.point.x)>8);
  assert.equal(target.health,49);
  assert.equal(run.damage(target,'autofrost',15),'hit');
  assert.equal(target.health,22);
  assert.equal(run.hits.at(-1).combo,'破幻');
  assert.equal(target.mirage,null);
});

test('Whitepeak has a broad skyline and vertex-colored distant snowfields',()=>{
  const {terrain,context}=createChaseMountain();
  assert.ok((context.width-1)*context.spacing>=32000);
  assert.ok(context.heights.some(elevation=>elevation>4200));
  const backdrop=addWhitepeakBackdrop(new THREE.Scene(),context,terrain);
  assert.equal(backdrop.material.vertexColors,true);
  const colors=backdrop.geometry.attributes.color;
  assert.equal(colors.count,backdrop.geometry.attributes.position.count);
  assert.ok(colors.array.every(Number.isFinite));
  assert.ok(colors.array.some(color=>color>.85)&&colors.array.some(color=>color<.3));
});
