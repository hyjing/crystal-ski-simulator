import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTerrain,getRoutes,joinTrailWays,filterRoutes} from '../src/terrain.js';
const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}.json`,import.meta.url)));
const data=read('crystal-trails'),routes=getRoutes(createTerrain(read('crystal-dem')),data);

test('catalog retains every imported way exactly once, with unique route IDs',()=>{
  const imported=data.features.map(f=>String(f.id)).sort();
  const used=routes.flatMap(r=>r.osmWayIds).sort();
  assert.deepEqual(used,imported);
  assert.equal(new Set(routes.map(r=>r.id)).size,routes.length);
  assert.deepEqual(['easy','intermediate','advanced'].map(d=>filterRoutes(routes,d).length),[3,38,37]);
});

test('fragmented real roads join at shared endpoints without inventing missing connectors',()=>{
  assert.equal(routes.find(r=>r.name==="Kelley's Gap Road").osmWayIds.length,3);
  assert.equal(routes.find(r=>r.name==='Northway Drainage').osmWayIds.length,2);
  const way=(id,coordinates)=>({id,geometry:{coordinates}});
  const chains=joinTrailWays([way(1,[[0,0],[1,0]]),way(2,[[2,0],[1,0]]),way(3,[[4,0],[5,0]])]);
  assert.equal(chains.length,2);
  assert.deepEqual(chains[0].coordinates,[[0,0],[1,0],[2,0]]);
});

test('difficulty and search compose, normalize apostrophes, and handle zero results',()=>{
  assert.equal(filterRoutes(routes,'advanced','SUNNYSIDE')[0].id,'sunnyside');
  assert.equal(filterRoutes(routes,'intermediate','Sunnyside').length,0);
  assert.equal(filterRoutes(routes,'intermediate','Kelley’s').length,1);
  assert.equal(filterRoutes(routes,'all','绿谷')[0].id,'green-valley');
  assert.equal(filterRoutes(routes,'all','not a real trail').length,0);
  assert.equal(filterRoutes(routes,'easy','Quicksilver').length,1);
});
