import { World, TICKS_PER_DAY } from '../sim/world.js';
import { theme, watchTheme, speciesColor } from './theme.js';
import { Camera, drawPool, pickCreature } from './render.js';
import { drawPopulation, drawLineage, lineageRows, drawBrain } from './charts.js';
import { esc, renderSpeciesList, renderSpecimenShell, updateSpecimen, renderLogEntry } from './panels.js';

const $ = (id) => document.getElementById(id);
const WARMUP_TICKS = TICKS_PER_DAY * 5;
const SEED_WORDS = ['kelp', 'coral', 'brine', 'shoal', 'reef', 'lagoon', 'eddy', 'surf', 'tide', 'spray', 'drift', 'wrack'];
const TICKS_PER_FRAME = { 1: 2, 4: 8, 16: 32, 64: Infinity };

const state = {
  world: null,
  paused: false,
  speed: 1,
  tool: 'inspect',
  selected: null,
  following: false,
  focusSpecies: null,
  tab: 'census',
  warming: 0,
  dirtyPanels: true,
  lastPanel: 0,
  lineage: null,
};

const canvas = $('pool');
const ctx = canvas.getContext('2d');
const cam = new Camera();
const view = { dpr: 1, get focusSpecies() { return state.focusSpecies; }, get selected() { return state.selected; } };

// ------------------------------------------------------------------ setup

function seedFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  return /^[\w.~-]{1,40}$/.test(h) && !h.startsWith('panel') ? h : null;
}

function randomSeed() {
  const w = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${w}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function newWorld(seed) {
  // Shape the pool to the space it's shown in, so none of the view is wasted.
  const rect = canvas.getBoundingClientRect();
  const aspect = rect.width > 0 && rect.height > 0 ? rect.height / rect.width : 0.625;
  const height = Math.round(Math.min(1400, Math.max(800, 1600 * aspect)) / 50) * 50;
  state.world = new World({ seed, width: 1600, height });
  state.world.onEvent = onEvent;
  state.selected = null;
  state.following = false;
  state.focusSpecies = null;
  state.warming = WARMUP_TICKS;
  $('clock-seed').textContent = seed;
  $('log').innerHTML = '';
  for (const ev of state.world.events) onEvent(ev);
  resize();
  cam.fit(state.world);
  renderSpecimen();
  state.dirtyPanels = true;
}

function onEvent(ev) {
  const log = $('log');
  if (!log) return;
  log.prepend(renderLogEntry(state.world, ev, focusSpecies));
  while (log.children.length > 250) log.lastElementChild.remove();
  $('log-count').textContent = `${state.world.events.length} entries`;
}

function rebuildLog() {
  $('log').innerHTML = '';
  for (const ev of state.world.events.slice(-250)) onEvent(ev);
}

// ------------------------------------------------------------------ loop

function resize() {
  const rect = canvas.getBoundingClientRect();
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * view.dpr));
  canvas.height = Math.max(1, Math.round(rect.height * view.dpr));
  const wasFit = Math.abs(cam.scale - Math.min(cam.w / state.world.width, cam.h / state.world.height) * 0.97) < 1e-6;
  cam.w = rect.width;
  cam.h = rect.height;
  if (wasFit || cam.scale === 1) cam.fit(state.world);
  else {
    cam.minScale = Math.min(cam.w / state.world.width, cam.h / state.world.height) * 0.97 * 0.8;
    cam.clamp(state.world);
  }
  state.dirtyPanels = true;
}

function frame(now) {
  const world = state.world;
  const start = performance.now();
  if (state.warming > 0) {
    // Fast-forward the opening days so there's history to look at.
    while (state.warming > 0 && performance.now() - start < 22) {
      world.step();
      state.warming--;
    }
    if (state.warming <= 0) state.dirtyPanels = true;
  } else if (!state.paused) {
    const target = TICKS_PER_FRAME[state.speed];
    let n = 0;
    while (n < target && performance.now() - start < 14) {
      world.step();
      n++;
    }
  }

  if (state.selected && state.following) {
    const c = state.selected;
    cam.x += (c.x - cam.x) * 0.15;
    cam.y += (c.y - cam.y) * 0.15;
    cam.clamp(world);
  }

  drawPool(ctx, world, cam, view);
  updateHud();

  if (state.tab === 'specimen' && state.selected) drawBrain($('brain-chart'), state.selected);
  if (state.dirtyPanels || now - state.lastPanel > 300) {
    state.lastPanel = now;
    state.dirtyPanels = false;
    updatePanels();
  }
  requestAnimationFrame(frame);
}

function updateHud() {
  const world = state.world;
  $('clock-day').textContent = world.day.toFixed(1);
  const s = world.season;
  $('season-label').textContent = s > 0.5 ? 'Bloom' : 'Lean season';
  $('season-gauge').style.width = `${Math.round(s * 100)}%`;
  $('season-chip').title = `Plankton supply at ${Math.round(20 + 80 * s)}% of peak`;

  // Scale bar: a round number of micrometres between 60 and 150 px.
  let um = 10;
  for (const v of [10, 20, 50, 100, 200, 500]) if (v * cam.scale <= 150) um = v;
  $('scale-line').style.width = `${Math.round(um * cam.scale)}px`;
  $('scale-label').textContent = `${um} µm`;

  const chips = [];
  if (state.warming > 0) {
    chips.push(`<span class="chip">Fast-forwarding the first days… ${Math.round((1 - state.warming / WARMUP_TICKS) * 100)}%</span>`);
  }
  if (state.focusSpecies) {
    const sp = world.species.get(state.focusSpecies);
    chips.push(
      `<span class="chip">Highlighting <i style="color:${speciesColor(sp.hue)}">${esc(sp.name)}</i>${
        sp.population ? ` · ${sp.population}` : ' · extinct'
      }<button type="button" data-clear="focus" aria-label="Stop highlighting">×</button></span>`,
    );
  }
  if (state.selected && state.following) {
    chips.push(`<span class="chip">Following no. ${state.selected.id}<button type="button" data-clear="follow" aria-label="Stop following">×</button></span>`);
  }
  if (state.tool === 'feed') chips.push('<span class="chip">Click or drag in the pool to scatter plankton</span>');
  const html = chips.join('');
  const holder = $('pool-chips');
  if (holder.dataset.html !== html) {
    holder.dataset.html = html;
    holder.innerHTML = html;
  }
}

function updatePanels() {
  const world = state.world;
  if (state.tab === 'census') {
    $('st-pop').textContent = world.creatures.length;
    $('st-species').textContent = `${world.livingSpecies().length}/${world.speciesOrder.length}`;
    $('st-plankton').textContent = world.plankton;
    $('st-gen').textContent = world.maxGeneration;
    const first = world.samples[0]?.tick ?? 0;
    $('pop-span').textContent = `days ${(first / TICKS_PER_DAY).toFixed(0)}–${world.day.toFixed(0)}`;
    drawPopulation($('pop-chart'), world, $('pop-legend'));
    renderSpeciesList($('species-list'), world, state.focusSpecies, focusSpecies);
  } else if (state.tab === 'lineage') {
    const rows = lineageRows(world);
    $('lineage-count').textContent = `${rows.length} shown of ${world.speciesOrder.length} species`;
    state.lineage = drawLineage($('lineage-chart'), world, rows, state.focusSpecies);
  } else if (state.tab === 'specimen') {
    updateSpecimen($('specimen'), world, state.selected, state.following);
  }
}

// ------------------------------------------------------------------ actions

function select(c) {
  state.selected = c;
  if (!c) state.following = false;
  renderSpecimen();
  state.dirtyPanels = true;
}

function renderSpecimen() {
  renderSpecimenShell($('specimen'), state.world, state.selected, {
    random: () => {
      const cs = state.world.creatures;
      if (cs.length) select(cs[Math.floor(Math.random() * cs.length)]);
    },
    follow: () => {
      state.following = !state.following;
      state.dirtyPanels = true;
    },
    focusSpecies,
    child: () => {
      const child = state.world.byId.get(state.selected?.lastChildId);
      if (child) select(child);
    },
    clear: () => select(null),
  });
}

function focusSpecies(id) {
  state.focusSpecies = state.focusSpecies === id ? null : id;
  state.dirtyPanels = true;
}

function setTab(tab) {
  state.tab = tab;
  for (const name of ['census', 'lineage', 'specimen', 'log']) {
    $(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
    $(`panel-${name}`).hidden = name !== tab;
  }
  if (tab === 'specimen' && !state.selected && state.world.creatures.length) {
    // Open on something alive rather than an empty panel: pick the eldest.
    const eldest = state.world.creatures.reduce((a, b) => (b.age > a.age ? b : a));
    select(eldest);
  }
  state.dirtyPanels = true;
}

function setSpeed(speed) {
  state.speed = speed;
  for (const b of $('speed').children) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
}

function setTool(tool) {
  state.tool = tool;
  canvas.dataset.tool = tool;
  for (const b of $('tool').children) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
}

function setPaused(paused) {
  state.paused = paused;
  $('play-label').textContent = paused ? 'Play' : 'Pause';
  $('play').setAttribute('aria-label', paused ? 'Play' : 'Pause');
  $('play-icon').setAttribute('d', paused ? 'M4 2.5v11l9-5.5z' : 'M4 3h3v10H4zM9 3h3v10H9z');
}

// ------------------------------------------------------------------ input

const pointers = new Map();
let gesture = null;

function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) };
    return;
  }
  gesture = { kind: 'press', start: p, last: p, moved: false };
  if (state.tool === 'feed') {
    const w = cam.toWorld(p.x, p.y);
    state.world.sprinkle(w.x, w.y);
    gesture.kind = 'feed';
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  if (gesture.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    cam.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / gesture.dist);
    cam.clamp(state.world);
    gesture.dist = dist;
    return;
  }
  if (gesture.kind === 'feed') {
    if (Math.hypot(p.x - gesture.last.x, p.y - gesture.last.y) > 14) {
      const w = cam.toWorld(p.x, p.y);
      state.world.sprinkle(w.x, w.y, 8);
      gesture.last = p;
    }
    return;
  }
  if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 5) {
    gesture.moved = true;
    state.following = false;
    canvas.classList.add('dragging');
  }
  if (gesture.moved) {
    cam.x -= (p.x - gesture.last.x) / cam.scale;
    cam.y -= (p.y - gesture.last.y) / cam.scale;
    cam.clamp(state.world);
  }
  gesture.last = p;
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  canvas.classList.remove('dragging');
  if (gesture?.kind === 'press' && !gesture.moved && e.type === 'pointerup') {
    const p = localPoint(e);
    const w = cam.toWorld(p.x, p.y);
    const hit = pickCreature(state.world, w.x, w.y, 10 / cam.scale);
    if (hit) {
      select(hit);
      setTab('specimen');
    } else if (state.selected) {
      select(null);
    }
  }
  if (pointers.size === 0) gesture = null;
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = localPoint(e);
    cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    cam.clamp(state.world);
  },
  { passive: false },
);

$('zoom-in').addEventListener('click', () => {
  cam.zoomAt(cam.w / 2, cam.h / 2, 1.4);
  cam.clamp(state.world);
});
$('zoom-out').addEventListener('click', () => {
  cam.zoomAt(cam.w / 2, cam.h / 2, 1 / 1.4);
  cam.clamp(state.world);
});
$('zoom-fit').addEventListener('click', () => {
  state.following = false;
  cam.fit(state.world);
});

$('play').addEventListener('click', () => setPaused(!state.paused));
$('speed').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-speed]');
  if (b) setSpeed(Number(b.dataset.speed));
});
$('tool').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tool]');
  if (b) setTool(b.dataset.tool);
});
$('new-pool').addEventListener('click', () => {
  const seed = randomSeed();
  try {
    history.replaceState(null, '', `#${seed}`);
  } catch {
    // Some frames refuse history changes; the pool still resets.
  }
  newWorld(seed);
});

for (const name of ['census', 'lineage', 'specimen', 'log']) $(`tab-${name}`).addEventListener('click', () => setTab(name));

$('pool-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-clear]');
  if (!b) return;
  if (b.dataset.clear === 'focus') state.focusSpecies = null;
  if (b.dataset.clear === 'follow') state.following = false;
  state.dirtyPanels = true;
});

// Lineage chart: hover for details, click to highlight.
const lineageCanvas = $('lineage-chart');
const tip = $('lineage-tip');
lineageCanvas.addEventListener('pointermove', (e) => {
  const row = state.lineage?.rowAt(e.offsetY);
  if (!row) {
    tip.hidden = true;
    return;
  }
  const sp = row.sp;
  const world = state.world;
  const parent = sp.parentId ? world.species.get(sp.parentId) : null;
  tip.innerHTML = `<i style="color:${speciesColor(sp.hue)}">${esc(sp.name)}</i>
    Day ${(sp.bornTick / TICKS_PER_DAY).toFixed(1)}–${sp.extinctTick === null ? 'now' : (sp.extinctTick / TICKS_PER_DAY).toFixed(1)}
    · peak ${sp.peak}${sp.population ? ` · ${sp.population} alive` : ' · extinct'}
    ${parent ? `<br />from <i style="display:inline;font-size:13px">${esc(parent.name)}</i>` : '<br />founding lineage'}`;
  tip.hidden = false;
  const wrap = $('lineage-wrap').getBoundingClientRect();
  const left = Math.min(e.clientX - wrap.left + 12, wrap.width - tip.offsetWidth - 4);
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${e.clientY - wrap.top + 14}px`;
});
lineageCanvas.addEventListener('pointerleave', () => (tip.hidden = true));
lineageCanvas.addEventListener('click', (e) => {
  const row = state.lineage?.rowAt(e.offsetY);
  if (row) focusSpecies(row.sp.id);
});

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === ' ') {
    if (e.target.closest('button')) return;
    e.preventDefault();
    setPaused(!state.paused);
  } else if (['1', '2', '3', '4'].includes(e.key)) setSpeed([1, 4, 16, 64][Number(e.key) - 1]);
  else if (e.key === 'f' || e.key === 'F') setTool('feed');
  else if (e.key === 'i' || e.key === 'I') setTool('inspect');
  else if (e.key === 'Escape') {
    select(null);
    state.focusSpecies = null;
  }
});

new ResizeObserver(() => resize()).observe(canvas);
watchTheme(() => {
  state.dirtyPanels = true;
  if (state.world) {
    rebuildLog();
    renderSpecimen();
  }
});

newWorld(seedFromHash() ?? 'tidepool');
requestAnimationFrame(frame);
