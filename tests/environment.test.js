import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MountainWeather,weatherState,sunDirection,blendWeather} from '../src/environment.js';
function fixture(){const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),hemi=new THREE.HemisphereLight();scene.add(sun,hemi);const renderer={getPixelRatio:()=>1,toneMappingExposure:1},camera=new THREE.PerspectiveCamera();camera.position.set(10,900,20);return{weather:new MountainWeather(scene,renderer,sun,hemi),scene,sun,hemi,camera,focus:new THREE.Vector3(0,850,0)};}
test('sunset sky and the actual light share a low sun direction and warm direct light',()=>{
 const {weather,scene,sun,camera,focus}=fixture();weather.set('sunset');weather.update(5,camera,focus);
 const direction=sun.position.clone().sub(sun.target.position).normalize();assert.ok(direction.distanceTo(sunDirection(weather.state))<1e-10);assert.ok(direction.distanceTo(weather.uniforms.sunDirection.value)<1e-10);assert.ok(direction.y<.15);assert.ok(sun.color.r>sun.color.b);assert.ok(scene.fog.color.equals(weather.state.horizon));assert.ok(weather.sky.position.equals(camera.position));
});
test('snow changes illumination, visibility and bounded flakes together',()=>{
 const {weather,scene,sun,camera,focus}=fixture();weather.update(0,camera,focus);const clearDensity=scene.fog.density,clearSun=sun.intensity;weather.set('snow');weather.update(5,camera,focus);
 assert.ok(scene.fog.density>clearDensity*20);assert.ok(sun.intensity<clearSun*.15);assert.equal(weather.snowfall.mesh.visible,true);assert.equal(weather.snowfall.material.uniforms.amount.value,1);
 const a=weather.snowfall.positions;for(let i=0;i<a.length;i+=3){assert.ok(Math.abs(a[i]-camera.position.x)<=85.001);assert.ok(a[i+1]>=camera.position.y-21&&a[i+1]<=camera.position.y+65.001);assert.ok(Math.abs(a[i+2]-camera.position.z)<=85.001);}
});
test('interrupting a weather transition starts at the current light / fog state without a jump',()=>{
 const {weather,scene,sun,camera,focus}=fixture();weather.set('snow');weather.update(1,camera,focus);const density=scene.fog.density,intensity=sun.intensity,color=scene.fog.color.clone();weather.set('sunset');weather.update(0,camera,focus);assert.equal(scene.fog.density,density);assert.equal(sun.intensity,intensity);assert.ok(scene.fog.color.equals(color));weather.update(5,camera,focus);assert.equal(weather.progress,1);assert.equal(weather.snowfall.mesh.visible,false);
});
test('weather blending keeps endpoints and colors independent from the presets',()=>{
 const a=weatherState('clear'),b=weatherState('snow'),start=blendWeather(a,b,0),end=blendWeather(a,b,1);assert.equal(start.cover,a.cover);assert.equal(end.cover,b.cover);assert.ok(start.horizon.equals(a.horizon));start.horizon.set('#ff0000');assert.ok(!start.horizon.equals(a.horizon));
});
