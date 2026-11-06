import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';
import {flyDrone} from '../src/drone.js';
import {validRegionalGrid,stitchedRegionalGrid,coarseBackgroundHeight} from '../src/regional-scenery.js';import {distantGeometry,gridBounds,addContextTerrain,addRegionalTerrain,addRainierTerrain} from '../src/scenery.js';
const read=n=>JSON.parse(fs.readFileSync(new URL(`../public/data/${n}.json`,import.meta.url)));
const base={width:17,height:17,spacing:100,originUTM:[0,1600],heights:Array.from({length:17*17},(_,i)=>500+Math.sin(i*.4)*80)};
const region={width:25,height:25,spacing:50,originUTM:[200,1400],heights:new Array(625).fill(900),backgroundPixelBounds:{x0:2,z0:2,x1:14,z1:14,step:2},transitionMeters:150};
test('regional boundaries match the rendered coarse triangles; interior detail stays unchanged',()=>{assert.ok(validRegionalGrid(region,base));const g=stitchedRegionalGrid(region,base);assert.equal(region.heights[0],900);for(let i=0;i<g.width;i++)for(const [x,z] of [[i,0],[i,g.height-1],[0,i],[g.width-1,i]]){const expected=coarseBackgroundHeight(base,g.originUTM[0]+x*g.spacing,g.originUTM[1]-z*g.spacing);assert.ok(Math.abs(g.heights[z*g.width+x]-expected)<.0001);}assert.equal(g.heights[12*g.width+12],900);assert.ok(!validRegionalGrid({...region,originUTM:[205,1400]},base));assert.throws(()=>stitchedRegionalGrid({...region,width:24},base));});
for(const name of ['crystal','snoqualmie'])test(`${name}: regional imagery / terrain registration, detail gain and bounded scenery geometry`,()=>{
 const grid=read(`scenery/${name}/dem`),bg=read(grid.background.slice(0,-5)),meta=read(`scenery/${name}/aerial`),local=read(name==='crystal'?'crystal-dem':'snoqualmie/east/dem');if(name==='snoqualmie')local.treeMinElevation=0;
 assert.ok(validRegionalGrid(grid,bg));assert.ok(grid.heights.every(v=>Number.isFinite(v)&&v>0&&v<5000));assert.ok(grid.spacing<36);assert.ok(Math.max(...grid.heights.slice(0,10000))-Math.min(...grid.heights.slice(0,10000))>100);
 const {extent:e}=meta,s=grid.spacing,[x,y]=grid.originUTM;for(const [a,b] of [[e.xmin,x-s/2],[e.xmax,x+(grid.width-.5)*s],[e.ymax,y+s/2],[e.ymin,y-(grid.height-.5)*s]])assert.ok(Math.abs(a-b)<.1);assert.ok(Math.max(...meta.size)<=3072);assert.ok(meta.tileExtents.length===4);assert.ok(Math.max(...meta.metersPerPixel)<7);
 const old=read(name==='crystal'?'context-aerial':'snoqualmie/context/aerial'),oldSize=old.size||old.imageSize;assert.ok(meta.metersPerPixel[0]<(old.extent.xmax-old.extent.xmin)/oldSize[0]*.6);
 const photo=fs.readFileSync(new URL(`../public/data/scenery/${name}/aerial.jpg`,import.meta.url));assert.equal(photo.readUInt16BE(0),0xffd8);assert.equal(photo.readUInt16BE(photo.length-2),0xffd9);
 const scene=new THREE.Scene(),rainier=name==='crystal'?read('rainier-dem'):undefined,a=addContextTerrain(scene,bg,local,undefined,rainier,grid),b=addRegionalTerrain(scene,grid,bg,local,new THREE.Texture());let triangles=(a.geometry.index.count+b.geometry.index.count)/3;if(rainier)triangles+=addRainierTerrain(scene,rainier,local).geometry.index.count/3;assert.ok(triangles<550000,`${triangles} triangles`);
 const bounds=gridBounds(grid,local),flight=scene.userData.droneTerrain,p=a.geometry.attributes.position;assert.ok(flight.flightBounds.maxX-flight.flightBounds.minX>10000);const drone={x:flight.flightBounds.maxX-1,z:0,y:1200,yaw:Math.PI/2,pitch:0};flyDrone(drone,{forward:1,fast:true},flight,.1);assert.equal(drone.x,flight.flightBounds.maxX);assert.ok(drone.y>=flight.surface(drone.x,drone.z)-1200+5);assert.ok(Math.abs(flight.surface(0,0)-(local.heights[Math.floor(local.height/2)*local.width+Math.floor(local.width/2)]))<1);
for(let i=0;i<a.geometry.index.count;i+=3){let cx=0,cz=0;for(let k=0;k<3;k++){const v=a.geometry.index.getX(i+k);cx+=p.getX(v)/3;cz+=p.getZ(v)/3;}assert.ok(!(cx>bounds.west+.1&&cx<bounds.east-.1&&cz>bounds.north+.1&&cz<bounds.south-.1),'background must not overlap regional replacement');}
 for(const mesh of scene.children){assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();}
});

test('coarse seam sampler agrees with actual rendered background triangle intersections',()=>{
 const mesh=new THREE.Mesh(distantGeometry(base,base),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 for(const [e,n] of [[250,1380],[333,1299],[575,1001],[1010,799],[1333,369]]){const ray=new THREE.Raycaster(new THREE.Vector3(e-800,10000,800-n),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y+1200-coarseBackgroundHeight(base,e,n))<.001);}
 mesh.geometry.dispose();mesh.material.dispose();
});
