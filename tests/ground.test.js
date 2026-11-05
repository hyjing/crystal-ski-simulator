import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTerrain} from '../src/terrain.js';
import {addDetailedGround} from '../src/ground.js';

test('all ground LODs share fine edge heights and identical normals, with no skirt shading seam',()=>{
 const width=129,height=129,spacing=5,heights=Float32Array.from({length:width*height},(_,i)=>1400+Math.sin(i%width*.12)*8+Math.cos(Math.floor(i/width)*.08)*10);
 const scene=new THREE.Scene();addDetailedGround(scene,createTerrain({width,height,spacing,heights}),{capabilities:{getMaxAnisotropy:()=>1}});
 const lod=scene.children[0],edges=lod.levels.map(({object})=>{
  const p=object.geometry.attributes.position,n=object.geometry.attributes.normal,out=new Map();
  for(let i=0;i<p.count;i++)if(Math.abs(Math.abs(p.getX(i))-320)<.001||Math.abs(Math.abs(p.getZ(i))-320)<.001)out.set(`${p.getX(i)},${p.getZ(i)}`,[p.getY(i),n.getX(i),n.getY(i),n.getZ(i)]);
  return out;
 });
 for(const edge of edges.slice(1)){assert.equal(edge.size,edges[0].size);for(const [key,values] of edges[0])assert.deepEqual(edge.get(key),values,key);}
});
