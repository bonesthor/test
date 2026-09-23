import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/sim/rng.js';
import { WEIGHT_COUNT, N_IN, N_OUT, INPUTS, OUTPUTS, createBrainState, think, primordialWeights } from '../src/sim/brain.js';
import { TRAITS, TRAIT_KEYS, primordialGenome, mutate, geneticDistance, cloneGenome, serializeGenome, deserializeGenome } from '../src/sim/genome.js';
import { roman, makeEpithet } from '../src/sim/names.js';
import { World, TICKS_PER_DAY } from '../src/sim/world.js';

test('rng replays the same sequence for the same seed', () => {
  const a = new Rng('coral');
  const b = new Rng('coral');
  const c = new Rng('kelp');
  const sa = Array.from({ length: 50 }, () => a.next());
  const sb = Array.from({ length: 50 }, () => b.next());
  const sc = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('rng gauss is roughly standard normal', () => {
  const r = new Rng(7);
  let sum = 0;
  let sq = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const g = r.gauss();
    sum += g;
    sq += g * g;
  }
  assert.ok(Math.abs(sum / n) < 0.03);
  assert.ok(Math.abs(sq / n - 1) < 0.05);
});

test('brain shapes line up and outputs stay in tanh range', () => {
  assert.equal(INPUTS.length, N_IN);
  assert.equal(OUTPUTS.length, N_OUT);
  const w = primordialWeights(new Rng(1));
  assert.equal(w.length, WEIGHT_COUNT);
  const state = createBrainState();
  for (let i = 0; i < N_IN; i++) state.input[i] = (i % 3) - 1;
  const out = think(w, state);
  for (const v of out) assert.ok(v >= -1 && v <= 1 && Number.isFinite(v));
});

test('primordial brains steer toward plankton', () => {
  const w = primordialWeights(new Rng(3));
  const state = createBrainState();
  state.input[N_IN - 1] = 1; // bias
  state.input[4] = 0.9; // plankton in the right-most sector
  const right = think(w, state)[1];
  state.input[4] = 0;
  state.input[0] = 0.9; // plankton in the left-most sector
  const left = think(w, state)[1];
  assert.ok(right > 0.2, `expected a right turn, got ${right}`);
  assert.ok(left < -0.2, `expected a left turn, got ${left}`);
});

test('mutation keeps every trait inside its bounds', () => {
  const rng = new Rng('mutant');
  let g = primordialGenome(rng);
  g.traits.mutation = TRAITS.mutation.max;
  for (let i = 0; i < 500; i++) {
    g = mutate(g, rng);
    for (const key of TRAIT_KEYS) {
      const t = TRAITS[key];
      assert.ok(g.traits[key] >= t.min && g.traits[key] <= t.max, `${key}=${g.traits[key]}`);
    }
  }
});

test('genetic distance is zero for clones, symmetric, and grows with drift', () => {
  const rng = new Rng('drift');
  const a = primordialGenome(rng);
  assert.equal(geneticDistance(a, cloneGenome(a)), 0);
  let b = a;
  const steps = [];
  for (let i = 0; i < 60; i++) {
    b = mutate(b, rng);
    if (i % 20 === 19) steps.push(geneticDistance(a, b));
  }
  assert.equal(geneticDistance(a, b), geneticDistance(b, a));
  assert.ok(steps[0] > 0);
  assert.ok(steps[2] > steps[0]);
});

test('genomes survive a serialisation round trip', () => {
  const g = primordialGenome(new Rng(11));
  const back = deserializeGenome(JSON.parse(JSON.stringify(serializeGenome(g))));
  assert.deepEqual(back.traits, g.traits);
  assert.ok(geneticDistance(g, back) < 1e-4);
});

test('names: roman numerals and trait-driven epithets', () => {
  assert.equal(roman(4), 'iv');
  assert.equal(roman(9), 'ix');
  assert.equal(roman(14), 'xiv');
  const rng = new Rng(5);
  const predator = { size: 2.2, diet: 0.9, speed: 1, sense: 100, fov: 2, hue: 10, invest: 0.4 };
  const epithet = makeEpithet(predator, rng, () => false);
  assert.ok(['vorax', 'rapax', 'ferox', 'sanguinea', 'magna', 'gigantea', 'maxima'].includes(epithet), epithet);
  const taken = new Set();
  for (let i = 0; i < 40; i++) {
    const e = makeEpithet(predator, rng, (x) => taken.has(x));
    assert.ok(!taken.has(e), `duplicate ${e}`);
    taken.add(e);
  }
});

function fingerprint(world) {
  return world.creatures.map((c) => `${c.id}:${c.x.toFixed(4)},${c.y.toFixed(4)},${c.energy.toFixed(4)}`).join('|');
}

test('the world is deterministic for a given seed', () => {
  const a = new World({ seed: 'replay' });
  const b = new World({ seed: 'replay' });
  for (let i = 0; i < 1500; i++) {
    a.step();
    b.step();
  }
  assert.equal(fingerprint(a), fingerprint(b));
  assert.equal(a.speciesOrder.length, b.speciesOrder.length);
});

test('bookkeeping stays consistent over a long run', () => {
  const world = new World({ seed: 'ledger' });
  for (let day = 0; day < 8; day++) {
    for (let i = 0; i < TICKS_PER_DAY; i++) world.step();

    const counts = new Map();
    for (const c of world.creatures) {
      assert.ok(c.alive);
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.energy));
      assert.ok(c.x >= 0 && c.x <= world.width && c.y >= 0 && c.y <= world.height);
      assert.ok(c.energy <= c.maxEnergy + 1e-6);
      assert.equal(world.byId.get(c.id), c);
      counts.set(c.speciesId, (counts.get(c.speciesId) ?? 0) + 1);
    }
    assert.equal(world.byId.size, world.creatures.length);
    for (const sp of world.speciesOrder) {
      assert.equal(sp.population, counts.get(sp.id) ?? 0, `population of ${sp.name}`);
      assert.equal(sp.population === 0, sp.extinctTick !== null, `extinction flag of ${sp.name}`);
    }
    assert.equal(world.plankton, world.food.filter((f) => f.kind === 0).length);
    assert.ok(world.plankton <= world.opts.maxPlankton);
  }
  assert.ok(world.creatures.length > 0);
  assert.ok(world.speciesOrder.length > world.opts.founders, 'expected at least one speciation event');
});

test('history compression keeps species aligned with global samples', () => {
  const world = new World({ seed: 'archive' });
  for (let i = 0; i < 3000; i++) world.step();
  const before = world.samples.length;
  const sp = world.speciesOrder[0];
  const peakBefore = Math.max(...sp.history);
  world.compressHistory();
  assert.equal(world.samples.length, Math.ceil(before / 2));
  assert.equal(world.sampleEvery, 120);
  for (const s of world.speciesOrder) {
    assert.ok(s.historyStart >= 0);
    assert.ok(s.historyStart + s.history.length <= world.samples.length + 1);
  }
  assert.equal(Math.max(...sp.history), peakBefore, 'compression keeps peaks');
});

test('the pool reseeds itself when life nearly dies out', () => {
  const world = new World({ seed: 'wipeout' });
  for (const c of [...world.creatures]) world.kill(c, 'starvation');
  world.step();
  assert.ok(world.creatures.length >= world.opts.minPopulation);
  assert.ok(world.events.some((e) => e.kind === 'seed' && /drifts in/.test(e.text)));
});
