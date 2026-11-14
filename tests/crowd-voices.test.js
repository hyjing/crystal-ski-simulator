import test from 'node:test';
import assert from 'node:assert/strict';
import {CrowdVoices,voiceMix} from '../src/crowd-voices.js';

const listener={x:0,y:1.65,z:0},right={x:1,y:0,z:0};

test('nearby voices follow the camera direction and fade with distance and height',()=>{
  const near=voiceMix('slope',{x:3,y:0,z:0},listener,right);
  const far=voiceMix('slope',{x:8,y:0,z:0},listener,right);
  assert.ok(near.gain>far.gain&&far.gain>0);
  assert.ok(near.cutoff>far.cutoff);
  assert.ok(near.pan>0);
  assert.ok(voiceMix('slope',{x:3,y:0,z:0},listener,{x:-1,y:0,z:0}).pan<0);
  assert.equal(voiceMix('slope',{x:0,y:20,z:0},listener,right).gain,0);
});

test('crowd chatter starts once, follows its speaker, and yields to a boarding announcement',()=>{
  const starts=[],stops=[];
  const param=()=>({value:0,setTargetAtTime(value){this.value=value;}});
  const node=()=>({connect(target){return target;},disconnect(){}});
  const context={currentTime:0,destination:{},
    createGain:()=>({...node(),gain:param()}),
    createBiquadFilter:()=>({...node(),frequency:param()}),
    createStereoPanner:()=>({...node(),pan:param()}),
    createBufferSource:()=>({...node(),start(){starts.push(this.buffer);},stop(){stops.push(this.buffer);}}),
  };
  const voices=new CrowdVoices(context,'/');
  const lodge={duration:2},lift={duration:3};
  voices.clips={lodge:[lodge],lift:[lift]};
  const actor={position:{x:2,y:0,z:0},visible:true};
  const traffic={actors:[actor],states:[{kind:'lodge'}]};
  const tick=(time,extra)=>voices.update({enabled:true,time,listener,right,traffic,...extra});
  tick(0,{enabled:false});
  assert.equal(starts.length,0);
  tick(1);
  assert.deepEqual(starts,[lodge]);
  actor.position.x=30;
  tick(1.2);
  assert.equal(voices.active.gain.gain.value,0);
  const boarding={id:'station-1',point:{x:2,y:2,z:0}};
  tick(1.4,{boarding});
  assert.deepEqual(starts,[lodge,lift]);
  assert.deepEqual(stops,[lodge]);
  tick(1.6,{boarding});
  assert.equal(starts.length,2);
  tick(1.7,{enabled:false});
  assert.deepEqual(stops,[lodge,lift]);

  const answer={duration:1};
  actor.position.x=2;
  traffic.states.push({kind:'lodge'});
  traffic.actors.push({position:{x:-3,y:0,z:0},visible:true});
  voices.clips.lodge=[lodge,answer];
  tick(40);
  assert.equal(starts.at(-1),lodge);
  voices.active.source.onended();
  tick(42.6);
  assert.equal(starts.at(-1),answer);
  assert.ok(voices.active.pan.pan.value<0);
});
