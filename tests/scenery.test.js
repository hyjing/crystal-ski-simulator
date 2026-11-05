import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {lonLatToUTM} from '../src/terrain.js';
import {addContextTerrain,addRainierTerrain,distantGeometry} from '../src/scenery.js';
const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}.json`,import.meta.url)));
const local=read('crystal-dem'),rainier=read('rainier-dem'),context=read('context-dem');

test('Rainier summit lies at the real geographic location with metric elevation',()=>{
  const scene=new THREE.Scene();addRainierTerrain(scene,rainier,local);
  const peak=scene.userData.rainierPeak,real=lonLatToUTM(-121.7603,46.8523);
  const e=local.originUTM[0]+(local.width-1)*local.spacing/2+peak.x;
  const n=local.originUTM[1]-(local.height-1)*local.spacing/2-peak.z;
  assert.ok(Math.hypot(real.e-e,real.n-n)<500,'DEM summit must align with Rainier, not an arbitrary backdrop');
  assert.ok(peak.y+1200>4300&&peak.y+1200<4450);
  assert.ok(rainier.spacing<40);
});

test('both aerial textures cover the DEM pixel edges in the same projected CRS',()=>{
  for(const [name,grid] of [['rainier',rainier],['context',context]]){
    const {extent}=read(`${name}-aerial`),s=grid.spacing,[x,y]=grid.originUTM;
    for(const [a,b] of [[extent.xmin,x-s/2],[extent.xmax,x+(grid.width-.5)*s],[extent.ymax,y+s/2],[extent.ymin,y-(grid.height-.5)*s]])assert.ok(Math.abs(a-b)<.1,`${name} aerial registration`);
  }
});

test('detailed summit and valley patches stay within a bounded 300k far-terrain budget',()=>{
  const scene=new THREE.Scene();
  const a=addContextTerrain(scene,context,local,undefined,rainier),b=addRainierTerrain(scene,rainier,local);
  const triangles=(a.geometry.index.count+b.geometry.index.count)/3;
  assert.ok(triangles<300000);
  assert.ok(scene.userData.rainierPeak.x<-10000&&scene.userData.rainierPeak.z>5000,'Rainier is southwest of Crystal');
});

test('fine distant terrain patches stitch to coarse terrain without interior boundary edges',()=>{
 for(const width of [17,705]){
 const grid={width,height:17,spacing:36,originUTM:[0,0],heights:Array.from({length:width*17},(_,i)=>1500+Math.sin(i)*20)},g=distantGeometry(grid,grid,[],{x:0,z:0,halfX:110,halfZ:110}),p=g.attributes.position,edges=new Map();
 for(let i=0;i<g.index.count;i+=3){const tri=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);}}
 for(const [key,n] of edges){assert.ok(n<=2);if(n===1){const [a,b]=key.split(',').map(Number);assert.ok((Math.abs(p.getX(a))===(width-1)*18&&p.getX(a)===p.getX(b))||(Math.abs(p.getZ(a))===288&&p.getZ(a)===p.getZ(b)),'unpaired edges may only lie on the outer tile boundary');}}
 }

});
