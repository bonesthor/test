import { Rng } from './rng.js';
import { SpatialGrid } from './grid.js';
import { SECTORS, IN, OUT, createBrainState, think } from './brain.js';
import { primordialGenome, mutate, geneticDistance, cloneGenome } from './genome.js';
import { makeGenus, makeEpithet } from './names.js';

export const TICKS_PER_DAY = 600;
const SAMPLE_CAP = 1000;
const EVENT_CAP = 400;
const TAU = Math.PI * 2;

export const DEFAULTS = {
  width: 1600,
  height: 1000,
  maxPlankton: 1100,
  foodRate: 1.1, // plankton per tick at the height of a bloom
  plantEnergy: 16,
  startPopulation: 70,
  founders: 3,
  minPopulation: 10,
  maxPopulation: 700,
  speciesThreshold: 0.25,
  seasonDays: 12,
  upwellings: 3,
};

export const CAUSES = {
  starvation: 'starved',
  predation: 'was eaten',
  age: 'died of old age',
};

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export class World {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    // Pools of other shapes keep the same density of food and life.
    const area = (this.opts.width * this.opts.height) / (DEFAULTS.width * DEFAULTS.height);
    for (const key of ['maxPlankton', 'foodRate', 'startPopulation', 'maxPopulation']) {
      if (options[key] === undefined) this.opts[key] = DEFAULTS[key] * area;
    }
    this.opts.startPopulation = Math.round(this.opts.startPopulation);
    this.seed = options.seed ?? 'tidepool';
    this.rng = new Rng(this.seed);
    this.width = this.opts.width;
    this.height = this.opts.height;
    this.tick = 0;
    this.nextId = 1;
    this.nextSpeciesId = 1;
    this.creatures = [];
    this.byId = new Map();
    this.food = [];
    this.plankton = 0;
    this.species = new Map();
    this.speciesOrder = [];
    this.events = [];
    this.maxGeneration = 0;
    this.totalBorn = 0;
    this.totalKills = 0;
    this.firstKill = false;
    this.foodDebt = 0;
    this.sampleEvery = 60;
    this.samples = [];
    this.lastSeasonPhase = null;
    this.lastHunterTick = 0;

    this.creatureGrid = new SpatialGrid(this.width, this.height, 80);
    this.foodGrid = new SpatialGrid(this.width, this.height, 50);

    this.upwellings = [];
    for (let i = 0; i < this.opts.upwellings; i++) {
      this.upwellings.push({
        x: this.rng.range(0.15, 0.85) * this.width,
        y: this.rng.range(0.15, 0.85) * this.height,
        r: this.rng.range(110, 190),
        vx: 0,
        vy: 0,
        phase: this.rng.range(0, TAU),
        intensity: 1,
      });
    }

    // A head start of plankton so the first generation isn't born into famine.
    for (let i = 0; i < this.opts.maxPlankton * 0.6; i++) this.spawnPlankton();
    this.seedLife(this.opts.startPopulation, this.opts.founders, 'The pool fills. Founding lineages drift in.');
    this.record();
  }

  // ---------------------------------------------------------------- time

  get day() {
    return this.tick / TICKS_PER_DAY;
  }

  get season() {
    // 1 = plankton bloom, 0 = lean season.
    const t = this.tick / (TICKS_PER_DAY * this.opts.seasonDays);
    return 0.5 + 0.5 * Math.sin(t * TAU);
  }

  // ---------------------------------------------------------------- life

  seedLife(count, founders, message, { hunters = false } = {}) {
    const ids = [];
    for (let f = 0; f < founders; f++) {
      // The last of several founders is a hunter, so predators have a foothold.
      const hunter = hunters || (founders > 1 && f === founders - 1);
      const genome = primordialGenome(this.rng, hunter);
      const sp = this.createSpecies(genome, null);
      ids.push(sp.id);
      for (let i = 0; i < Math.ceil(count / founders); i++) {
        const g = i === 0 ? cloneGenome(genome) : mutate(genome, this.rng);
        const c = this.spawnCreature(g, sp.id, {
          x: this.rng.range(40, this.width - 40),
          y: this.rng.range(40, this.height - 40),
          generation: 0,
        });
        c.energy = c.maxEnergy * 0.6;
        c.age = this.rng.int(c.maturity);
      }
    }
    this.log('seed', message, ids);
  }

  spawnCreature(genome, speciesId, { x, y, angle, generation, parentId = null }) {
    const t = genome.traits;
    const s = t.size;
    const c = {
      id: this.nextId++,
      genome,
      speciesId,
      parentId,
      generation,
      bornTick: this.tick,
      x,
      y,
      angle: angle ?? this.rng.range(0, TAU),
      vx: 0,
      vy: 0,
      speed: 0,
      thrust: 0,
      turn: 0,
      bite: 0,
      radiusFull: 5 * s,
      radius: 5 * s * 0.55,
      maxEnergy: 120 * s * s,
      maxHealth: 30 * s * s,
      energy: 0,
      health: 30 * s * s,
      age: 0,
      maturity: Math.round(170 + 90 * s),
      lifespan: Math.round(TICKS_PER_DAY * (3 + 2 * s) * this.rng.range(0.85, 1.15)),
      brain: createBrainState(),
      biteCooldown: 0,
      sinceBite: 999,
      sinceHurt: 999,
      plankton: 0,
      carrion: 0,
      kills: 0,
      children: 0,
      lastChildId: null,
      alive: true,
      cause: null,
      killerId: null,
      diedTick: null,
      wiggle: this.rng.range(0, TAU),
    };
    this.creatures.push(c);
    this.byId.set(c.id, c);
    const sp = this.species.get(speciesId);
    sp.population++;
    sp.totalBorn++;
    if (sp.population > sp.peak) sp.peak = sp.population;
    this.totalBorn++;
    if (generation > this.maxGeneration) this.maxGeneration = generation;
    return c;
  }

  // ------------------------------------------------------------- species

  createSpecies(founder, parentId) {
    const parent = parentId ? this.species.get(parentId) : null;
    const taken = (epithet) => this.speciesOrder.some((s) => s.genus === genus && s.epithet === epithet);
    let genus;
    let genusDepth;
    if (!parent || parent.genusDepth >= 3 || this.rng.chance(0.15)) {
      genus = makeGenus(this.rng);
      genusDepth = 0;
    } else {
      genus = parent.genus;
      genusDepth = parent.genusDepth + 1;
    }
    const epithet = makeEpithet(founder.traits, this.rng, taken);
    const sp = {
      id: this.nextSpeciesId++,
      genus,
      epithet,
      name: `${genus} ${epithet}`,
      genusDepth,
      parentId,
      founder: cloneGenome(founder),
      hue: founder.traits.hue,
      bornTick: this.tick,
      extinctTick: null,
      population: 0,
      peak: 0,
      totalBorn: 0,
      kills: 0,
      historyStart: this.samples.length,
      history: [],
      closed: false,
      depth: parent ? parent.depth + 1 : 0,
    };
    this.species.set(sp.id, sp);
    this.speciesOrder.push(sp);
    return sp;
  }

  classify(genome, parentSpeciesId) {
    const threshold = this.opts.speciesThreshold;
    const home = this.species.get(parentSpeciesId);
    const dHome = geneticDistance(genome, home.founder);
    if (dHome < threshold) return parentSpeciesId;

    // Close enough to a living cousin? Join it rather than founding yet another.
    let best = null;
    let bestD = threshold;
    for (const sp of this.speciesOrder) {
      if (sp.population <= 0 || sp.id === parentSpeciesId) continue;
      const d = geneticDistance(genome, sp.founder);
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    if (best) return best.id;

    const sp = this.createSpecies(genome, parentSpeciesId);
    const traitNote = describeShift(home.founder.traits, genome.traits);
    this.log('speciation', `${sp.name} branches from ${home.name}${traitNote}.`, [sp.id, home.id]);
    if (genome.traits.diet > 0.6 && !this.firstCarnivore) {
      this.firstCarnivore = true;
      this.log('record', `${sp.name} is the pool's first true predator.`, [sp.id]);
    }
    return sp.id;
  }

  livingSpecies() {
    return this.speciesOrder.filter((s) => s.population > 0);
  }

  // ---------------------------------------------------------------- food

  spawnPlankton(x, y) {
    if (x === undefined) {
      const rng = this.rng;
      if (rng.chance(0.78)) {
        let total = 0;
        for (const u of this.upwellings) total += u.intensity;
        let pick = rng.next() * total;
        let u = this.upwellings[0];
        for (const w of this.upwellings) {
          pick -= w.intensity;
          if (pick <= 0) {
            u = w;
            break;
          }
        }
        x = u.x + rng.gauss() * u.r * 0.6;
        y = u.y + rng.gauss() * u.r * 0.6;
      } else {
        x = rng.range(0, this.width);
        y = rng.range(0, this.height);
      }
      if (x < 4 || y < 4 || x > this.width - 4 || y > this.height - 4) return null;
    }
    const f = { x, y, energy: this.opts.plantEnergy, kind: 0, alive: true, age: 0 };
    this.food.push(f);
    this.plankton++;
    return f;
  }

  dropCarrion(x, y, energy, count) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      const r = this.rng.range(0, 6);
      this.food.push({
        x: Math.min(this.width - 2, Math.max(2, x + Math.cos(a) * r)),
        y: Math.min(this.height - 2, Math.max(2, y + Math.sin(a) * r)),
        energy: energy / count,
        kind: 1,
        alive: true,
        age: 0,
      });
    }
  }

  // Scatter plankton by hand (the "feed" tool).
  sprinkle(x, y, amount = 24) {
    for (let i = 0; i < amount; i++) {
      const a = this.rng.range(0, TAU);
      const r = Math.abs(this.rng.gauss()) * 26;
      const fx = x + Math.cos(a) * r;
      const fy = y + Math.sin(a) * r;
      if (fx > 2 && fy > 2 && fx < this.width - 2 && fy < this.height - 2) this.spawnPlankton(fx, fy);
    }
  }

  // ---------------------------------------------------------------- step

  step() {
    this.tick++;
    this.updateEnvironment();

    this.creatureGrid.clear();
    for (const c of this.creatures) this.creatureGrid.insert(c);
    this.foodGrid.clear();
    for (const f of this.food) if (f.alive) this.foodGrid.insert(f);

    const newborn = [];
    const n = this.creatures.length;
    for (let i = 0; i < n; i++) {
      const c = this.creatures[i];
      if (!c.alive) continue;
      this.sense(c);
      think(c.genome.weights, c.brain);
      this.act(c);
      if (c.alive) this.metabolise(c, newborn);
    }

    // Sweep the dead.
    let w = 0;
    for (const c of this.creatures) {
      if (c.alive) this.creatures[w++] = c;
      else this.byId.delete(c.id);
    }
    this.creatures.length = w;

    let fw = 0;
    let plankton = 0;
    for (const f of this.food) {
      if (!f.alive) continue;
      f.age++;
      if (f.kind === 1) {
        f.energy *= 0.9982;
        if (f.energy < 2) continue;
      } else plankton++;
      this.food[fw++] = f;
    }
    this.food.length = fw;
    this.plankton = plankton;

    if (this.creatures.length < this.opts.minPopulation) {
      this.seedLife(
        this.opts.minPopulation * 2,
        1,
        'Numbers are dangerously low. A new founding lineage drifts in on the tide.',
      );
    }

    // If predators have been gone a while, the tide eventually brings more.
    if (this.tick % (TICKS_PER_DAY * 2) === 0) {
      const hunting = this.creatures.some((c) => c.genome.traits.diet > 0.4);
      if (hunting) this.lastHunterTick = this.tick;
      else if (this.tick - this.lastHunterTick > TICKS_PER_DAY * 14 && this.creatures.length > 60) {
        this.lastHunterTick = this.tick;
        this.seedLife(8, 1, 'Hunters wash in on a spring tide.', { hunters: true });
      }
    }

    if (this.tick % this.sampleEvery === 0) this.record();
  }

  updateEnvironment() {
    const rng = this.rng;
    const t = this.tick / (TICKS_PER_DAY * this.opts.seasonDays * 0.7);
    for (const u of this.upwellings) {
      u.vx = (u.vx + rng.gauss() * 0.004) * 0.995;
      u.vy = (u.vy + rng.gauss() * 0.004) * 0.995;
      u.x += u.vx;
      u.y += u.vy;
      const m = u.r * 0.6;
      if (u.x < m || u.x > this.width - m) {
        u.vx = -u.vx;
        u.x = Math.min(this.width - m, Math.max(m, u.x));
      }
      if (u.y < m || u.y > this.height - m) {
        u.vy = -u.vy;
        u.y = Math.min(this.height - m, Math.max(m, u.y));
      }
      u.intensity = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * TAU + u.phase));
    }

    const season = this.season;
    const phase = season > 0.5 ? 'bloom' : 'lean';
    if (this.lastSeasonPhase && phase !== this.lastSeasonPhase) {
      this.log(
        'season',
        phase === 'bloom' ? 'The water warms. A plankton bloom begins.' : 'The water cools. The lean season begins.',
      );
    }
    this.lastSeasonPhase = phase;

    this.foodDebt += this.opts.foodRate * (0.2 + 0.8 * season);
    while (this.foodDebt >= 1) {
      this.foodDebt -= 1;
      if (this.plankton < this.opts.maxPlankton) this.spawnPlankton();
    }
  }

  sense(c) {
    const inp = c.brain.input;
    inp.fill(0);
    const t = c.genome.traits;
    const range = t.sense;
    const range2 = range * range;
    const half = t.fov / 2;
    const fov = t.fov;
    const angle = c.angle;

    // Plankton & carrion.
    let grid = this.foodGrid;
    let x0 = Math.max(0, ((c.x - range) / grid.cell) | 0);
    let x1 = Math.min(grid.cols - 1, ((c.x + range) / grid.cell) | 0);
    let y0 = Math.max(0, ((c.y - range) / grid.cell) | 0);
    let y1 = Math.min(grid.rows - 1, ((c.y + range) / grid.cell) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = grid.buckets[cy * grid.cols + cx];
        for (let i = 0; i < b.length; i++) {
          const f = b[i];
          const dx = f.x - c.x;
          const dy = f.y - c.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > range2) continue;
          const rel = wrapAngle(Math.atan2(dy, dx) - angle);
          if (rel < -half || rel > half) continue;
          const s = Math.min(SECTORS - 1, (((rel + half) / fov) * SECTORS) | 0);
          const p = 1 - Math.sqrt(d2) / range;
          const slot = (f.kind === 0 ? IN.plant : IN.meat) + s;
          if (p > inp[slot]) inp[slot] = p;
        }
      }
    }

    // Other creatures.
    grid = this.creatureGrid;
    x0 = Math.max(0, ((c.x - range) / grid.cell) | 0);
    x1 = Math.min(grid.cols - 1, ((c.x + range) / grid.cell) | 0);
    y0 = Math.max(0, ((c.y - range) / grid.cell) | 0);
    y1 = Math.min(grid.rows - 1, ((c.y + range) / grid.cell) | 0);
    let nearest = null;
    let nearestD2 = Infinity;
    let prey = null;
    let preyD2 = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = grid.buckets[cy * grid.cols + cx];
        for (let i = 0; i < b.length; i++) {
          const o = b[i];
          if (o === c || !o.alive) continue;
          const dx = o.x - c.x;
          const dy = o.y - c.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > range2) continue;
          const rel = wrapAngle(Math.atan2(dy, dx) - angle);
          if (rel < -half || rel > half) continue;
          const s = Math.min(SECTORS - 1, (((rel + half) / fov) * SECTORS) | 0);
          const p = 1 - Math.sqrt(d2) / range;
          if (p > inp[IN.creature + s]) inp[IN.creature + s] = p;
          if (d2 < nearestD2) {
            nearestD2 = d2;
            nearest = o;
          }
          const reach = c.radius + o.radius + 3;
          if (d2 < reach * reach && Math.abs(rel) < 0.9 && d2 < preyD2) {
            preyD2 = d2;
            prey = o;
          }
        }
      }
    }
    if (nearest) {
      inp[IN.rivalSize] = Math.tanh(Math.log(nearest.radius / c.radius) * 2);
      inp[IN.kinship] = nearest.speciesId === c.speciesId ? 1 : 0;
    }
    c.prey = prey;

    // Distance to the wall along the heading.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = cos > 1e-6 ? (this.width - c.x) / cos : cos < -1e-6 ? -c.x / cos : Infinity;
    const ty = sin > 1e-6 ? (this.height - c.y) / sin : sin < -1e-6 ? -c.y / sin : Infinity;
    inp[IN.wall] = Math.max(0, 1 - Math.min(tx, ty) / range);

    inp[IN.energy] = c.energy / c.maxEnergy;
    inp[IN.health] = c.health / c.maxHealth;
    inp[IN.speed] = Math.min(1, c.speed / 2);
    inp[IN.pulse] = Math.sin(c.age * 0.06);
    const out = c.brain.output;
    inp[IN.memA] = out[OUT.memA];
    inp[IN.memB] = out[OUT.memB];
    inp[IN.bias] = 1;
  }

  act(c) {
    const out = c.brain.output;
    const t = c.genome.traits;
    const s = t.size;
    let thrust = out[OUT.thrust];
    if (thrust < 0) thrust *= 0.3;
    c.thrust = thrust;
    c.turn = out[OUT.turn];
    c.angle = wrapAngle(c.angle + c.turn * 0.13 / Math.sqrt(s));

    const accel = thrust * 0.12 * t.speed;
    c.vx = (c.vx + Math.cos(c.angle) * accel) * 0.9;
    c.vy = (c.vy + Math.sin(c.angle) * accel) * 0.9;
    c.x += c.vx;
    c.y += c.vy;
    const r = c.radius;
    if (c.x < r) (c.x = r), (c.vx = Math.abs(c.vx) * 0.5);
    if (c.x > this.width - r) (c.x = this.width - r), (c.vx = -Math.abs(c.vx) * 0.5);
    if (c.y < r) (c.y = r), (c.vy = Math.abs(c.vy) * 0.5);
    if (c.y > this.height - r) (c.y = this.height - r), (c.vy = -Math.abs(c.vy) * 0.5);
    c.speed = Math.hypot(c.vx, c.vy);
    c.wiggle += 0.15 + c.speed * 0.5;

    // Graze on anything touching the mouth.
    const grid = this.foodGrid;
    const reach = r + 3;
    const x0 = Math.max(0, ((c.x - reach) / grid.cell) | 0);
    const x1 = Math.min(grid.cols - 1, ((c.x + reach) / grid.cell) | 0);
    const y0 = Math.max(0, ((c.y - reach) / grid.cell) | 0);
    const y1 = Math.min(grid.rows - 1, ((c.y + reach) / grid.cell) | 0);
    const plantEff = 1 - 0.9 * t.diet * t.diet;
    const meatEff = 0.2 + 0.8 * t.diet;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = grid.buckets[cy * grid.cols + cx];
        for (let i = 0; i < b.length; i++) {
          const f = b[i];
          if (!f.alive) continue;
          const dx = f.x - c.x;
          const dy = f.y - c.y;
          if (dx * dx + dy * dy > reach * reach) continue;
          if (c.energy >= c.maxEnergy) break;
          f.alive = false;
          if (f.kind === 0) {
            c.energy += f.energy * plantEff;
            c.plankton++;
          } else {
            c.energy += f.energy * meatEff;
            c.carrion++;
          }
        }
      }
    }
    if (c.energy > c.maxEnergy) c.energy = c.maxEnergy;

    // Bite whatever is in front of us.
    c.bite = out[OUT.bite];
    c.sinceBite++;
    c.sinceHurt++;
    if (c.biteCooldown > 0) c.biteCooldown--;
    if (c.bite > 0 && c.biteCooldown === 0) {
      c.biteCooldown = 14;
      c.energy -= 0.4 * s;
      const prey = c.prey;
      if (prey && prey.alive) {
        c.sinceBite = 0;
        const grown = Math.min(1, c.age / c.maturity);
        const damage = (2 + 14 * t.diet) * s * (0.5 + 0.5 * grown);
        prey.health -= damage;
        prey.sinceHurt = 0;
        const taken = Math.min(Math.max(0, prey.energy), damage * 1.2);
        prey.energy -= taken;
        c.energy = Math.min(c.maxEnergy, c.energy + taken * meatEff * 1.5);
        if (prey.health <= 0) {
          // The killer gets first helping of the carcass; the rest sinks as carrion.
          const feast = Math.min(c.maxEnergy - c.energy, this.carcassEnergy(prey) * 0.5);
          c.energy += feast * meatEff;
          this.kill(prey, 'predation', c, feast);
          c.kills++;
          this.totalKills++;
          const sp = this.species.get(c.speciesId);
          sp.kills++;
          if (!this.firstKill) {
            this.firstKill = true;
            this.log('record', `First blood: a ${sp.name} kills a ${this.species.get(prey.speciesId).name}.`, [
              c.speciesId,
              prey.speciesId,
            ]);
          }
        }
      }
    }
  }

  metabolise(c, newborn) {
    const t = c.genome.traits;
    const s = t.size;
    c.age++;
    const grown = Math.min(1, c.age / c.maturity);
    c.radius = c.radiusFull * (0.55 + 0.45 * grown);

    const s2 = s * s;
    const s15 = s * Math.sqrt(s);
    let cost = 0.018 * s15 + 0.03 * Math.abs(c.thrust) * t.speed * t.speed * s2 + 0.00007 * t.sense + 0.0022 * t.fov;
    if (c.health < c.maxHealth) {
      const heal = Math.min(c.maxHealth - c.health, 0.04 * s2);
      c.health += heal;
      cost += heal;
    }
    c.energy -= cost;

    if (c.health <= 0) return this.kill(c, 'predation');
    if (c.energy <= 0) return this.kill(c, 'starvation');
    if (c.age > c.lifespan) return this.kill(c, 'age');

    if (
      grown >= 1 &&
      c.energy >= t.fertility * c.maxEnergy &&
      this.creatures.length + newborn.length < this.opts.maxPopulation
    ) {
      this.reproduce(c, newborn);
    }
  }

  reproduce(parent, newborn) {
    const genome = mutate(parent.genome, this.rng);
    const speciesId = this.classify(genome, parent.speciesId);
    const back = parent.radius + 4;
    const child = this.spawnCreature(genome, speciesId, {
      x: Math.min(this.width - 3, Math.max(3, parent.x - Math.cos(parent.angle) * back)),
      y: Math.min(this.height - 3, Math.max(3, parent.y - Math.sin(parent.angle) * back)),
      angle: parent.angle + Math.PI + this.rng.gauss() * 0.6,
      generation: parent.generation + 1,
      parentId: parent.id,
    });
    const gift = parent.energy * parent.genome.traits.invest;
    parent.energy -= gift * 1.15 + 10; // every body costs something to build
    child.energy = Math.min(child.maxEnergy, gift);
    parent.children++;
    parent.lastChildId = child.id;
    newborn.push(child);
  }

  carcassEnergy(c) {
    const body = 26 * c.genome.traits.size ** 2 * (0.55 + 0.45 * Math.min(1, c.age / c.maturity));
    return body + Math.max(0, c.energy) * 0.5;
  }

  kill(c, cause, killer = null, eaten = 0) {
    if (!c.alive) return;
    c.alive = false;
    c.cause = cause;
    c.killerId = killer ? killer.id : null;
    c.diedTick = this.tick;
    const remains = this.carcassEnergy(c) - eaten;
    if (remains > 2) this.dropCarrion(c.x, c.y, remains, 1 + Math.floor(c.genome.traits.size * 1.5));
    const sp = this.species.get(c.speciesId);
    sp.population--;
    if (sp.population === 0) {
      sp.extinctTick = this.tick;
      if (sp.peak >= 4) {
        const days = ((this.tick - sp.bornTick) / TICKS_PER_DAY).toFixed(1);
        this.log('extinction', `${sp.name} is extinct after ${days} days (peak ${sp.peak}).`, [sp.id]);
      }
    }
  }

  // ------------------------------------------------------------- records

  record() {
    let diet = 0;
    let size = 0;
    for (const c of this.creatures) {
      diet += c.genome.traits.diet;
      size += c.genome.traits.size;
    }
    const n = this.creatures.length || 1;
    let carrion = 0;
    for (const f of this.food) if (f.kind === 1) carrion++;
    this.samples.push({
      tick: this.tick,
      population: this.creatures.length,
      plankton: this.plankton,
      carrion,
      diet: diet / n,
      size: size / n,
      species: this.livingSpecies().length,
      season: this.season,
    });
    const idx = this.samples.length - 1;
    for (const sp of this.speciesOrder) {
      if (sp.closed) continue;
      const k = idx - sp.historyStart;
      if (k >= 0) sp.history[k] = sp.population;
      if (sp.extinctTick !== null) sp.closed = true;
    }
    if (this.samples.length > SAMPLE_CAP) this.compressHistory();
  }

  compressHistory() {
    this.samples = this.samples.filter((_, i) => i % 2 === 0);
    for (const sp of this.speciesOrder) {
      const start = Math.floor(sp.historyStart / 2);
      const hist = [];
      for (let k = 0; k < sp.history.length; k++) {
        const j = Math.floor((sp.historyStart + k) / 2) - start;
        hist[j] = Math.max(hist[j] ?? 0, sp.history[k] ?? 0);
      }
      sp.historyStart = start;
      sp.history = hist;
    }
    this.sampleEvery *= 2;
  }

  log(kind, text, speciesIds = []) {
    this.events.push({ tick: this.tick, kind, text, speciesIds });
    if (this.events.length > EVENT_CAP) this.events.splice(0, this.events.length - EVENT_CAP);
    this.onEvent?.(this.events[this.events.length - 1]);
  }
}

// A short parenthetical noting the biggest change in body plan.
function describeShift(from, to) {
  const notes = [];
  const dd = to.diet - from.diet;
  if (Math.abs(dd) > 0.08) notes.push(dd > 0 ? 'more carnivorous' : 'more herbivorous');
  const ds = to.size - from.size;
  if (Math.abs(ds) > 0.15) notes.push(ds > 0 ? 'larger' : 'smaller');
  const dv = to.speed - from.speed;
  if (Math.abs(dv) > 0.15) notes.push(dv > 0 ? 'faster' : 'slower');
  const de = to.sense - from.sense;
  if (Math.abs(de) > 25) notes.push(de > 0 ? 'sharper-eyed' : 'shorter-sighted');
  if (!notes.length) return ', rewired but outwardly similar';
  return `, ${notes.slice(0, 2).join(' and ')}`;
}
