import { theme, speciesColor } from './theme.js';
import { SECTORS, IN } from '../sim/brain.js';

const TAU = Math.PI * 2;

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.minScale = 0.1;
    this.w = 1;
    this.h = 1;
  }

  fit(world) {
    this.scale = Math.min(this.w / world.width, this.h / world.height) * 0.97;
    this.minScale = this.scale * 0.8;
    this.x = world.width / 2;
    this.y = world.height / 2;
  }

  toWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.scale + this.x, y: (sy - this.h / 2) / this.scale + this.y };
  }

  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.scale = Math.min(this.minScale * 14, Math.max(this.minScale, this.scale * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  clamp(world) {
    const hw = this.w / 2 / this.scale;
    const hh = this.h / 2 / this.scale;
    this.x = hw * 2 >= world.width ? world.width / 2 : Math.min(world.width - hw, Math.max(hw, this.x));
    this.y = hh * 2 >= world.height ? world.height / 2 : Math.min(world.height - hh, Math.max(hh, this.y));
  }
}

export function drawPool(ctx, world, cam, view) {
  const { w, h } = cam;
  const dpr = view.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.poolDeep;
  ctx.fillRect(0, 0, w, h);

  // World-to-device transform: device = k * world + (e, f).
  const m = { k: dpr * cam.scale, e: dpr * (w / 2 - cam.x * cam.scale), f: dpr * (h / 2 - cam.y * cam.scale) };
  ctx.setTransform(m.k, 0, 0, m.k, m.e, m.f);
  const px = 1 / cam.scale; // one screen pixel in world units

  // The slide itself.
  ctx.fillStyle = theme.pool;
  ctx.beginPath();
  ctx.roundRect(0, 0, world.width, world.height, 18);
  ctx.fill();

  // Nutrient upwellings: soft glows where plankton blooms.
  for (const u of world.upwellings) {
    const g = ctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, u.r * 1.4);
    g.addColorStop(0, theme.upwelling);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35 + 0.65 * u.intensity;
    ctx.fillStyle = g;
    ctx.fillRect(u.x - u.r * 1.4, u.y - u.r * 1.4, u.r * 2.8, u.r * 2.8);
  }
  ctx.globalAlpha = 1;

  // Counting-chamber grid, as etched on a haemocytometer slide.
  drawGrid(ctx, world, cam, px);

  // Food.
  const plankR = Math.max(1.6, 1.2 * px);
  ctx.fillStyle = theme.plankton;
  ctx.beginPath();
  for (const f of world.food) {
    if (f.kind !== 0) continue;
    ctx.moveTo(f.x + plankR, f.y);
    ctx.arc(f.x, f.y, plankR, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = theme.carrion;
  ctx.beginPath();
  for (const f of world.food) {
    if (f.kind !== 1) continue;
    const r = Math.max(1.4, 1 + Math.sqrt(f.energy) * 0.32);
    ctx.moveTo(f.x + r, f.y);
    ctx.arc(f.x, f.y, r, 0, TAU);
  }
  ctx.fill();

  // Creatures, with the focused species (if any) drawn over the rest.
  const focus = view.focusSpecies;
  const selected = view.selected;
  if (focus) {
    ctx.globalAlpha = 0.18;
    for (const c of world.creatures) if (c.speciesId !== focus) drawCreature(ctx, world, c, px, m);
    ctx.globalAlpha = 1;
    for (const c of world.creatures) if (c.speciesId === focus) drawCreature(ctx, world, c, px, m);
  } else {
    for (const c of world.creatures) drawCreature(ctx, world, c, px, m);
  }

  ctx.setTransform(m.k, 0, 0, m.k, m.e, m.f);
  if (selected) drawSelection(ctx, world, selected, px);
}

function drawGrid(ctx, world, cam, px) {
  const minor = 50;
  if (minor / px < 7) return;
  ctx.lineWidth = px;
  ctx.strokeStyle = theme.poolGrid;
  ctx.beginPath();
  for (let x = minor; x < world.width; x += minor) {
    if (x % 250 === 0) continue;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
  }
  for (let y = minor; y < world.height; y += minor) {
    if (y % 250 === 0) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
  }
  ctx.stroke();
  ctx.strokeStyle = theme.poolGridMajor;
  ctx.lineWidth = px * 1.4;
  ctx.beginPath();
  for (let x = 250; x < world.width; x += 250) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
  }
  for (let y = 250; y < world.height; y += 250) {
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
  }
  ctx.stroke();
}

function drawCreature(ctx, world, c, px, m) {
  const sp = world.species.get(c.speciesId);
  const t = c.genome.traits;
  const r = c.radius;
  const energy = Math.max(0, Math.min(1, c.energy / c.maxEnergy));
  const cos = Math.cos(c.angle);
  const sin = Math.sin(c.angle);
  const base = ctx.globalAlpha;

  // Draw in the creature's own frame: origin at its centre, +x along its heading.
  ctx.setTransform(m.k * cos, m.k * sin, -m.k * sin, m.k * cos, m.e + m.k * c.x, m.f + m.k * c.y);

  if (theme.dark) {
    ctx.fillStyle = speciesColor(sp.hue, 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.3, 0, TAU);
    ctx.fill();
  }

  // Tail: a flagellum that beats faster the harder it swims.
  const len = r * (1.1 + Math.max(0, c.thrust) * 0.9);
  const wag = Math.sin(c.wiggle) * r * 0.55;
  ctx.strokeStyle = speciesColor(sp.hue, 0.75);
  ctx.lineWidth = Math.max(r * 0.28, px);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, 0);
  ctx.quadraticCurveTo(-r * 0.9 - len * 0.55, wag, -r * 0.9 - len, -wag * 0.6);
  ctx.stroke();

  // Hunters carry mandibles that snap open when they bite.
  if (t.diet > 0.45) {
    const open = c.sinceBite < 7 ? 0.75 : 0.28;
    ctx.lineWidth = Math.max(r * 0.22, px);
    ctx.beginPath();
    ctx.moveTo(r * 0.8, -r * 0.25);
    ctx.lineTo(r * 0.8 + Math.cos(-open) * r * 0.75, -r * 0.25 + Math.sin(-open) * r * 0.75);
    ctx.moveTo(r * 0.8, r * 0.25);
    ctx.lineTo(r * 0.8 + Math.cos(open) * r * 0.75, r * 0.25 + Math.sin(open) * r * 0.75);
    ctx.stroke();
  }

  // Body: fuller colour when well fed.
  ctx.fillStyle = speciesColor(sp.hue, Math.round((0.45 + 0.55 * energy) * 10) / 10);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.82, 0, 0, TAU);
  ctx.fill();

  // Eye spots, set wider apart on creatures with a wide field of view.
  if (r / px > 3) {
    const spread = Math.min(1.2, t.fov / 4);
    ctx.fillStyle = theme.pool;
    ctx.beginPath();
    ctx.arc(Math.cos(spread) * r * 0.62, Math.sin(spread) * r * 0.5, r * 0.17, 0, TAU);
    ctx.arc(Math.cos(spread) * r * 0.62, -Math.sin(spread) * r * 0.5, r * 0.17, 0, TAU);
    ctx.fill();
  }

  if (c.sinceHurt < 10) {
    ctx.globalAlpha = base * (1 - c.sinceHurt / 10);
    ctx.strokeStyle = theme.carrion;
    ctx.lineWidth = Math.max(1.5 * px, r * 0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.45, r * 1.1, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = base;
  }
}

function drawSelection(ctx, world, c, px) {
  const t = c.genome.traits;
  const r = c.radius;
  if (c.alive) {
    // Vision: each sector shaded by what the creature currently sees there.
    const inp = c.brain.input;
    const half = t.fov / 2;
    for (let s = 0; s < SECTORS; s++) {
      const a0 = c.angle - half + (s * t.fov) / SECTORS;
      const a1 = a0 + t.fov / SECTORS;
      const plant = inp[IN.plant + s];
      const meat = inp[IN.meat + s];
      const other = inp[IN.creature + s];
      const strongest = Math.max(plant, meat, other);
      ctx.fillStyle = other === strongest && other > 0 ? theme.focus : meat === strongest && meat > 0 ? theme.carrion : theme.plankton;
      ctx.globalAlpha = 0.05 + strongest * 0.28;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, t.sense, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = theme.focus;
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, t.sense, c.angle - half, c.angle + half);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = theme.focus;
  ctx.lineWidth = 2 * px;
  ctx.globalAlpha = c.alive ? 1 : 0.5;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 1.6 + 5 * px, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function pickCreature(world, x, y, slop) {
  let best = null;
  let bestD = Infinity;
  for (const c of world.creatures) {
    const d = Math.hypot(c.x - x, c.y - y) - c.radius;
    if (d < slop && d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
