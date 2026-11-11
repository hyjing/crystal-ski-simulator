import test from 'node:test';
import assert from 'node:assert/strict';
import {assignTrailMusic, Soundtrack} from '../src/soundtrack.js';

test('trail music is stable across reloads and distributed evenly within a resort', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const crystal = assignTrailMusic('crystal', ids);
  assert.deepEqual(crystal, assignTrailMusic('crystal', ids.slice().reverse()));
  assert.notDeepEqual(crystal, assignTrailMusic('whistler', ids));
  const counts = new Map();
  for (const track of crystal.values()) counts.set(track.file, (counts.get(track.file) || 0) + 1);
  assert.deepEqual([...counts.values()], [2, 2, 2, 2]);
});

test('music loads on opt-in, follows route changes, and ignores stale playback errors', async t => {
  const document = new EventTarget();
  document.hidden = false;
  const previous = globalThis.document;
  globalThis.document = document;
  t.after(() => { globalThis.document = previous; });

  const button = new EventTarget();
  button.setAttribute = () => {};
  const player = {
    pending: [],
    getAttribute: () => player.src,
    play() {
      return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
    },
    pause() { this.paused = true; },
  };
  const errors = [];
  const music = new Soundtrack(player, button, '/game/', error => errors.push(error));
  const tracks = assignTrailMusic('crystal', ['a', 'b']);
  music.select(tracks.get('a'));
  assert.equal(player.src, undefined);
  button.dispatchEvent(new Event('click'));
  assert.match(player.src, /^\/game\/assets\/music\//);
  const first = player.src;
  music.select(tracks.get('b'));
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
