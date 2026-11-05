// CPU update benchmark only; excludes browser rendering, GPU work and driver uploads.
import fs from 'node:fs';
import * as THREE from 'three';
import {createTerrain,getRoutes} from '../src/terrain.js';
import {PowderSurface} from '../src/powder.js';

const terrain=createTerrain(JSON.parse(fs.readFileSync(new URL('../public/data/crystal-dem.json',import.meta.url))));
const route=getRoutes(terrain,JSON.parse(fs.readFileSync(new URL('../public/data/crystal-trails.json',import.meta.url))))[0];
const powder=new PowderSurface(new THREE.Scene(),terrain,{capabilities:{getMaxAnisotropy:()=>4}});
const skier={...route.points[0],heading:1,speed:20,slip:.4};
const initialStart=performance.now();powder.update(skier,false,'soft');const initialMs=performance.now()-initialStart;
const rebases=[],steady=[];
for(let i=0;i<160;i++){
  skier.x+=.35;
  const moved=!powder.center||Math.round(skier.x/12)*12!==powder.center.x;
  const start=performance.now();powder.update(skier,true,'soft');
  (moved?rebases:steady).push(performance.now()-start);
}
const stats=values=>({samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,maxMs:Math.max(...values)});
console.log(JSON.stringify({scope:'CPU powder update only; excludes GPU/rendering',initialMs,rebases:stats(rebases),steady:stats(steady)},null,2));
