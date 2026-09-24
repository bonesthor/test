// Achievements unlock in any mode and persist across pools. Each `check`
// sees the live world plus lifetime counters kept by the game layer.

import { TICKS_PER_DAY } from '../sim/world.js';

const living = (w) => w.livingSpecies().length;

export const ACHIEVEMENTS = [
  { id: 'first-blood', title: 'First blood', desc: 'Witness a predator make its first kill.', check: (w) => w.totalKills > 0 },
  { id: 'radiation', title: 'Adaptive radiation', desc: 'Have 10 species alive at once.', check: (w) => living(w) >= 10 },
  { id: 'cambrian', title: 'Cambrian explosion', desc: 'Have 18 species alive at once.', check: (w) => living(w) >= 18 },
  { id: 'tree', title: 'Tree of life', desc: '100 species have lived in a single pool.', check: (w) => w.speciesOrder.length >= 100 },
  { id: 'dynasty', title: 'Dynasty', desc: 'Reach generation 50.', check: (w) => w.maxGeneration >= 50 },
  { id: 'deep-time', title: 'Deep time', desc: 'Keep one pool going for 100 days.', check: (w) => w.tick >= 100 * TICKS_PER_DAY },
  {
    id: 'apex',
    title: 'Apex predator',
    desc: 'Have 40 creatures that are 70%+ carnivore alive at once.',
    check: (w) => w.creatures.filter((c) => c.genome.traits.diet >= 0.7).length >= 40,
  },
  {
    id: 'leviathan',
    title: 'Leviathan',
    desc: 'A creature 22 µm or larger lives in your pool.',
    check: (w) => w.creatures.some((c) => c.genome.traits.size >= 2.2),
  },
  {
    id: 'methuselah',
    title: 'Methuselah',
    desc: 'A creature lives to 9 days old.',
    check: (w) => w.creatures.some((c) => c.age >= 9 * TICKS_PER_DAY),
  },
  { id: 'boom', title: 'Baby boom', desc: 'Have 450 creatures alive at once.', check: (w) => w.creatures.length >= 450 },
  {
    id: 'mass-extinction',
    title: 'Mass extinction',
    desc: 'Five species go extinct within a single day.',
    check: (w) => {
      const since = w.tick - TICKS_PER_DAY;
      return w.speciesOrder.filter((s) => s.extinctTick !== null && s.extinctTick >= since).length >= 5;
    },
  },
  { id: 'playing-god', title: 'Playing god', desc: 'Release a species you designed.', check: (w, s) => s.released >= 1 },
  { id: 'surgeon', title: 'Brain surgeon', desc: 'Transplant an evolved genome into a pool.', check: (w, s) => s.transplants >= 1 },
  { id: 'gardener', title: 'Gardener', desc: 'Scatter 1,000 plankton by hand.', check: (w, s) => s.fed >= 1000 },
  { id: 'hand-of-god', title: 'Hand of god', desc: 'Cull 100 creatures.', check: (w, s) => s.culled >= 100 },
  { id: 'naturalist', title: 'Naturalist', desc: 'Examine 25 different creatures.', check: (w, s) => s.examined >= 25 },
  {
    id: 'built-to-last',
    title: 'Built to last',
    desc: 'A species you designed survives 15 days.',
    check: (w) =>
      w.livingSpecies().some((sp) => sp.designed && w.tick - sp.bornTick >= 15 * TICKS_PER_DAY),
  },
  { id: 'tidemaster', title: 'Tidemaster', desc: 'Earn three stars on every challenge.', check: (w, s) => s.perfect },
];
