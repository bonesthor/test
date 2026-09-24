// How does each challenge go if the player does nothing, and can a simple
// scripted player win it with the same nutrient budget?
// Usage: node scripts/balance.mjs [seeds] [challenge-id]
import { World, TICKS_PER_DAY } from '../src/sim/world.js';
import { CHALLENGES } from '../src/game/challenges.js';
import { startChallenge, POWERS, releaseCost } from '../src/game/game.js';
import { PRESETS } from '../src/ui/presets.js';

const seeds = Number(process.argv[2] ?? 6);
const only = process.argv[3];

// Point with the most creatures matching `pred` within r.
function densest(world, pred, r) {
  const pool = world.creatures.filter(pred);
  let best = null;
  let bestN = 0;
  for (const c of pool) {
    let n = 0;
    for (const o of pool) if (Math.hypot(o.x - c.x, o.y - c.y) < r) n++;
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best ? { x: best.x, y: best.y, n: bestN } : null;
}

const rootOf = (w, c) => w.species.get(c.speciesId).rootId;
const lean = (w) => w.season < 0.45;

function use(world, game, power, at) {
  if (!at || !game.spend(POWERS[power].cost)) return false;
  if (power === 'feed') world.sprinkle(at.x, at.y);
  if (power === 'cull') world.cull(at.x, at.y, POWERS.cull.radius);
  if (power === 'mutagen') world.irradiate(at.x, at.y, POWERS.mutagen.radius);
  return true;
}

const BOTS = {
  'first-light': (w, g) => use(w, g, 'mutagen', densest(w, () => true, POWERS.mutagen.radius)),
  'long-winter': (w, g) => lean(w) && use(w, g, 'feed', densest(w, (c) => c.genome.traits.diet < 0.4, 40)),
  designer: (w, g) => {
    if (g.released) return;
    const design = { traits: { ...PRESETS.Swarm }, count: 14 };
    if (!g.spend(releaseCost(design))) return;
    w.introduce(design.traits, { count: design.count, name: { genus: 'Botella', epithet: 'prima' } });
    g.released = true;
  },
  invasion: (w, g) => {
    const target = densest(w, (c) => rootOf(w, c) === g.ctx.invaderRoot, POWERS.cull.radius);
    if (target && target.n >= 2) use(w, g, 'cull', target);
  },
  radiation: (w, g) => use(w, g, 'mutagen', densest(w, () => true, POWERS.mutagen.radius)),
  gigantism: (w, g) => {
    // Release grazing giants whenever affordable; cull the small in between.
    const design = { traits: { ...PRESETS.Giant, diet: 0.1 }, count: 10 };
    if (g.nutrients > releaseCost(design) + 30 && g.spend(releaseCost(design))) {
      w.introduce(design.traits, { count: design.count });
      return;
    }
    const small = densest(w, (c) => c.genome.traits.size < 1.3, POWERS.cull.radius);
    if (small && small.n >= 3) use(w, g, 'cull', small);
  },
  apex: (w, g) => {
    const hunters = densest(w, (c) => c.genome.traits.diet > 0.5, POWERS.mutagen.radius);
    if (hunters && g.nutrients > 40) return use(w, g, 'mutagen', hunters);
    const grazers = densest(w, (c) => c.genome.traits.diet < 0.2, POWERS.cull.radius);
    if (grazers && grazers.n >= 5) use(w, g, 'cull', grazers);
  },
};

function run(ch, seed, bot) {
  const world = new World({ seed, ...ch.world });
  for (let i = 0; i < (ch.warmupDays ?? 0) * TICKS_PER_DAY; i++) world.step();
  const game = startChallenge(ch, world);
  game.begin();
  let outcome = null;
  let best = -Infinity;
  let t = 0;
  while (!outcome) {
    for (let i = 0; i < 30; i++) world.step();
    if (bot && (t += 30) >= 90) {
      t = 0;
      BOTS[ch.id](world, game);
    }
    outcome = game.update(world);
    const p = ch.progress(world, game.ctx);
    best = Math.max(best, p.countdown ? -p.value : p.value);
  }
  const tag = outcome === 'won' ? `W${game.stars}` : 'l';
  return `${tag}@${world.day.toFixed(0)}(${Math.abs(best).toFixed(ch.id === 'gigantism' ? 1 : 0)})`;
}

for (const ch of CHALLENGES) {
  if (only && ch.id !== only) continue;
  for (const bot of [false, true]) {
    const results = [];
    for (let s = 0; s < seeds; s++) results.push(run(ch, `balance-${s}`, bot));
    const wins = results.filter((r) => r.startsWith('W')).length;
    console.log(`${ch.id.padEnd(14)} ${bot ? 'bot ' : 'idle'} ${wins}/${seeds}  ${results.join(' ')}`);
  }
}
