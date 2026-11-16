import test from 'node:test';
import assert from 'node:assert/strict';
import {createRearShotEffect,updateRearShotEffect} from '../src/rear-shot-effect.js';

test('rear shot draws an extending beam and switches to a fading impact at the target',()=>{
  const fx=createRearShotEffect();
  const shot={x:0,y:1,z:0,end:{x:0,y:1,z:-12},start:0,impact:.08,until:.35,result:'hit'};
  const {beam,bolt,impact,core,ring}=fx.userData;
  updateRearShotEffect(fx,shot,.04);
  assert.equal(beam.visible,true);
  assert.equal(core.scale.y,6);
  assert.equal(bolt.position.z,-6);
  assert.equal(impact.visible,false);
  updateRearShotEffect(fx,shot,.10);
  assert.equal(bolt.visible,false);
  assert.equal(impact.visible,true);
  assert.equal(impact.position.z,-12);
  assert.equal(ring.material.color.getHexString(),'66dbff');
  const opacity=ring.material.opacity;
  updateRearShotEffect(fx,{...shot,result:'blocked'},.24);
  assert.equal(beam.visible,false);
  assert.equal(ring.material.color.getHexString(),'ffbb54');
  assert.ok(ring.material.opacity<opacity);
});
