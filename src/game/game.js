// The game layer: a run's economy and outcome (Game), and the player's
// lifetime record of stars and achievements (Progress). Neither touches the
// DOM, so both are tested headlessly.

import { TICKS_PER_DAY } from '../sim/world.js';
import { CHALLENGES, challengeById, starsFor } from './challenges.js';
import { ACHIEVEMENTS } from './achievements.js';

export const POWERS = {
  feed: { label: 'Feed', cost: 4, radius: 26, key: 'F' },
  cull: { label: 'Cull', cost: 12, radius: 40, key: 'C' },
  mutagen: { label: 'Mutagen', cost: 18, radius: 70, key: 'U' },
};

// Dragging while feeding scatters smaller handfuls, at a smaller price.
export const FEED_DRAG_COST = 1;

export function releaseCost(design) {
  const base = design.count * (1 + design.traits.size) * 1.5;
  return Math.round(base * (design.weights ? 1.5 : 1));
}

// Biodiversity pays: every living species adds to the daily income.
export function incomePerDay(world) {
  return 6 + 2 * world.livingSpecies().length;
}

export class Game {
  constructor({ mode = 'sandbox', challengeId = null, nutrients = 0, ctx = {} } = {}) {
    this.mode = mode;
    this.challengeId = challengeId;
    this.nutrients = nutrients;
    this.spent = 0;
    this.ctx = ctx;
    this.status = mode === 'challenge' ? 'briefing' : 'playing';
    this.stars = 0;
    this.bonusResults = [];
    this.endDay = null;
    this.lastTick = null;
  }

  get challenge() {
    return challengeById(this.challengeId);
  }

  // Powers are free in the sandbox, and once a challenge has been decided.
  get free() {
    return this.mode !== 'challenge' || this.status === 'won' || this.status === 'lost';
  }

  canAfford(cost) {
    return this.free || this.nutrients >= cost;
  }

  spend(cost) {
    if (this.free) return true;
    if (this.status !== 'playing' || this.nutrients < cost) return false;
    this.nutrients -= cost;
    this.spent += cost;
    return true;
  }

  begin() {
    if (this.status === 'briefing') this.status = 'playing';
  }

  // Call after the world advances. Pays income for the elapsed ticks and
  // returns 'won' or 'lost' the moment the challenge is decided.
  update(world) {
    if (this.lastTick === null) this.lastTick = world.tick;
    const dt = world.tick - this.lastTick;
    this.lastTick = world.tick;
    if (this.mode !== 'challenge' || this.status !== 'playing') return null;
    this.nutrients += (incomePerDay(world) * dt) / TICKS_PER_DAY;
    const ch = this.challenge;
    const outcome = ch.outcome(world, this.ctx, this);
    if (!outcome) return null;
    this.status = outcome;
    this.endDay = world.tick / TICKS_PER_DAY;
    this.bonusResults = ch.bonuses.map((b) => (outcome === 'won' ? b.test(world, this.ctx, this) : false));
    this.stars = outcome === 'won' ? starsFor(ch, world, this.ctx, this) : 0;
    return outcome;
  }

  progress(world) {
    return this.mode === 'challenge' ? this.challenge.progress(world, this.ctx) : null;
  }

  toJSON() {
    const { mode, challengeId, nutrients, spent, ctx, status, stars, bonusResults, endDay, lastTick } = this;
    return { mode, challengeId, nutrients, spent, ctx, status, stars, bonusResults, endDay, lastTick };
  }

  static fromJSON(data) {
    const g = new Game({ mode: data.mode, challengeId: data.challengeId, nutrients: data.nutrients, ctx: data.ctx });
    Object.assign(g, data);
    // A challenge can't be half-briefed after a reload; resume it paused instead.
    if (g.status === 'briefing') g.status = 'playing';
    return g;
  }
}

// ------------------------------------------------------------------ progress

const PROGRESS_KEY = 'tidepool.progress.v1';

export class Progress {
  constructor(storage = null) {
    this.storage = storage;
    this.achievements = {};
    this.stars = {};
    this.stats = { fed: 0, culled: 0, released: 0, transplants: 0, examined: 0 };
    this.seen = new Set();
    try {
      const raw = storage?.getItem(PROGRESS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.achievements = data.achievements ?? {};
        this.stars = data.stars ?? {};
        this.stats = { ...this.stats, ...data.stats };
      }
    } catch {
      // Unreadable progress starts afresh.
    }
  }

  save() {
    try {
      this.storage?.setItem(
        PROGRESS_KEY,
        JSON.stringify({ achievements: this.achievements, stars: this.stars, stats: this.stats }),
      );
    } catch {
      // Storage unavailable: progress lasts for this visit only.
    }
  }

  count(stat, n = 1) {
    this.stats[stat] = (this.stats[stat] ?? 0) + n;
  }

  // Counts each creature once, however often it is examined.
  examine(world, creature) {
    const key = `${world.seed}:${creature.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.count('examined');
  }

  get perfect() {
    return CHALLENGES.every((c) => (this.stars[c.id] ?? 0) >= 3);
  }

  get totalStars() {
    return CHALLENGES.reduce((a, c) => a + (this.stars[c.id] ?? 0), 0);
  }

  unlocked(index) {
    return index === 0 || (this.stars[CHALLENGES[index - 1].id] ?? 0) > 0;
  }

  // Returns true when this beats the previous best.
  recordStars(challengeId, stars) {
    const best = this.stars[challengeId] ?? 0;
    if (stars <= best) return false;
    this.stars[challengeId] = stars;
    this.save();
    return true;
  }

  // Unlocks anything newly earned and returns those achievements.
  evaluate(world) {
    const fresh = [];
    const stats = { ...this.stats, perfect: this.perfect };
    for (const a of ACHIEVEMENTS) {
      if (this.achievements[a.id]) continue;
      if (a.check(world, stats)) {
        this.achievements[a.id] = new Date().toISOString();
        fresh.push(a);
      }
    }
    if (fresh.length) this.save();
    return fresh;
  }
}

// Call once the challenge's pool has warmed up: runs its setup (releasing
// invaders, say) and returns the Game that tracks the attempt.
export function startChallenge(challenge, world) {
  const ctx = challenge.setup?.(world) ?? {};
  const game = new Game({ mode: 'challenge', challengeId: challenge.id, nutrients: challenge.nutrients, ctx });
  game.lastTick = world.tick;
  return game;
}
