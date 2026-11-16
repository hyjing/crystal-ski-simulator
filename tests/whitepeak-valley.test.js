import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createChaseMountain} from '../src/chase-mountain.js';
import {addWhitepeakValley,lodgeForestClearings} from '../src/whitepeak-valley.js';
import {riverZ,riverLevel,riverHalfWidth,valleyRoadZ} from '../src/whitepeak-valley-layout.js';
import {StructureWorld} from '../src/structure-collision.js';

test('the valley river has dry banks and wood lodges leave the finish lanes clear',()=>{
  const {terrain,routes,lodges}=createChaseMountain();
  for(const x of [-2000,-460,0,1700,2250]){
    const z=riverZ(x),water=riverLevel(x);
    assert.ok(terrain.surface(x,z)<water-3);
    assert.ok(terrain.surface(x,z-riverHalfWidth(x)-34)>water+2);
    assert.ok(terrain.surface(x,valleyRoadZ(x))>water);
  }

  const scene=new THREE.Scene();
  const {river,road}=addWhitepeakValley(scene,terrain,lodges,routes);
  assert.ok(river.length>70&&road.length===river.length);
  const structures=new StructureWorld(scene);
  assert.ok(lodges.length>=18);
  assert.equal(lodgeForestClearings(lodges).length,lodges.length);
  for(const p of lodges)assert.ok(structures.blocked(p.x,p.z,terrain.surface(p.x,p.z)));
  for(const route of routes){
    const finish=route.points.at(-1);
    assert.equal(structures.blocked(finish.x,finish.z,terrain.surface(finish.x,finish.z)),false);
    assert.ok(Math.hypot(...Object.values(terrain.gradient(finish.x,finish.z)))<.08);
    assert.ok(lodges.some(p=>Math.abs(p.x-finish.x)<65&&p.z>finish.z+150));
  }
  const riverMesh=scene.getObjectByName('Meltwater river');
  assert.ok(riverMesh.geometry.attributes.normal.getY(0)>.99);
  scene.traverse(object=>{
    if(object.geometry)assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
  });
});
