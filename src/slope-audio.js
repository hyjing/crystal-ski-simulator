import {clamp} from './physics.js';

export function skiSound(speed, slip, edge, packed, shade) {
  const contact = clamp((speed - .8) / 23, 0, 1);
  const scrape = clamp(slip / 5 + Math.abs(edge) * .38, 0, 1);
  const brightness = packed ? 1 : .18 + shade * .22;
  return {
    glide: contact * (.026 + .044 * scrape),
    grit: contact * (.014 + .10 * scrape) * brightness,
    filter: 360 + 1200 * brightness + 420 * scrape,
  };
}

function noiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let low = 0, seed = 316;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    low = .84 * low + .16 * white;
    samples[i] = low * 1.7 + white * .34;
  }
  return buffer;
}

export class SlopeAudio {
  constructor(context) {
    this.context = context;
    const buffer = noiseBuffer(context);
    const layer = (type, frequency, phase) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = 0;
      const pan = context.createStereoPanner?.();
      source.connect(filter).connect(gain);
      if (pan) gain.connect(pan).connect(context.destination);
      else gain.connect(context.destination);
      source.start(0, phase);
      return {gain: gain.gain, frequency: filter.frequency, pan: pan?.pan};
    };
    this.wind = layer('lowpass', 550, .1);
    this.glide = layer('lowpass', 800, 1);
    this.grit = layer('highpass', 1500, 2.2);
    this.pass = layer('bandpass', 950, 3);
    this.tap = layer('bandpass', 1200, 1.7);
    this.roller = layer('bandpass', 430, .8);
    this.lastPole = -1;
    this.lastCarrier = null;
  }

  update({enabled, skier, grounded, snow, conditions, camera, states, wind, station, poleContact, carrier}) {
    const time = this.context.currentTime;
    const set = (parameter, value, lag = .13) => parameter?.setTargetAtTime(value, time, lag);
    const rightX = camera.matrixWorld.elements[0], rightZ = camera.matrixWorld.elements[2];
    const panFrom = (x, z) => clamp((x * rightX + z * rightZ) / Math.max(1, Math.hypot(x, z)), -1, 1);
    const gust = .84 + .11 * Math.sin(time * 1.6) + .05 * Math.sin(time * 4.7);
    const exposure = conditions?.exposure ?? .7;
    set(this.wind.gain, enabled ? gust * (.009 + wind * .007 + Math.min(35, skier.speed) * .0017) * (.4 + exposure * .6) : 0);
    set(this.wind.frequency, 300 + exposure * 460 + skier.speed * 12);
    set(this.wind.pan, panFrom(-.85, .5) * .72 * exposure);

    const ski = skiSound(skier.speed, skier.slip || 0, skier.edgeAngle || 0, snow === 'packed', conditions?.shade ?? 0);
    set(this.glide.gain, enabled && grounded ? ski.glide : 0, .065);
    set(this.glide.frequency, ski.filter);
    set(this.grit.gain, enabled && grounded ? ski.grit : 0, .06);
    set(this.grit.pan, (skier.turn || 0) * .2);

    let closest, distance = 32;
    if (enabled) for (const state of states) {
      if (state.kind !== 'ski' || state.indoor || state.fall || state.speed < 3 || !state.point) continue;
      const p = state.point;
      const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      if (d < distance) { closest = state; distance = d; }
    }
    set(this.pass.gain, closest ? Math.min(.105, closest.speed * .008) * (1 - distance / 32) ** 2 : 0, .09);
    if (closest) {
      const dx = closest.point.x - camera.position.x, dz = closest.point.z - camera.position.z;
      const approach = -(dx * Math.sin(closest.heading) + dz * Math.cos(closest.heading)) / Math.max(1, distance);
      set(this.pass.pan, panFrom(dx, dz), .07);
      set(this.pass.frequency, 880 + approach * 175);
    }

    const poleDown = enabled && grounded && skier.poling > .3 && skier.polePhase < .38;
    const poleStrike = poleDown && !this.poleDown;
    this.poleDown = poleDown;
    if (enabled && grounded && (poleContact || poleStrike) && time - this.lastPole > .21) {
      this.lastPole = time;
      const contact = poleContact || skier;
      set(this.tap.pan, panFrom(contact.x - camera.position.x, contact.z - camera.position.z));
      this.pulse(this.tap.gain, snow === 'packed' ? .19 : .10, .037);
    }
    if (enabled && carrier && station && carrier !== this.lastCarrier) {
      this.pulse(this.roller.gain, .09 * clamp(1 - station.distance / 42, 0, 1), .11);
      set(this.roller.pan, panFrom(station.x - camera.position.x, station.z - camera.position.z));
    }
    this.lastCarrier = enabled ? carrier : null;
    if (!enabled) {
      for (const layer of [this.tap, this.roller]) {
        layer.gain.cancelScheduledValues(time);
        set(layer.gain, 0);
      }
    }
  }

  pulse(gain, level, decay) {
    const time = this.context.currentTime;
    gain.cancelScheduledValues(time);
    gain.setTargetAtTime(level, time, .003);
    gain.setTargetAtTime(0, time + .012, decay);
  }
}
