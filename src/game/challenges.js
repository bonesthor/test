// The campaign. Each challenge sets up a pool, names a goal with a
// deadline, and offers two bonus objectives for extra stars.
//
//   world     options passed to new World() (merged over the pool's shape)
//   setup     optional: prepares the world, returns context kept in the save
//   progress  (world, ctx) → { value, target, label } shown in the mission bar
//   outcome   (world, ctx, game) → 'won' | 'lost' | null, checked every tick batch
//   bonuses   [{ label, test(world, ctx, game) }] judged the moment you win

import { TICKS_PER_DAY } from '../sim/world.js';

const day = (w) => w.tick / TICKS_PER_DAY;
const living = (w) => w.livingSpecies().length;
// Diversity goals count only species that have taken hold (3+ members), so a
// burst of one-off mutants doesn't count.
const established = (w) => w.livingSpecies().filter((sp) => sp.population >= 3).length;

function nativeSpecies(w, ctx) {
  return w.livingSpecies().filter((sp) => sp.rootId !== ctx.invaderRoot).length;
}

function designedLineage(w) {
  let n = 0;
  const counts = w.lineageCounts();
  for (const [root, count] of counts) if (w.species.get(root).designed) n += count;
  return n;
}

function designedSpecies(w) {
  return w.livingSpecies().filter((sp) => w.species.get(sp.rootId).designed).length;
}

function meanSize(w) {
  if (!w.creatures.length) return 0;
  return w.creatures.reduce((a, c) => a + c.genome.traits.size, 0) / w.creatures.length;
}

// An apex predator must be home-grown: evolved here, not designed in the Lab.
function apexCount(w) {
  let best = 0;
  for (const sp of w.livingSpecies()) {
    if (w.species.get(sp.rootId).designed || sp.founder.traits.diet < 0.7) continue;
    best = Math.max(best, sp.population);
  }
  return best;
}

// Reach `target` on `metric` before `deadline`.
function reach(metric, target, deadline) {
  return (w, ctx) => {
    if (metric(w, ctx) >= target) return 'won';
    if (day(w) >= deadline) return 'lost';
    return null;
  };
}

const byDay = (d) => ({ label: `Finish by day ${d}`, test: (w) => day(w) <= d });
const thrifty = (n) => ({ label: `Spend at most ${n} nutrients`, test: (w, ctx, game) => game.spent <= n });

export const CHALLENGES = [
  {
    id: 'first-light',
    title: 'First light',
    brief:
      'A fresh pool with three founding lineages. Help life diversify: new species appear when lineages drift far enough from their founders, and they drift faster when there is food to breed on.',
    goal: 'Have 6 established species (3+ members each) at once',
    tips: [
      'Feed scatters plankton where you click. More food means more births, and more births mean faster evolution.',
      'Mutagen makes the offspring of the creatures you hit mutate far more than usual.',
      'You earn nutrients over time, faster the more species are alive.',
    ],
    deadline: 14,
    nutrients: 60,
    world: {},
    progress: (w) => ({ value: established(w), target: 6, label: 'established species' }),
    outcome: reach(established, 6, 14),
    bonuses: [byDay(7), thrifty(20)],
  },
  {
    id: 'long-winter',
    title: 'The long winter',
    brief:
      'Plankton is scarce and the lean seasons come quickly. No new life will drift in to rescue this pool. Keep it going until the thaw on day 20.',
    goal: 'Keep at least 30 creatures alive until day 20',
    tips: [
      'Feed during the lean season, when the season gauge in the header runs low.',
      'Scatter food away from the hunters, or you are only feeding them.',
      'Your income depends on how many species are alive. Losing species makes the winter harder.',
    ],
    deadline: 20,
    nutrients: 90,
    world: { foodScale: 0.55, seasonDays: 8, minPopulation: 0, immigration: false },
    progress: (w) => ({ value: Math.min(day(w), 20), target: 20, label: 'days survived', floor: 30 }),
    outcome: (w) => {
      if (w.creatures.length < 30) return 'lost';
      if (day(w) >= 20) return 'won';
      return null;
    },
    bonuses: [
      { label: 'End with 4 or more species', test: (w) => living(w) >= 4 },
      thrifty(60),
    ],
  },
  {
    id: 'designer',
    title: 'Intelligent design',
    brief:
      'Design a species in the Lab and release it. The pool is already crowded, so your creation must out-compete creatures that have been evolving here for days.',
    goal: 'Grow your designed lineage to 120 creatures',
    tips: [
      'Open the Lab tab, pick a body plan, then click in the pool to release it. Releases cost nutrients.',
      'Descendant species of your design count toward the goal.',
      'Big bodies store more energy but breed slowly. Small ones breed fast but starve fast.',
    ],
    deadline: 25,
    nutrients: 140,
    world: {},
    warmupDays: 4,
    tab: 'lab',
    progress: (w) => ({ value: designedLineage(w), target: 120, label: 'of your lineage alive' }),
    outcome: reach(designedLineage, 120, 25),
    bonuses: [byDay(14), { label: 'Your lineage splits into 3+ living species', test: (w) => designedSpecies(w) >= 3 }],
  },
  {
    id: 'invasion',
    title: 'Invasion',
    brief:
      'A swarm of Ferox invasor, huge and ravenous hunters, has washed into a peaceful pool. Drive them to extinction before they eat everything else.',
    goal: 'Make the invaders extinct while 2+ native species survive',
    tips: [
      'Cull removes every creature in a circle, natives included, so aim carefully.',
      'Culled bodies become carrion, which scavengers and the invaders can eat.',
      'You lose if fewer than two native species remain.',
    ],
    deadline: 20,
    nutrients: 120,
    world: { hunterFounder: false, immigration: false, minPopulation: 0 },
    warmupDays: 3,
    setup(w) {
      const sp = w.introduce(
        { size: 2.1, diet: 0.92, speed: 1.35, sense: 190, fov: 2.2, fertility: 0.7, invest: 0.45, mutation: 0.04, hue: 350 },
        { count: 26, name: { genus: 'Ferox', epithet: 'invasor' } },
      );
      // Invaders are not the player's design, whatever introduce() assumes.
      sp.designed = false;
      w.log('record', `A swarm of ${sp.name} arrives. They must not take over the pool.`, [sp.id]);
      return { invaderRoot: sp.rootId, startCount: sp.population };
    },
    progress: (w, ctx) => {
      const invaders = w.lineageCounts().get(ctx.invaderRoot) ?? 0;
      return { value: invaders, target: 0, label: 'invaders left', countdown: true };
    },
    outcome: (w, ctx) => {
      if (nativeSpecies(w, ctx) < 2) return 'lost';
      if (!w.lineageCounts().get(ctx.invaderRoot)) return 'won';
      if (day(w) >= 20) return 'lost';
      return null;
    },
    bonuses: [byDay(9), { label: 'End with 5+ native species', test: (w, ctx) => nativeSpecies(w, ctx) >= 5 }],
  },
  {
    id: 'radiation',
    title: 'Adaptive radiation',
    brief:
      'One lineage, many niches. Push this pool into an explosion of diversity, the way the Cambrian seas filled with new body plans.',
    goal: 'Have 14 established species (3+ members each) at once',
    tips: [
      'Mutagen on a crowded upwelling irradiates many creatures in one go.',
      'Keep populations healthy, since a species that dies out stops counting.',
    ],
    deadline: 30,
    nutrients: 100,
    world: {},
    progress: (w) => ({ value: established(w), target: 14, label: 'established species' }),
    outcome: reach(established, 14, 30),
    bonuses: [byDay(16), thrifty(80)],
  },
  {
    id: 'gigantism',
    title: 'Gigantism',
    brief:
      'Selective breeding, the Darwinian way. Push the average body size of the whole pool to 15 µm. Natural selection here favours the small, so you will have to work against it.',
    goal: 'Raise the mean body size to 15 µm',
    tips: [
      'Culling small creatures leaves more food for large ones.',
      'Releasing giants from the Lab shifts the average straight away, but can they hold on?',
      'The Evolution chart on the Census tab tracks mean body size.',
    ],
    deadline: 40,
    nutrients: 160,
    world: {},
    progress: (w) => ({ value: meanSize(w) * 10, target: 15, label: 'µm mean size', decimals: 1 }),
    outcome: reach((w) => meanSize(w) * 10, 15, 40),
    bonuses: [byDay(22), thrifty(150)],
  },
  {
    id: 'apex',
    title: 'Apex',
    brief:
      'This pool has only half-hearted omnivores. Evolve a true apex predator, a species at least 70% carnivore, and let it establish a population. Designed species do not count; it has to evolve here.',
    goal: 'Evolve a 70%+ carnivore species with 8 members',
    tips: [
      'Carnivory rises when meat is plentiful and plankton is not.',
      'Culling makes carrion. Mutagen speeds up the search.',
      'Watch the Carnivory chart on the Census tab.',
    ],
    deadline: 45,
    nutrients: 140,
    world: { immigration: false },
    progress: (w) => ({ value: apexCount(w), target: 8, label: 'apex predators' }),
    outcome: reach(apexCount, 8, 45),
    bonuses: [byDay(25), thrifty(150)],
  },
];

export function challengeById(id) {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}

export function starsFor(challenge, world, ctx, game) {
  return 1 + challenge.bonuses.filter((b) => b.test(world, ctx, game)).length;
}
