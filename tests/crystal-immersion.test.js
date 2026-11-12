import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Group, Scene} from 'three';
import {createTerrain, getLiftRuns, pointAlongRoute} from '../src/terrain.js';
import {prepareStationTerrain} from '../src/stations.js';
import {sampleSlopeConditions} from '../src/slope-conditions.js';
import {skiSound} from '../src/slope-audio.js';
import {weatherState} from '../src/environment.js';
import {SkiTraffic} from '../src/traffic.js';
import {trafficPoint} from '../src/traffic-brain.js';
import {siteLocal} from '../src/npc-routines.js';
import {PowderField} from '../src/powder.js';
import {SnowEffects} from '../src/snow.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../public/data/crystal-${name}.json`, import.meta.url)));
const raw = createTerrain(read('dem'));
const infrastructure = read('infrastructure');
const routes = getLiftRuns(raw, read('lift-runs'));
const {terrain, areas} = prepareStationTerrain(raw, routes, infrastructure);
const valley = routes.find(route => route.id === 'green-valley');
valley.spawn = pointAlongRoute(valley, 35);

test('Green Valley transitions from exposed ridge to sheltered basin using the actual terrain', () => {
  const ridge = sampleSlopeConditions(terrain, valley, valley.spawn, () => [], weatherState('clear'));
  const slope = pointAlongRoute(valley, valley.length * .45);
  const valleyFloor = sampleSlopeConditions(terrain, valley, slope, () => [], weatherState('clear'));
  const trees = Array.from({length: 6}, (_, i) => ({x: slope.x + i, z: slope.z + 6}));
  const forest = sampleSlopeConditions(terrain, valley, slope, () => trees, weatherState('clear'));
  assert.ok(ridge.exposure > .9 && ridge.basin < .1);
  assert.ok(valleyFloor.basin > .8 && valleyFloor.shade > ridge.shade);
  assert.ok(forest.exposure < valleyFloor.exposure * .5);
  assert.equal(skiSound(0, 0, 0, false, 0).glide, 0);
  assert.ok(skiSound(16, 4, 1, true, 0).grit > skiSound(16, 4, 1, false, 0).grit * 3);
  assert.ok(skiSound(16, 4, 1, false, 0).glide > skiSound(16, 0, 0, false, 0).glide);
});

test('the waiting pair ski the same trail and a lower-station visitor leaves the cabin with a drink', () => {
  const traffic = new SkiTraffic(new Scene(), terrain, Array.from({length: 24}, () => new Group()),
    {crystal: true, stationAreas: areas, infrastructure});
  traffic.reset(valley, valley.spawn, routes);
  const pair = traffic.states.slice(0, 2);
  const start = pair.map(state => state.progress);
  const visitor = traffic.states[20];
  assert.ok(pair.every(state => state.activity === 'waiting' && state.route === valley));
  assert.equal(visitor.prop, 'cup');
  assert.equal(visitor.indoor, true);
  let leftCabin = false;
  for (let i = 0; i < 700; i++) {
    traffic.step(1 / 30, {x: -10000, z: 0});
    leftCabin ||= !visitor.indoor && siteLocal(visitor.site, visitor.point).z > 0;
  }
  assert.ok(pair.every((state, i) => state.activity === 'ski' && state.progress > start[i] + 22));
  assert.ok(leftCabin);
});

test('a skier gets through the end of the run, moves at the lower station, then rejoins offscreen', () => {
  const actor = new Group();
  const traffic = new SkiTraffic(new Scene(), terrain, [actor]);
  traffic.reset(valley, valley.spawn, routes);
  const state = traffic.states[0];
  const goal = valley.points.at(-1);
  traffic.viewPoint = goal;
  actor.visible = true;
  state.progress = valley.length - 24;
  state.point = trafficPoint(valley, state.progress, 0, 0);
  state.speed = 3;
  let returnedToWalking = false, waited = false;
  for (let i = 0; i < 1300; i++) {
    traffic.step(1 / 30, {x: -10000, z: 0});
    if (state.activity === 'lift-line') waited = true;
    if (waited && state.activity === 'exit' && state.speed > .5) returnedToWalking = true;
  }
  assert.ok(waited && returnedToWalking);
  actor.visible = false;
  traffic.viewPoint = {x: goal.x + 100, z: goal.z};
  for (let i = 0; i < 120; i++) traffic.step(1 / 30, {x: -10000, z: 0});
  assert.ok(state.progress < 150 && !state.indoor && state.activity === 'ski');
});

test('fresh snow covers old ski grooves gradually and a fresh pass restores a visible track', () => {
  const field = new PowderField(1000);
  field.stamp(0, 0, .25, .13);
  const fresh = field.get(0, 0);
  field.cover(30);
  const covered = field.get(0, 0);
  assert.ok(covered < 0 && covered > fresh * .5);
  field.stamp(0, 0, .25, .13);
  assert.equal(field.get(0, 0), fresh);
  field.clear();
  assert.equal(field.burial, 0);
  assert.equal(field.stamps.size, 0);
});

test('nearby NPCs leave connected tracks without drawing bridges across respawns', () => {
  const effects = Object.create(SnowEffects.prototype);
  effects.crowdPrevious = new Map();
  effects.crowdClock = 0;
  let written = 0;
  effects.writeSegment = () => written++;
  const observer = {x: 0, z: 0};
  const npc = {point: {x: 5, z: 0}, speed: 10, roll: .35, heading: 0, kind: 'ski', activity: 'ski'};
  assert.equal(effects.recordCrowd(.1, [npc], observer).length, 0);
  npc.point.z = 1;
  assert.equal(effects.recordCrowd(.1, [npc], observer).length, 1);
  npc.point.z = 70;
  assert.equal(effects.recordCrowd(.1, [npc], observer).length, 0);
  assert.equal(written, 1);
});

test('NPCs use a pole stroke to leave a full stop on flat snow and stay still while yielding', () => {
  const flat = {surface: () => 1600, gradient: () => ({x: 0, z: 0})};
  const route = {id: 'flat', length: 500, points: [{x: 0, z: 0}, {x: 0, z: 500}]};
  const traffic = new SkiTraffic(new Scene(), flat, [new Group()]);
  traffic.reset(route, route.points[0]);
  const skier = traffic.states[0];
  const start = skier.progress;
  const clear = {x: -1000, z: 0};
  assert.equal(skier.speed, 0);
  for (let i = 0; i < 24; i++) traffic.step(1 / 120, clear);
  assert.ok(skier.poling > .5 && skier.phase > 0);
  assert.ok(skier.speed > .4 && skier.progress > start);
  skier.speed = 0;
  skier.yielding = true;
  const blocked = {...skier.point};
  const held = skier.progress;
  for (let i = 0; i < 60; i++) traffic.step(1 / 120, blocked);
  assert.equal(skier.progress, held);
  assert.ok(skier.poling < .01);
  for (let i = 0; i < 144; i++) traffic.step(1 / 120, clear);
  assert.ok(skier.poling > .5 && skier.speed > .4 && skier.progress > held);
});
