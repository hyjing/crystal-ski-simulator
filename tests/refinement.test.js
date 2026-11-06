import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSkier,stepSkier} from '../src/physics.js';
import {stableShadowTarget,stableTreeShadowGeometry,createStableShadowBatch} from '../src/render-stability.js';
import {addForest} from '../src/resort.js';
import {createTerrain} from '../src/terrain.js';
import {createAthleteRig,updateAthletePose} from '../src/athlete.js';
import {attachHumanoid,upperBodyCounterAngle} from '../src/humanoid.js';
import {detailedChair,detailedCabin,towerAccessories} from '../src/resort-assets.js';
test('holding a turn progressively banks and tightens the actual path',()=>{
 const s=createSkier({x:0,z:0},{x:0,z:1});s.vz=s.speed=12;const flat={gradient:()=>({x:0,z:0})};
 let early;for(let i=0;i<180;i++){stepSkier(s,{steer:1},flat,1/120);if(i===29)early=s.edgeAngle;}
 assert.ok(s.edgeAngle>early+.4);assert.ok(s.edgeAngle>.95);assert.ok(Math.abs(s.heading)>1.0);const bank=s.edgeAngle;stepSkier(s,{steer:-1},flat,1/120);assert.ok(s.turnHold<.02);assert.ok(s.edgeAngle>bank*.6,'reversal must not snap the skis upright');
});
test('moving the focus within a shadow texel preserves the light-space grid',()=>{
 const d=new THREE.Vector3(-.5,.8,.3).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),d).normalize(),up=new THREE.Vector3().crossVectors(d,right).normalize();
 const a=stableShadowTarget(new THREE.Vector3(),d,480,3072),b=stableShadowTarget(right.clone().multiplyScalar(.01).addScaledVector(up,.01),d,480,3072);
 assert.ok(Math.abs(a.dot(right)-b.dot(right))<1e-10);assert.ok(Math.abs(a.dot(up)-b.dot(up))<1e-10);
});
test('forest topology and instance transforms are static across camera movement',()=>{
 const scene=new THREE.Scene(),terrain=createTerrain({width:5,height:5,spacing:100,originUTM:[0,500],heights:new Float32Array(25).fill(1500)}),extent={xmin:0,xmax:400,ymin:100,ymax:500},vegetation={extent,imageSize:[64,64],pixels:[[16,16,1],[32,32,1],[48,48,1]]};
 const trees=addForest(scene,terrain,[],{},new THREE.Texture(),vegetation,[]),before=scene.children.map(m=>Array.from(m.instanceMatrix.array));assert.equal(trees.length,3);assert.equal(trees.updateLOD,undefined);assert.ok(trees.nearby(trees[0].x,trees[0].z).includes(trees[0]));
 const camera=new THREE.PerspectiveCamera();for(let i=0;i<30;i++){camera.position.set(i*5,20,i*3);camera.updateMatrixWorld();scene.updateMatrixWorld(true);}
 assert.deepEqual(scene.children.map(m=>Array.from(m.instanceMatrix.array)),before);assert.ok(scene.children.some(m=>m.name==='Fixed snowy fir canopy'));assert.ok(scene.children.some(m=>m.name==='Stable forest shadow proxy'));
});
test('the checked-in humanoid has a real skeleton, deforms finitely and counter-rotates its shoulders towards downhill',async()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const actor=createAthleteRig(new THREE.Scene()),rig=attachHumanoid(actor,gltf.scene);assert.ok(Object.keys(rig.bones).length>50);assert.ok(rig.model.getObjectByName('SuperHero_Male').isSkinnedMesh);
 const suit=rig.model.getObjectByName('Unified_ski_suit');assert.ok(suit?.isSkinnedMesh);
 assert.ok(suit.geometry.index.count/3>40000);assert.ok(rig.model.getObjectByName('Integrated_helmet_and_goggles'));assert.ok(rig.model.getObjectByName('Articulated_ski_boot'));
 actor.rotation.y=.8;const s={speed:12,heading:.8,downhillHeading:0,turn:1,edgeRoll:.8,edgeAngle:.8,tuck:.2,poling:0};updateAthletePose(actor,s,1/60,()=>0);actor.updateMatrixWorld(true);
 const torso=rig.bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get('spine_03').q.clone().invert()),hips=rig.bones.pelvis.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get('pelvis').q.clone().invert());
 const heading=q=>{const f=new THREE.Vector3(0,0,1).applyQuaternion(q);return Math.atan2(f.x,f.z);};assert.ok(Math.abs(heading(torso))<Math.abs(heading(hips))*.5);assert.ok(upperBodyCounterAngle(.8,0)<-.6);
 const expectedFoot=actor.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),s.edgeRoll*.70)).multiply(rig.rest.get('foot_l').q);assert.ok(rig.bones.foot_l.getWorldQuaternion(new THREE.Quaternion()).angleTo(expectedFoot)<1e-6,'boot follows the ski bank');
 rig.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();for(const v of [...o.boundingBox.min,...o.boundingBox.max])assert.ok(Number.isFinite(v));assert.ok(o.boundingBox.max.y<2.1&&o.boundingBox.min.y>-.15);}});
 updateAthletePose(actor,{...s,airborne:true,grab:1,tuck:.85},1/60,()=>0);rig.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();for(const v of [...o.boundingBox.min,...o.boundingBox.max])assert.ok(Number.isFinite(v),'full grab deformation remains finite');}});
});
test('detailed chair, gondola and tower assets have finite merged geometry',()=>{
 for(const g of [...detailedChair(),...detailedCabin(),towerAccessories()]){assert.ok(g&&g.attributes.position.count>0);for(const value of g.attributes.position.array)assert.ok(Number.isFinite(value));}
});

test('forest shadow proxies retain a fixed caster independently of visible LOD fades',()=>{
 const g=stableTreeShadowGeometry(),m=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,fog:false}),proxy=createStableShadowBatch(g,m,12);
 proxy.onBeforeRender();assert.equal(proxy.count,0);proxy.onBeforeShadow();assert.equal(proxy.count,12);proxy.onBeforeRender();assert.equal(proxy.count,0);assert.equal(proxy.castShadow,true);assert.equal(proxy.material.colorWrite,false);assert.ok(!g.attributes.treeBand);
});

test('counter rotation fades out for traversing, uphill travel and standing still',()=>{
 const motion=angle=>({vx:Math.sin(angle)*12,vz:Math.cos(angle)*12,speed:12});
 assert.ok(upperBodyCounterAngle(.6,0,motion(.6))<-.4);
 for(const angle of [Math.PI/2,-Math.PI/2,Math.PI])assert.equal(Math.abs(upperBodyCounterAngle(angle,0,motion(angle))),0);
 assert.equal(Math.abs(upperBodyCounterAngle(.6,0,{vx:0,vz:0,speed:0})),0);
 assert.equal(Math.abs(upperBodyCounterAngle(.6,0,motion(Math.PI/2))),0,'gate uses travel velocity, not just ski heading');
 const angles=Array.from({length:100},(_,i)=>.6+i*.01),values=angles.map(a=>upperBodyCounterAngle(a,0,motion(a)));
 for(let i=1;i<values.length;i++)assert.ok(Math.abs(values[i]-values[i-1])<.04,'smooth transition into traverse');
});

test('the complete ski suit is one closed connected skin with normalized bone weights',async()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const suit=scene.getObjectByName('Unified_ski_suit'),g=suit.geometry,edges=new Map(),adj=Array.from({length:g.attributes.position.count},()=>[]);
 for(let i=0;i<g.index.count;i+=3){const tri=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];assert.equal(new Set(tri).size,3);for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);adj[a].push(b);adj[b].push(a);}}
 for(const n of edges.values())assert.equal(n,2,'outfit surface has no open or nonmanifold seams');
 const visited=new Set(),queue=[0];while(queue.length){const i=queue.pop();if(visited.has(i))continue;visited.add(i);for(const j of adj[i])if(!visited.has(j))queue.push(j);}assert.equal(visited.size,adj.length,'jacket, sleeves and trousers form one connected surface');
 for(let i=0;i<g.attributes.position.count;i++){let sum=0;for(let j=0;j<4;j++){const weight=g.attributes.skinWeight.array[i*4+j];assert.ok(weight>=0);sum+=weight;assert.ok(g.attributes.skinIndex.array[i*4+j]<suit.skeleton.bones.length);}assert.ok(Math.abs(sum-1)<1e-5);}
});

test('the winter outfit has a shaped waist, loose hem, chest volume and skinned garment details',async()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/skier-complete.glb',import.meta.url)),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const suit=scene.getObjectByName('Unified_ski_suit'),p=suit.geometry.attributes.position;
 const widthAt=y=>{let width=0;for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-y)<.008&&Math.abs(p.getX(i))<.30)width=Math.max(width,Math.abs(p.getX(i)));return width;};
 const waist=widthAt(1.14);assert.ok(widthAt(1.30)>waist+.020,'chest must widen visibly above the waist');assert.ok(widthAt(.96)>waist+.020,'loose jacket hem must widen below the waist');
 const details=scene.getObjectByName('Jacket_seams_and_pockets');assert.ok(details?.isSkinnedMesh);assert.equal(details.skeleton.bones[0],suit.skeleton.bones[0]);
});
