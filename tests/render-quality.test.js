import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptQuality,qualityScale} from '../src/render-quality.js';

test('graphics presets budget large viewports and cap touchscreen pixel density',()=>{
  assert.equal(qualityScale('auto',3,true,400*800),1);
  assert.equal(qualityScale('smooth',2,false,1920*1080),.82);
  assert.equal(qualityScale('sharp',2,false,1920*1080),1.5);
  const pixels=3840*2160;
  assert.ok(qualityScale('auto',2,false,pixels)**2*pixels<=3_000_001);
});

test('automatic resolution backs off, holds between thresholds, and restores when frames stabilize',()=>{
  assert.ok(adaptQuality(1,1.15,24)<1);
  assert.equal(adaptQuality(.75,1.15,28),.7);
  assert.equal(adaptQuality(.6,.6,28),.6);
  assert.equal(adaptQuality(.82,1.15,20),.82);
  assert.equal(adaptQuality(1,1.02,16),1.02);
});
