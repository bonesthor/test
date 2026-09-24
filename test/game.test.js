import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, TICKS_PER_DAY } from '../src/sim/world.js';
import { Rng } from '../src/sim/rng.js';
import { primordialGenome, mutate, geneticDistance } from '../src/sim/genome.js';
import { CHALLENGES, challengeById } from '../src/game/challenges.js';
import { ACHIEVEMENTS } from '../src/game/achievements.js';
import { Game, Progress, POWERS, releaseCost, incomePerDay, startChallenge } from '../src/game/game.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

function challengeWorld(id, seed = 'game') {
  const ch = challengeById(id);
  const world = new World({ seed, ...ch.world });
  for (let i = 0; i < (ch.warmupDays ?? 0) * TICKS_PER_DAY; i++) world.step();
  const game = startChallenge(ch, world);
  game.begin();
  return { ch, world, game };
}

test('challenge definitions are complete and uniquely named', () => {
  const ids = new Set();
  for (const ch of CHALLENGES) {
    assert.ok(!ids.has(ch.id), ch.id);
    ids.add(ch.id);
    for (const key of ['title', 'brief', 'goal', 'deadline', 'nutrients', 'progress', 'outcome']) assert.ok(ch[key] !== undefined, `${ch.id}.${key}`);
    assert.equal(ch.bonuses.length, 2, `${ch.id} has two bonus stars`);
    assert.ok(ch.tips.length >= 2);
  }
});

test('sandbox powers are free; challenge powers cost nutrients', () => {
  const sandbox = new Game();
  assert.ok(sandbox.spend(1e9));
  assert.equal(sandbox.spent, 0);

  const g = new Game({ mode: 'challenge', challengeId: 'first-light', nutrients: 20 });
  assert.equal(g.spend(POWERS.cull.cost), false, 'nothing can be spent during the briefing');
  g.begin();
  assert.ok(g.spend(POWERS.cull.cost));
  assert.equal(g.nutrients, 20 - POWERS.cull.cost);
  assert.equal(g.canAfford(POWERS.cull.cost), false);
  assert.equal(g.spend(POWERS.cull.cost), false);
  assert.equal(g.spent, POWERS.cull.cost);
});

test('release costs scale with founders, size and transplanted brains', () => {
  const small = releaseCost({ count: 10, traits: { size: 1 } });
  assert.ok(releaseCost({ count: 20, traits: { size: 1 } }) > small);
  assert.ok(releaseCost({ count: 10, traits: { size: 2 } }) > small);
  assert.ok(releaseCost({ count: 10, traits: { size: 1 }, weights: new Float32Array(1) }) > small);
});

test('income accrues only while a challenge is being played', () => {
  const { world, game } = challengeWorld('first-light');
  const before = game.nutrients;
  const rate = incomePerDay(world);
  for (let i = 0; i < 60; i++) world.step();
  game.update(world);
  assert.ok(Math.abs(game.nutrients - before - (rate * 60) / TICKS_PER_DAY) < rate * 0.05);

  const briefing = new Game({ mode: 'challenge', challengeId: 'first-light', nutrients: 5 });
  briefing.update(world);
  for (let i = 0; i < 60; i++) world.step();
  briefing.update(world);
  assert.equal(briefing.nutrients, 5);
});

test('first light is won by diversity and lost at the deadline', () => {
  const { world, game } = challengeWorld('first-light');
  let outcome = null;
  while (!outcome) {
    world.step();
    outcome = game.update(world);
  }
  const living = world.livingSpecies().length;
  if (outcome === 'won') {
    assert.ok(living >= 7);
    assert.ok(game.stars >= 1 && game.stars <= 3);
  } else {
    assert.ok(world.day >= 12);
    assert.equal(game.stars, 0);
  }
  assert.equal(game.status, outcome);
  assert.equal(game.update(world), null, 'a decided challenge stays decided');
});

test('invasion: wiping out the invaders wins, losing the natives loses', () => {
  const won = challengeWorld('invasion', 'inv-a');
  const invaders = () => won.world.creatures.filter((c) => won.world.species.get(c.speciesId).rootId === won.game.ctx.invaderRoot);
  assert.ok(invaders().length >= 20);
  assert.equal(won.world.species.get(won.game.ctx.invaderRoot).designed, false);
  for (const c of invaders()) won.world.kill(c, 'culled');
  won.world.step();
  assert.equal(won.game.update(won.world), 'won');
  assert.ok(won.game.stars >= 2, 'finishing early earns the speed star');

  const lost = challengeWorld('invasion', 'inv-b');
  for (const c of lost.world.creatures) {
    if (lost.world.species.get(c.speciesId).rootId !== lost.game.ctx.invaderRoot) lost.world.kill(c, 'culled');
  }
  lost.world.step();
  assert.equal(lost.game.update(lost.world), 'lost');
});

test('long winter is lost when the population drops too low', () => {
  const { world, game } = challengeWorld('long-winter');
  assert.equal(world.opts.foodScale, 0.55);
  assert.equal(world.opts.immigration, false);
  world.cull(world.width / 2, world.height / 2, 5000);
  world.step();
  assert.equal(world.creatures.length, 0, 'no rescue lineage drifts in');
  assert.equal(game.update(world), 'lost');
});

test('culling kills and tallies; mutagen marks creatures in range', () => {
  const world = new World({ seed: 'powers' });
  const target = world.creatures[0];
  const inRange = world.creatures.filter((c) => Math.hypot(c.x - target.x, c.y - target.y) <= 60 + c.radius).length;
  const marked = world.irradiate(target.x, target.y, 60);
  assert.equal(marked, inRange);
  assert.ok(target.mutagenUntil > world.tick);
  const before = world.creatures.filter((c) => c.alive).length;
  const culled = world.cull(target.x, target.y, 60);
  assert.equal(culled, inRange);
  assert.equal(world.deaths.culled, culled);
  assert.equal(world.creatures.filter((c) => c.alive).length, before - culled);
  assert.ok(world.food.some((f) => f.kind === 1), 'culled bodies become carrion');
});

test('mutagen-boosted offspring drift further from their parent', () => {
  const rng = new Rng('boost');
  const parent = primordialGenome(rng);
  let plain = 0;
  let boosted = 0;
  for (let i = 0; i < 40; i++) {
    plain += geneticDistance(parent, mutate(parent, rng));
    boosted += geneticDistance(parent, mutate(parent, rng, 5));
  }
  assert.ok(boosted > plain * 2.5, `${boosted} vs ${plain}`);
});

test('species inherit their founding lineage root', () => {
  const world = new World({ seed: 'roots' });
  for (let i = 0; i < TICKS_PER_DAY * 4; i++) world.step();
  const roots = new Set(world.speciesOrder.filter((s) => !s.parentId).map((s) => s.id));
  for (const sp of world.speciesOrder) {
    assert.ok(roots.has(sp.rootId));
    if (sp.parentId) assert.equal(sp.rootId, world.species.get(sp.parentId).rootId);
  }
  const total = [...world.lineageCounts().values()].reduce((a, b) => a + b, 0);
  assert.equal(total, world.creatures.length);

  const data = JSON.parse(JSON.stringify(world.toJSON()));
  for (const sp of data.species) delete sp.rootId;
  const restored = World.fromJSON(data);
  for (const sp of restored.speciesOrder) assert.equal(sp.rootId, world.species.get(sp.id).rootId);
});

test('games survive a save and reload', () => {
  const { world, game } = challengeWorld('invasion', 'inv-save');
  game.spend(12);
  const back = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(back.spent, 12);
  assert.equal(back.ctx.invaderRoot, game.ctx.invaderRoot);
  assert.equal(back.challenge.id, 'invasion');
  assert.equal(back.status, 'playing');
  back.update(world);
});

test('progress: achievements unlock once, persist, and gate the campaign', () => {
  const storage = memoryStorage();
  const progress = new Progress(storage);
  assert.ok(progress.unlocked(0));
  assert.equal(progress.unlocked(1), false);

  const world = new World({ seed: 'medals' });
  assert.equal(progress.evaluate(world).length, 0);
  world.totalKills = 1;
  progress.count('released');
  const fresh = progress.evaluate(world).map((a) => a.id);
  assert.deepEqual(fresh.sort(), ['first-blood', 'playing-god']);
  assert.equal(progress.evaluate(world).length, 0, 'no double unlocks');

  assert.ok(progress.recordStars('first-light', 2));
  assert.equal(progress.recordStars('first-light', 1), false, 'worse results do not overwrite');
  assert.ok(progress.unlocked(1));

  const reloaded = new Progress(storage);
  assert.ok(reloaded.achievements['first-blood']);
  assert.equal(reloaded.stars['first-light'], 2);
  assert.equal(reloaded.stats.released, 1);
  assert.equal(reloaded.totalStars, 2);

  const examined = new Progress(null);
  const c = world.creatures[0];
  examined.examine(world, c);
  examined.examine(world, c);
  assert.equal(examined.stats.examined, 1);
  assert.equal(ACHIEVEMENTS.length, new Set(ACHIEVEMENTS.map((a) => a.id)).size);
});
