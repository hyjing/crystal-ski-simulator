import test from 'node:test';
import assert from 'node:assert/strict';
import {ShuffleTracks, Soundtrack} from '../src/soundtrack.js';

test('a randomized bag plays seven unique tracks and avoids a repeat between bags', () => {
  const tracks=new ShuffleTracks(()=>.4);
  const first=Array.from({length:7},()=>tracks.next());
  assert.equal(new Set(first.map(track=>track.file)).size,7);
  assert.notEqual(tracks.next().file,first.at(-1).file);
  const other=new ShuffleTracks(()=>.8);
  assert.notDeepEqual(Array.from({length:7},()=>other.next()),first);
});

test('music loads on opt-in, follows route changes, and ignores stale playback errors', async t => {
  const document = new EventTarget();
  document.hidden = false;
  const previous = globalThis.document;
  globalThis.document = document;
  t.after(() => { globalThis.document = previous; });

  const button = new EventTarget();
  button.setAttribute = () => {};
  const player=Object.assign(new EventTarget(),{
    pending: [],
    getAttribute: () => player.src,
    play() {
      return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
    },
    pause() { this.paused = true; },
  });
  const errors = [];
  const music = new Soundtrack(player, button, '/game/', error => errors.push(error));
  music.next();
  assert.equal(player.src, undefined);
  button.dispatchEvent(new Event('click'));
  assert.match(player.src, /^\/game\/assets\/music\//);
  const first = player.src;
  player.dispatchEvent(new Event('ended'));
  assert.notEqual(player.src, first);
  player.pending[0].reject(new Error('previous route interrupted'));
  player.pending[1].resolve();
  await Promise.resolve();
  assert.deepEqual(errors, []);
  assert.equal(button.textContent, '音乐开');
  button.dispatchEvent(new Event('click'));
  assert.equal(player.paused, true);
  assert.equal(button.textContent, '音乐关');
});
