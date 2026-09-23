import { WEIGHT_COUNT, primordialWeights } from './brain.js';

// Heritable traits. `min`/`max` bound the value; mutation steps are scaled
// to the range so every trait drifts at a comparable pace.
export const TRAITS = {
  size: { min: 0.6, max: 2.4, label: 'Body size' },
  diet: { min: 0, max: 1, label: 'Diet' },
  speed: { min: 0.3, max: 1.6, label: 'Muscle' },
  sense: { min: 40, max: 220, label: 'Sight range' },
  fov: { min: 0.6, max: 5.2, label: 'Field of view' },
  hue: { min: 0, max: 360, label: 'Pigment', wrap: true },
  fertility: { min: 0.45, max: 0.95, label: 'Brood threshold' },
  invest: { min: 0.15, max: 0.6, label: 'Brood investment' },
  mutation: { min: 0.01, max: 0.25, label: 'Mutation rate' },
};

export const TRAIT_KEYS = Object.keys(TRAITS);

function clampTrait(key, v) {
  const t = TRAITS[key];
  if (t.wrap) return ((v % t.max) + t.max) % t.max;
  return Math.min(t.max, Math.max(t.min, v));
}

// `hunter` founders arrive pre-wired to chase and bite; the rest graze.
export function primordialGenome(rng, hunter = false) {
  const traits = {
    size: hunter ? rng.range(1.2, 1.6) : rng.range(0.8, 1.3),
    diet: hunter ? rng.range(0.45, 0.6) : rng.range(0.02, 0.15),
    speed: rng.range(0.6, 1),
    sense: rng.range(80, 130),
    fov: rng.range(1.8, 2.8),
    hue: rng.range(0, 360),
    fertility: rng.range(0.6, 0.8),
    invest: rng.range(0.3, 0.45),
    mutation: rng.range(0.04, 0.08),
  };
  return { traits, weights: primordialWeights(rng, hunter) };
}

export function mutate(parent, rng) {
  const m = parent.traits.mutation;
  const traits = {};
  for (const key of TRAIT_KEYS) {
    const t = TRAITS[key];
    const span = t.max - t.min;
    // The mutation rate evolves too, but on a gentler schedule.
    const scale = key === 'mutation' ? 0.1 : key === 'hue' || key === 'diet' ? 0.6 : 0.35;
    traits[key] = clampTrait(key, parent.traits[key] + rng.gauss() * span * m * scale);
  }
  const weights = new Float32Array(WEIGHT_COUNT);
  const pw = parent.weights;
  for (let i = 0; i < WEIGHT_COUNT; i++) {
    let w = pw[i];
    if (rng.next() < 0.2) w += rng.gauss() * m * 2.5;
    if (rng.next() < m * 0.02) w = rng.gauss();
    weights[i] = Math.max(-5, Math.min(5, w));
  }
  return { traits, weights };
}

// A single number for "how different are these two creatures?". It blends
// body plan (traits) with wiring (weights); hue is excluded so a species
// is never defined by colour alone.
export function geneticDistance(a, b) {
  let traitSum = 0;
  let n = 0;
  for (const key of TRAIT_KEYS) {
    if (key === 'hue' || key === 'mutation') continue;
    const t = TRAITS[key];
    traitSum += Math.abs(a.traits[key] - b.traits[key]) / (t.max - t.min);
    n++;
  }
  let weightSum = 0;
  const wa = a.weights;
  const wb = b.weights;
  for (let i = 0; i < WEIGHT_COUNT; i++) weightSum += Math.abs(wa[i] - wb[i]);
  return (traitSum / n) * 2 + (weightSum / WEIGHT_COUNT) * 0.6;
}

export function cloneGenome(g) {
  return { traits: { ...g.traits }, weights: new Float32Array(g.weights) };
}

export function serializeGenome(g) {
  return { traits: { ...g.traits }, weights: Array.from(g.weights, (w) => Math.round(w * 1e4) / 1e4) };
}

export function deserializeGenome(o) {
  return { traits: { ...o.traits }, weights: Float32Array.from(o.weights) };
}

// Compact, exact encoding of float arrays for save files.
export function packFloats(arr) {
  const bytes = new Uint8Array(Float32Array.from(arr).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function unpackFloats(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function packGenome(g) {
  return { traits: { ...g.traits }, weights: packFloats(g.weights) };
}

export function unpackGenome(o) {
  return { traits: { ...o.traits }, weights: o.weights ? unpackFloats(o.weights) : new Float32Array(WEIGHT_COUNT) };
}
