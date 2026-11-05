import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTerrain,getLiftRuns,lonLatToUTM,filterRoutes} from '../src/terrain.js';
import {liftExitSpawn,forestLikelihood} from '../src/resort.js';
import {createSkier,stepSkier} from '../src/physics.js';
const read=n=>JSON.parse(readFileSync(new URL(`../public/data/${n}.json`,import.meta.url)));
const meta=read('crystal-detail-dem'),bytes=readFileSync(new URL(`../public/data/${meta.data}`,import.meta.url));
const terrain=createTerrain({...meta,heights:new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4)});
const runs=getLiftRuns(terrain,read('crystal-lift-runs')),infrastructure=read('crystal-infrastructure');

test('selectable runs exclude short sections and start / finish at the actual lift endpoints',()=>{
 assert.equal(runs.length,10);
 for(const r of runs){
  assert.ok(r.length>=400);assert.ok(r.drop>150);
  const f=infrastructure.features.find(f=>String(f.id)===r.liftId);
  const ends=[f.geometry.coordinates[0],f.geometry.coordinates.at(-1)].map(ll=>{const p=lonLatToUTM(...ll);return{x:p.e-terrain.originUTM[0]-(terrain.width-1)*terrain.spacing/2,z:terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2-p.n};});
  ends.sort((a,b)=>terrain.sample(b.x,b.z)-terrain.sample(a.x,a.z));
  for(const [a,b] of [[r.points[0],ends[0]],[r.points.at(-1),ends[1]]])assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.01,r.name);
  assert.ok(r.junctionLinks.every(l=>l.length<=50));
  assert.ok(r.startLinkMeters<=300&&r.finishLinkMeters<=180);
 }
 assert.equal(filterRoutes(runs,'all','mangoo')[0].id,'mr-magoo');
 assert.equal(filterRoutes(runs,'all','champell')[0].id,'chappelles');
});

test('every lift run has a clear snow exit outside mapped buildings and starts moving',()=>{
 for(const r of runs){const p=liftExitSpawn(terrain,r,infrastructure);assert.ok(p.distance>=35&&p.distance<=150);
  const s=createSkier(p,r.points[Math.min(p.segment+1,r.points.length-1)]);s.vx=Math.sin(s.heading)*1.8;s.vz=Math.cos(s.heading)*1.8;
  for(let i=0;i<600;i++)stepSkier(s,{steer:0,pole:true},terrain,1/120,'soft');
  assert.ok(Number.isFinite(s.speed)&&s.distance>2,r.name);
 }
});

test('fine ground preserves the original geographic footprint without adding synthetic cliffs',()=>{
 const base=read('crystal-dem');assert.equal(terrain.heights.length,terrain.width*terrain.height);
 assert.ok(terrain.spacing>4.9&&terrain.spacing<5);assert.deepEqual(terrain.originUTM,base.originUTM);
 assert.ok(Math.abs((terrain.width-1)*terrain.spacing-(base.width-1)*base.spacing)<.01);
 assert.ok(Math.abs((terrain.height-1)*terrain.spacing-(base.height-1)*base.spacing)<.01);
 for(const r of runs)for(const p of r.points)assert.ok(Number.isFinite(terrain.surface(p.x,p.z)));
});

test('canopy candidates remain registered to real image pixels on both ground grids',()=>{
 const v=read('crystal-vegetation'),landcover=read('crystal-landcover'),coarse=createTerrain(read('crystal-dem'));
 assert.deepEqual(v.imageSize,[2056,2568]);assert.ok(v.pixels.length>=10000);
 for(const [u,z,size] of v.pixels){assert.ok(Number.isInteger(u)&&u>=0&&u<v.imageSize[0]);assert.ok(Number.isInteger(z)&&z>=0&&z<v.imageSize[1]);assert.ok(size>0);}
 for(const p of [{x:0,z:0},{x:400,z:700},{x:-1000,z:200}])assert.equal(forestLikelihood(terrain,landcover,p.x,p.z),forestLikelihood(coarse,landcover,p.x,p.z));
});

test('pole work moves a skier on flat ground but adds no thrust at skiing speed',()=>{
 const flat={gradient:()=>({x:0,z:0})},a=createSkier({x:0,z:0},{x:0,z:10});
 for(let i=0;i<240;i++)stepSkier(a,{steer:0,pole:true},flat,1/120,'packed');assert.ok(a.distance>1);
 const b={...a,vx:0,vz:12},c={...b};stepSkier(b,{steer:0,pole:true},flat,1/120);stepSkier(c,{steer:0,pole:false},flat,1/120);assert.equal(b.vz,c.vz);
});
