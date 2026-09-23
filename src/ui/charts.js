import { theme, speciesColor } from './theme.js';
import { TICKS_PER_DAY } from '../sim/world.js';
import { N_IN, N_HIDDEN, N_OUT, INPUTS, OUTPUTS, SECTORS, w1Index, w2Index } from '../sim/brain.js';

export function sizeCanvas(canvas, cssHeight) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, canvas.clientWidth);
  const h = cssHeight ?? canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function niceMax(v) {
  if (v <= 10) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return v;
}

// ---------------------------------------------------------------- population

// Stacked areas for the most abundant species, the rest pooled as "others",
// with plankton as a dashed line and the season as a strip along the base.
export function drawPopulation(canvas, world, legendEl) {
  const { ctx, w, h } = sizeCanvas(canvas, 170);
  ctx.clearRect(0, 0, w, h);
  const samples = world.samples;
  const n = samples.length;
  const padL = 30;
  const padR = 6;
  const padT = 8;
  const strip = 6;
  const padB = 22 + strip;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  if (n < 2) return;

  // Pick the species that matter over this window.
  const weight = new Map();
  for (const sp of world.speciesOrder) {
    let sum = 0;
    for (const v of sp.history) sum += v ?? 0;
    if (sum > 0) weight.set(sp, sum + sp.population * 50);
  }
  const top = [...weight.keys()].sort((a, b) => weight.get(b) - weight.get(a)).slice(0, 7);
  top.sort((a, b) => a.bornTick - b.bornTick);
  const topSet = new Set(top);

  let maxV = 0;
  for (const s of samples) maxV = Math.max(maxV, s.population, s.plankton);
  const yMax = niceMax(maxV);
  const x = (i) => padL + (i / (n - 1)) * cw;
  const y = (v) => padT + ch - (v / yMax) * ch;

  // Grid.
  ctx.font = `10px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = theme.muted;
  ctx.strokeStyle = theme.ruleSoft;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let k = 0; k <= 2; k++) {
    const v = (yMax / 2) * k;
    const yy = Math.round(y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(w - padR, yy);
    ctx.stroke();
    ctx.fillText(String(v), padL - 5, yy);
  }

  // Stacked areas.
  const stack = new Float32Array(n);
  const valueAt = (sp, i) => {
    const k = i - sp.historyStart;
    return k >= 0 && k < sp.history.length ? sp.history[k] ?? 0 : 0;
  };
  const layers = top.map((sp) => ({ color: speciesColor(sp.hue, 0.85), get: (i) => valueAt(sp, i) }));
  layers.push({
    color: theme.rule,
    get: (i) => {
      let total = samples[i].population;
      for (const sp of top) total -= valueAt(sp, i);
      return Math.max(0, total);
    },
  });
  for (const layer of layers) {
    const lower = Float32Array.from(stack);
    for (let i = 0; i < n; i++) stack[i] += layer.get(i);
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(x(0), y(stack[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(stack[i]));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(x(i), y(lower[i]));
    ctx.closePath();
    ctx.fill();
  }

  // Plankton.
  ctx.strokeStyle = theme.plankton;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, x(i), y(samples[i].plankton));
  ctx.stroke();
  ctx.setLineDash([]);

  // Season strip.
  const sy = padT + ch + 3;
  for (let i = 0; i < n - 1; i++) {
    ctx.globalAlpha = 0.15 + 0.85 * samples[i].season;
    ctx.fillStyle = theme.plankton;
    ctx.fillRect(x(i), sy, x(i + 1) - x(i) + 0.5, strip);
  }
  ctx.globalAlpha = 1;

  // Day labels.
  ctx.fillStyle = theme.muted;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`day ${(samples[0].tick / TICKS_PER_DAY).toFixed(0)}`, padL, sy + strip + 4);
  ctx.textAlign = 'right';
  ctx.fillText(`day ${(samples[n - 1].tick / TICKS_PER_DAY).toFixed(1)}`, w - padR, sy + strip + 4);
  ctx.textAlign = 'center';
  ctx.fillText('season', padL + cw / 2, sy + strip + 4);

  if (legendEl) {
    const key = top.map((s) => s.id).join(',') + theme.version;
    if (legendEl.dataset.key !== key) {
      legendEl.dataset.key = key;
      legendEl.innerHTML =
        top.map((sp) => `<span style="--c:${speciesColor(sp.hue)}"><i>${sp.name}</i></span>`).join('') +
        `<span style="--c:${theme.rule}">Others</span><span style="--c:${theme.plankton}">Plankton (dashed)</span>`;
    }
  }
  return { topSet };
}

// ---------------------------------------------------------------- lineage

const ROW = 15;

export function lineageRows(world) {
  // Hide species that never amounted to more than a couple of individuals,
  // unless they are alive now; re-attach their children to the nearest shown ancestor.
  const shown = world.speciesOrder.filter((sp) => sp.peak >= 3 || sp.population > 0);
  const shownSet = new Set(shown.map((s) => s.id));
  const anchor = (sp) => {
    let p = sp.parentId ? world.species.get(sp.parentId) : null;
    while (p && !shownSet.has(p.id)) p = p.parentId ? world.species.get(p.parentId) : null;
    return p;
  };
  const children = new Map();
  const roots = [];
  for (const sp of shown) {
    const a = anchor(sp);
    if (!a) roots.push(sp);
    else {
      if (!children.has(a.id)) children.set(a.id, []);
      children.get(a.id).push(sp);
    }
  }
  const rows = [];
  const visit = (sp, parent) => {
    rows.push({ sp, parent });
    for (const c of children.get(sp.id) ?? []) visit(c, sp);
  };
  for (const r of roots) visit(r, null);
  return rows;
}

export function drawLineage(canvas, world, rows, focusId) {
  const height = Math.max(120, rows.length * ROW + 30);
  const { ctx, w, h } = sizeCanvas(canvas, height);
  ctx.clearRect(0, 0, w, h);
  const n = Math.max(2, world.samples.length);
  const padL = 6;
  const padR = 10;
  const top = 6;
  const cw = w - padL - padR;
  const x = (i) => padL + (i / (n - 1)) * cw;
  let maxPeak = 1;
  for (const { sp } of rows) maxPeak = Math.max(maxPeak, sp.peak);
  const rowIndex = new Map(rows.map((r, i) => [r.sp.id, i]));
  const cy = (i) => top + i * ROW + ROW / 2;

  // Day ticks.
  ctx.font = `10px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = theme.muted;
  ctx.strokeStyle = theme.ruleSoft;
  ctx.textBaseline = 'bottom';
  const lastDay = world.samples.at(-1)?.tick / TICKS_PER_DAY || 1;
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((v) => v >= lastDay / 6) ?? 1000;
  for (let d = 0; d <= lastDay; d += step) {
    const i = world.samples.findIndex((s) => s.tick / TICKS_PER_DAY >= d);
    if (i < 0) continue;
    const xx = Math.round(x(i)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, h - 16);
    ctx.stroke();
    ctx.textAlign = d === 0 ? 'left' : 'center';
    ctx.fillText(`d${Math.round(d)}`, xx, h - 2);
  }

  // Connectors from parent spindle to child.
  ctx.strokeStyle = theme.muted;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let i = 0; i < rows.length; i++) {
    const { sp, parent } = rows[i];
    if (!parent) continue;
    const xx = Math.round(x(sp.historyStart)) + 0.5;
    ctx.moveTo(xx, cy(rowIndex.get(parent.id)));
    ctx.lineTo(xx, cy(i));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Spindles.
  for (let i = 0; i < rows.length; i++) {
    const { sp } = rows[i];
    const hist = sp.history;
    const yc = cy(i);
    const dim = focusId && focusId !== sp.id;
    ctx.fillStyle = speciesColor(sp.hue, dim ? 0.25 : sp.population > 0 ? 0.95 : 0.6);
    ctx.beginPath();
    const len = hist.length;
    const half = (k) => {
      const v = hist[k] ?? 0;
      return v > 0 ? Math.max(0.7, (ROW * 0.47) * Math.sqrt(v / maxPeak)) : 0.35;
    };
    const x0 = x(sp.historyStart);
    ctx.moveTo(x0, yc);
    for (let k = 0; k < len; k++) ctx.lineTo(x(sp.historyStart + k), yc - half(k));
    for (let k = len - 1; k >= 0; k--) ctx.lineTo(x(sp.historyStart + k), yc + half(k));
    ctx.closePath();
    ctx.fill();
    if (sp.population > 0) {
      ctx.beginPath();
      ctx.arc(x(sp.historyStart + len - 1) + 2, yc, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (focusId === sp.id) {
      ctx.strokeStyle = theme.focus;
      ctx.lineWidth = 1;
      ctx.strokeRect(padL - 3, yc - ROW / 2, cw + 6, ROW);
    }
  }
  return { rowAt: (py) => rows[Math.floor((py - top) / ROW)] ?? null, x, n };
}

// ---------------------------------------------------------------- brain

function inputLabel(i) {
  const name = INPUTS[i];
  const m = name.match(/^(\w+) (\d)$/);
  if (!m) return name;
  const s = Number(m[2]) - 1;
  const mid = (SECTORS - 1) / 2;
  const side = s < mid ? `L${mid - s}` : s > mid ? `R${s - mid}` : 'ahead';
  return `${m[1]} ${side}`;
}

export function drawBrain(canvas, creature) {
  const height = N_IN * 13 + 16;
  const { ctx, w, h } = sizeCanvas(canvas, height);
  ctx.clearRect(0, 0, w, h);
  const weights = creature.genome.weights;
  const { input, hidden, output } = creature.brain;
  const labelW = 92;
  const outLabelW = 86;
  const xIn = labelW + 6;
  const xOut = w - outLabelW - 6;
  const xHid = (xIn + xOut) / 2;
  const yIn = (i) => 10 + i * ((h - 20) / (N_IN - 1));
  const yHid = (i) => 10 + (h - 20) * ((i + 0.5) / N_HIDDEN);
  const yOut = (i) => 10 + (h - 20) * ((i + 0.5) / N_OUT);

  const pos = theme.focus;
  const neg = theme.hunter;

  // Edges: brightness shows the signal actually flowing (weight × activity).
  ctx.lineWidth = 1;
  for (let hI = 0; hI < N_HIDDEN; hI++) {
    for (let i = 0; i < N_IN; i++) {
      const s = weights[w1Index(hI, i)] * input[i];
      const a = Math.min(1, Math.abs(s) * 0.6);
      if (a < 0.04) continue;
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = s > 0 ? pos : neg;
      ctx.beginPath();
      ctx.moveTo(xIn, yIn(i));
      ctx.lineTo(xHid, yHid(hI));
      ctx.stroke();
    }
  }
  for (let o = 0; o < N_OUT; o++) {
    for (let hI = 0; hI < N_HIDDEN; hI++) {
      const s = weights[w2Index(o, hI)] * hidden[hI];
      const a = Math.min(1, Math.abs(s) * 0.6);
      if (a < 0.04) continue;
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 1 + a;
      ctx.strokeStyle = s > 0 ? pos : neg;
      ctx.beginPath();
      ctx.moveTo(xHid, yHid(hI));
      ctx.lineTo(xOut, yOut(o));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;

  const node = (x, y, v, r) => {
    ctx.fillStyle = theme.raised;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, Math.abs(v));
    ctx.fillStyle = v >= 0 ? pos : neg;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.muted;
    ctx.stroke();
  };

  ctx.font = `10.5px 'IBM Plex Mono', monospace`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < N_IN; i++) {
    node(xIn, yIn(i), input[i], 3.5);
    ctx.fillStyle = Math.abs(input[i]) > 0.05 ? theme.ink : theme.muted;
    ctx.textAlign = 'right';
    ctx.fillText(inputLabel(i), xIn - 8, yIn(i));
  }
  for (let i = 0; i < N_HIDDEN; i++) node(xHid, yHid(i), hidden[i], 5);
  for (let o = 0; o < N_OUT; o++) {
    node(xOut, yOut(o), output[o], 7);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.ink;
    ctx.fillText(OUTPUTS[o], xOut + 12, yOut(o) - 6);
    ctx.fillStyle = theme.muted;
    ctx.fillText(output[o].toFixed(2), xOut + 12, yOut(o) + 7);
  }
}
