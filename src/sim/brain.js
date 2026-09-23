// A small recurrent-ish neural network. Two of the outputs are fed back
// in as inputs on the next tick, which gives creatures a scrap of memory.

export const SECTORS = 5;

export const INPUTS = [
  ...Array.from({ length: SECTORS }, (_, i) => `plankton ${i + 1}`),
  ...Array.from({ length: SECTORS }, (_, i) => `carrion ${i + 1}`),
  ...Array.from({ length: SECTORS }, (_, i) => `creature ${i + 1}`),
  'rival size',
  'kinship',
  'energy',
  'health',
  'speed',
  'wall ahead',
  'pulse',
  'memory A',
  'memory B',
  'bias',
];

export const OUTPUTS = ['thrust', 'turn', 'bite', 'memory A', 'memory B'];

export const IN = {
  plant: 0,
  meat: SECTORS,
  creature: SECTORS * 2,
  rivalSize: SECTORS * 3,
  kinship: SECTORS * 3 + 1,
  energy: SECTORS * 3 + 2,
  health: SECTORS * 3 + 3,
  speed: SECTORS * 3 + 4,
  wall: SECTORS * 3 + 5,
  pulse: SECTORS * 3 + 6,
  memA: SECTORS * 3 + 7,
  memB: SECTORS * 3 + 8,
  bias: SECTORS * 3 + 9,
};

export const OUT = { thrust: 0, turn: 1, bite: 2, memA: 3, memB: 4 };

export const N_IN = INPUTS.length;
export const N_HIDDEN = 12;
export const N_OUT = OUTPUTS.length;

// Hidden layer sees every input (the bias input is part of INPUTS);
// the output layer sees every hidden unit plus its own bias.
export const W1_SIZE = N_HIDDEN * N_IN;
export const W2_SIZE = N_OUT * (N_HIDDEN + 1);
export const WEIGHT_COUNT = W1_SIZE + W2_SIZE;

export function w1Index(h, i) {
  return h * N_IN + i;
}

export function w2Index(o, h) {
  return W1_SIZE + o * (N_HIDDEN + 1) + h;
}

export function createBrainState() {
  return {
    input: new Float32Array(N_IN),
    hidden: new Float32Array(N_HIDDEN),
    output: new Float32Array(N_OUT),
  };
}

export function think(weights, state) {
  const { input, hidden, output } = state;
  for (let h = 0; h < N_HIDDEN; h++) {
    let sum = 0;
    const base = h * N_IN;
    for (let i = 0; i < N_IN; i++) sum += weights[base + i] * input[i];
    hidden[h] = Math.tanh(sum);
  }
  for (let o = 0; o < N_OUT; o++) {
    const base = W1_SIZE + o * (N_HIDDEN + 1);
    let sum = weights[base + N_HIDDEN];
    for (let h = 0; h < N_HIDDEN; h++) sum += weights[base + h] * hidden[h];
    output[o] = Math.tanh(sum);
  }
  return output;
}

// Angle (relative to heading) at the centre of each vision sector.
export function sectorAngles(fov) {
  const out = [];
  for (let i = 0; i < SECTORS; i++) out.push(-fov / 2 + ((i + 0.5) * fov) / SECTORS);
  return out;
}

// A hand-wired starting brain: steer toward plankton, cruise forward,
// swerve from walls. Everything else begins as small noise and is left
// for evolution to discover.
export function primordialWeights(rng, hunter = false) {
  const w = new Float32Array(WEIGHT_COUNT);
  for (let i = 0; i < WEIGHT_COUNT; i++) w[i] = rng.gauss() * 0.15;

  const mid = (SECTORS - 1) / 2;
  // h0: plankton steering. Sectors left of centre push negative, right positive.
  for (let s = 0; s < SECTORS; s++) {
    w[w1Index(0, IN.plant + s)] = ((s - mid) / mid) * 2.2;
    w[w1Index(1, IN.meat + s)] = ((s - mid) / mid) * 1.2;
  }
  // h2: cruise drive.
  w[w1Index(2, IN.bias)] = 1.2;
  w[w1Index(2, IN.plant + mid)] = 0.8;
  // h3: wall alarm.
  w[w1Index(3, IN.wall)] = 3;
  // h4: bite reflex when something is dead ahead.
  w[w1Index(4, IN.creature + mid)] = 2;
  w[w1Index(4, IN.bias)] = -1.2;

  if (hunter) {
    // h5: chase other creatures; h4's bite reflex fires sooner.
    for (let s = 0; s < SECTORS; s++) w[w1Index(5, IN.creature + s)] = ((s - mid) / mid) * 2.4;
    w[w1Index(6, IN.creature + mid)] = 1.5;
    w[w1Index(4, IN.bias)] = -0.6;
    // ...but hold back from biting kin, and don't chase them either.
    w[w1Index(4, IN.kinship)] = -2.5;
    w[w1Index(6, IN.kinship)] = -1.5;
    w[w2Index(OUT.turn, 5)] = 1.8;
    w[w2Index(OUT.thrust, 6)] = 0.9;
  }

  w[w2Index(OUT.turn, 0)] = 1.6;
  w[w2Index(OUT.turn, 1)] = 0.8;
  w[w2Index(OUT.turn, 3)] = 1.8;
  w[w2Index(OUT.thrust, 2)] = 1.1;
  w[w2Index(OUT.thrust, 3)] = -0.8;
  w[w2Index(OUT.bite, 4)] = 1.2;
  w[w2Index(OUT.bite, N_HIDDEN)] = -0.6;
  return w;
}
