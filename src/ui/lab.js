// The Lab: design a body plan, preview it swimming, and release a founding
// population into the pool. Brains start from the same hand-wired reflexes
// as the pool's first creatures; evolution does the rest.

import { TRAITS, codeToGenome } from '../sim/genome.js';
import { Rng } from '../sim/rng.js';
import { makeGenus, makeEpithet } from '../sim/names.js';
import { TICKS_PER_DAY } from '../sim/world.js';
import { theme, speciesColor, dietClass, DIET_LABEL } from './theme.js';
import { drawCreature } from './render.js';
import { sizeCanvas } from './charts.js';

const SLIDERS = [
  ['size', 'Body size', 0.01, (v) => `${(v * 10).toFixed(0)} µm`],
  ['diet', 'Diet', 0.01, (v) => DIET_LABEL[dietClass(v)]],
  ['speed', 'Muscle', 0.01, (v) => v.toFixed(2)],
  ['sense', 'Sight range', 1, (v) => `${Math.round(v)} µm`],
  ['fov', 'Field of view', 0.01, (v) => `${Math.round((v * 180) / Math.PI)}°`],
  ['fertility', 'Brood threshold', 0.01, (v) => `${Math.round(v * 100)}%`],
  ['invest', 'Brood investment', 0.01, (v) => `${Math.round(v * 100)}%`],
  ['mutation', 'Mutation rate', 0.005, (v) => v.toFixed(3)],
  ['hue', 'Pigment', 1, (v) => `${Math.round(v)}°`],
];

export const PRESETS = {
  Grazer: { size: 1, diet: 0.05, speed: 0.9, sense: 110, fov: 2.6, fertility: 0.65, invest: 0.35, mutation: 0.05, hue: 110 },
  Hunter: { size: 1.6, diet: 0.85, speed: 1.3, sense: 170, fov: 1.6, fertility: 0.75, invest: 0.45, mutation: 0.05, hue: 8 },
  Giant: { size: 2.3, diet: 0.3, speed: 0.7, sense: 150, fov: 2.2, fertility: 0.85, invest: 0.55, mutation: 0.04, hue: 265 },
  Swarm: { size: 0.65, diet: 0.05, speed: 1, sense: 70, fov: 3.2, fertility: 0.5, invest: 0.2, mutation: 0.08, hue: 48 },
  Sentinel: { size: 1.1, diet: 0.15, speed: 0.8, sense: 215, fov: 5, fertility: 0.7, invest: 0.35, mutation: 0.05, hue: 190 },
};

export function nameFor(traits) {
  // Deterministic in the design, so the preview name is the one you get.
  const rng = new Rng(Object.values(traits).map((v) => v.toFixed(2)).join('|'));
  return { genus: makeGenus(rng), epithet: makeEpithet(traits, rng, () => false) };
}

export class Lab {
  constructor(root, { onRelease }) {
    this.root = root;
    this.onRelease = onRelease;
    this.traits = { ...PRESETS.Hunter };
    this.count = 12;
    this.weights = null; // an evolved brain, when a genome code is loaded
    this.wiggle = 0;
    this.build();
    this.sync();
  }

  build() {
    const form = this.root.querySelector('#lab-form');
    form.innerHTML =
      SLIDERS.map(([key, label, step]) => {
        const t = TRAITS[key];
        return `<label class="slider${key === 'hue' ? ' hue' : ''}${key === 'diet' ? ' diet' : ''}" for="lab-${key}">
          <span>${label}</span>
          <input type="range" id="lab-${key}" name="${key}" min="${t.min}" max="${t.max}" step="${step}" />
          <output id="lab-${key}-v"></output>
        </label>`;
      }).join('') +
      `<label class="slider" for="lab-count"><span>Founders</span>
        <input type="range" id="lab-count" name="count" min="4" max="30" step="1" /><output id="lab-count-v"></output></label>`;
    form.addEventListener('input', (e) => {
      const { name, value } = e.target;
      if (name === 'count') this.count = Number(value);
      else this.traits[name] = Number(value);
      this.sync(false);
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    const presets = this.root.querySelector('#lab-presets');
    presets.innerHTML = Object.keys(PRESETS)
      .map((name) => `<button type="button" class="btn" data-preset="${name}">${name}</button>`)
      .join('');
    presets.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      this.traits = { ...PRESETS[b.dataset.preset] };
      this.sync();
    });

    const status = this.root.querySelector('#lab-code-status');
    const forget = this.root.querySelector('#lab-forget');
    this.root.querySelector('#lab-load').addEventListener('click', () => {
      try {
        const g = codeToGenome(this.root.querySelector('#lab-code').value);
        this.traits = { ...g.traits };
        this.weights = g.weights;
        status.dataset.state = 'ok';
        status.textContent = 'Genome loaded. Founders will carry its evolved brain.';
        forget.hidden = false;
        this.sync();
      } catch (err) {
        status.dataset.state = 'error';
        status.textContent = err.message;
      }
    });
    forget.addEventListener('click', () => {
      this.weights = null;
      forget.hidden = true;
      status.dataset.state = 'ok';
      status.textContent = 'Founders will start from the simple starter reflexes.';
      this.sync(false);
    });

    this.root.querySelector('#lab-release').addEventListener('click', () => this.onRelease(this.design(), true));
    this.root.querySelector('#lab-random').addEventListener('click', () => this.onRelease(this.design(), false));
  }

  design() {
    return { traits: { ...this.traits }, count: this.count, name: nameFor(this.traits), weights: this.weights };
  }

  sync(updateInputs = true) {
    for (const [key, , , fmt] of SLIDERS) {
      const input = this.root.querySelector(`#lab-${key}`);
      if (updateInputs) input.value = this.traits[key];
      this.root.querySelector(`#lab-${key}-v`).textContent = fmt(this.traits[key]);
    }
    const count = this.root.querySelector('#lab-count');
    if (updateInputs) count.value = this.count;
    this.root.querySelector('#lab-count-v').textContent = this.count;

    const t = this.traits;
    const { genus, epithet } = nameFor(t);
    const nameEl = this.root.querySelector('#lab-name');
    nameEl.textContent = `${genus} ${epithet}`;
    nameEl.style.color = speciesColor(t.hue);
    const s = t.size;
    const store = 120 * s * s;
    const burn = (0.018 * s * Math.sqrt(s) + 0.00007 * t.sense + 0.0022 * t.fov) * TICKS_PER_DAY;
    const bite = (2 + 14 * t.diet) * s;
    this.root.querySelector('#lab-budget').textContent =
      `Stores ${Math.round(store)} energy · burns ${burn.toFixed(0)}/day at rest · bite ${bite.toFixed(0)} · breeds at ${Math.round(store * t.fertility)}` +
      (this.weights ? ' · evolved brain' : ' · starter reflexes');
    this.root.querySelector('#lab-release').textContent = `Release ${this.count} into the pool`;
  }

  // Animated preview: the creature swims in place beside a plankton grain for scale.
  draw(dt) {
    const canvas = this.root.querySelector('#lab-preview');
    const { ctx, w, h } = sizeCanvas(canvas, 150);
    const dpr = canvas.width / w;
    ctx.fillStyle = theme.pool;
    ctx.fillRect(0, 0, w, h);
    const t = this.traits;
    const zoom = Math.min(6, (h * 0.26) / (5 * t.size));
    const cx = w * 0.45;
    const cy = h / 2;

    // Faint 10 µm grid.
    ctx.strokeStyle = theme.poolGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const g = 10 * zoom;
    for (let x = cx % g; x < w; x += g) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = cy % g; y < h; y += g) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Field of view.
    const angle = Math.sin(this.wiggle * 0.05) * 0.25;
    ctx.fillStyle = theme.focus;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, w, angle - t.fov / 2, angle + t.fov / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    this.wiggle += dt * 0.06 * (0.6 + t.speed);
    const r = 5 * t.size;
    const creature = {
      radius: r,
      energy: 1,
      maxEnergy: 1,
      angle,
      x: 0,
      y: 0,
      thrust: 0.6,
      wiggle: this.wiggle,
      sinceBite: Math.sin(this.wiggle * 0.3) > 0.8 ? 0 : 99,
      sinceHurt: 99,
      genome: { traits: t },
    };
    const k = dpr * zoom;
    drawCreature(ctx, creature, t.hue, 1 / zoom, { k, e: dpr * cx, f: dpr * cy });

    // A plankton grain and a 10 µm bar for scale.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.plankton;
    ctx.beginPath();
    ctx.arc(w * 0.84, cy, 1.6 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.muted;
    ctx.fillRect(12, h - 14, 10 * zoom, 2);
    ctx.font = `10px 'IBM Plex Mono', monospace`;
    ctx.fillText('10 µm', 12, h - 20);
  }
}

// Small illustrations for the About dialog's key, drawn with the pool's own renderer.
const KEY = {
  grazer: { traits: { size: 1.1, diet: 0.05, fov: 2.6 }, hue: 120 },
  hunter: { traits: { size: 1.5, diet: 0.85, fov: 1.6 }, hue: 8, sinceBite: 0 },
  hungry: { traits: { size: 1.1, diet: 0.1, fov: 2.6 }, hue: 210, energy: 0.1 },
  bitten: { traits: { size: 1.1, diet: 0.1, fov: 2.6 }, hue: 280, sinceHurt: 2 },
};

export function drawKey(root) {
  for (const canvas of root.querySelectorAll('canvas[data-key]')) {
    const { ctx, w, h } = sizeCanvas(canvas, 40);
    const dpr = canvas.width / w;
    ctx.fillStyle = theme.pool;
    ctx.fillRect(0, 0, w, h);
    const spec = KEY[canvas.dataset.key];
    if (!spec) {
      // Plankton and carrion.
      ctx.fillStyle = theme.plankton;
      for (const [x, y] of [[12, 12], [20, 26], [30, 15], [24, 8]]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = theme.carrion;
      for (const [x, y, r] of [[50, 20, 4], [58, 27, 3], [55, 13, 2.5]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    const zoom = 2.4;
    const c = {
      radius: 5 * spec.traits.size,
      energy: spec.energy ?? 1,
      maxEnergy: 1,
      angle: 0,
      x: 0,
      y: 0,
      thrust: 0.7,
      wiggle: 1.2,
      sinceBite: spec.sinceBite ?? 99,
      sinceHurt: spec.sinceHurt ?? 99,
      genome: { traits: spec.traits },
    };
    drawCreature(ctx, c, spec.hue, 1 / zoom, { k: dpr * zoom, e: dpr * (w * 0.6), f: dpr * (h / 2) });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
