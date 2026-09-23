import { speciesColor, dietClass, DIET_LABEL } from './theme.js';
import { TICKS_PER_DAY, CAUSES } from '../sim/world.js';
import { TRAITS } from '../sim/genome.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const days = (ticks) => (ticks / TICKS_PER_DAY).toFixed(1);

// ---------------------------------------------------------------- census

export function renderSpeciesList(listEl, world, focusId, onFocus) {
  const living = world.livingSpecies().sort((a, b) => b.population - a.population);
  const max = living[0]?.population || 1;
  const existing = new Map([...listEl.children].map((li) => [Number(li.dataset.id), li]));
  const keep = new Set();
  for (const sp of living) {
    keep.add(sp.id);
    let li = existing.get(sp.id);
    if (!li) {
      li = document.createElement('li');
      li.dataset.id = sp.id;
      li.innerHTML = `<button type="button" class="species-row">
          <span class="swatch"></span>
          <span><span class="sp-name"></span><br /><span class="sp-meta"></span></span>
          <span class="diet-tag"></span>
          <span class="sp-count"></span>
        </button>`;
      li.firstElementChild.addEventListener('click', () => onFocus(sp.id));
    }
    const diet = dietClass(sp.founder.traits.diet);
    const btn = li.firstElementChild;
    btn.setAttribute('aria-pressed', String(focusId === sp.id));
    btn.style.setProperty('--c', speciesColor(sp.hue));
    li.querySelector('.swatch').style.setProperty('--c', speciesColor(sp.hue));
    li.querySelector('.sp-name').textContent = sp.name;
    li.querySelector('.sp-meta').textContent = `since day ${days(sp.bornTick)} · ${sp.kills ? `${sp.kills} kills` : `${sp.totalBorn} born`}`;
    const tag = li.querySelector('.diet-tag');
    tag.className = `diet-tag ${diet}`;
    tag.textContent = DIET_LABEL[diet];
    li.querySelector('.sp-count').textContent = sp.population;
    btn.title = `${sp.population} alive · ${Math.round((sp.population / max) * 100)}% of the largest species`;
    listEl.appendChild(li);
  }
  for (const [id, li] of existing) if (!keep.has(id)) li.remove();
}

// ---------------------------------------------------------------- specimen

const TRAIT_ROWS = [
  ['size', (v) => `${(v * 10).toFixed(0)} µm`],
  ['diet', (v) => (v < 0.3 ? 'grazer' : v < 0.55 ? 'omnivore' : 'hunter')],
  ['speed', (v) => v.toFixed(2)],
  ['sense', (v) => `${v.toFixed(0)} µm`],
  ['fov', (v) => `${Math.round((v * 180) / Math.PI)}°`],
  ['fertility', (v) => `${Math.round(v * 100)}%`],
  ['invest', (v) => `${Math.round(v * 100)}%`],
  ['mutation', (v) => v.toFixed(3)],
];

export function renderSpecimenShell(el, world, c, handlers) {
  if (!c) {
    el.innerHTML = `<div class="empty">
      <p>Click any creature in the pool to see what it senses, how its neural network is responding, and the genes it inherited.</p>
      <button class="btn" type="button" data-act="random">Examine a random creature</button>
    </div>`;
    el.querySelector('[data-act=random]').addEventListener('click', handlers.random);
    return;
  }
  const sp = world.species.get(c.speciesId);
  const parentSp = sp.parentId ? world.species.get(sp.parentId) : null;
  el.innerHTML = `
    <div class="specimen-head">
      <div class="eyebrow">Specimen no. ${c.id}</div>
      <h2 style="color:${speciesColor(sp.hue)}">${esc(sp.name)}</h2>
      <p>Generation ${c.generation} · ${parentSp ? `descended from <i>${esc(parentSp.name)}</i>` : 'a founding lineage'}</p>
    </div>
    <div class="row-actions">
      <span class="status" data-f="status"></span>
      <button class="btn" type="button" data-act="follow"></button>
      <button class="btn" type="button" data-act="species">Highlight species</button>
      <button class="btn" type="button" data-act="child" hidden>Examine its latest offspring</button>
      <button class="btn" type="button" data-act="clear">Close</button>
    </div>
    <div class="meters">
      <div class="meter"><span>Energy</span><span class="track"><span class="fill" data-f="energy"></span></span><output data-f="energy-v"></output></div>
      <div class="meter"><span>Health</span><span class="track"><span class="fill" data-f="health"></span></span><output data-f="health-v"></output></div>
      <div class="meter"><span>Age</span><span class="track"><span class="fill" data-f="age"></span></span><output data-f="age-v"></output></div>
    </div>
    <div class="tally">
      <div><b data-f="plankton"></b><span>plankton</span></div>
      <div><b data-f="carrion"></b><span>carrion</span></div>
      <div><b data-f="kills"></b><span>kills</span></div>
      <div><b data-f="children"></b><span>offspring</span></div>
    </div>
    <section>
      <div class="section-head"><h2>Nervous system</h2><small>live · ${c.genome.weights.length} synapses</small></div>
      <canvas class="chart" id="brain-chart"></canvas>
      <div class="legend"><span style="--c:var(--focus)">excites</span><span style="--c:var(--hunter)">inhibits</span></div>
      <p class="note">Brightness shows the signal flowing right now: each synapse's weight times how active its source is. The two memory outputs loop back in as inputs on the next tick.</p>
    </section>
    <section>
      <div class="section-head"><h2>Genome</h2><small>range markers show the possible extremes</small></div>
      <div class="meters">
        ${TRAIT_ROWS.map(([key, fmt]) => {
          const t = TRAITS[key];
          const v = c.genome.traits[key];
          const pct = ((v - t.min) / (t.max - t.min)) * 100;
          return `<div class="meter"><span>${t.label}</span><span class="track${key === 'diet' ? ' diet' : ''}">${
            key === 'diet' ? `<span class="pin" style="left:${pct}%"></span>` : `<span class="fill" style="width:${pct}%"></span>`
          }</span><output>${fmt(v)}</output></div>`;
        }).join('')}
      </div>
    </section>`;
  el.querySelector('[data-act=follow]').addEventListener('click', handlers.follow);
  el.querySelector('[data-act=species]').addEventListener('click', () => handlers.focusSpecies(c.speciesId));
  el.querySelector('[data-act=child]').addEventListener('click', handlers.child);
  el.querySelector('[data-act=clear]').addEventListener('click', handlers.clear);
}

export function updateSpecimen(el, world, c, following) {
  if (!c) return;
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  if (!f('energy')) return;
  const e = Math.max(0, c.energy / c.maxEnergy);
  f('energy').style.width = `${e * 100}%`;
  f('energy-v').textContent = `${Math.max(0, c.energy).toFixed(0)}/${c.maxEnergy.toFixed(0)}`;
  const hp = Math.max(0, c.health / c.maxHealth);
  f('health').style.width = `${hp * 100}%`;
  f('health-v').textContent = `${Math.round(hp * 100)}%`;
  f('age').style.width = `${Math.min(100, (c.age / c.lifespan) * 100)}%`;
  f('age-v').textContent = `${days(c.age)} d`;
  f('plankton').textContent = c.plankton;
  f('carrion').textContent = c.carrion;
  f('kills').textContent = c.kills;
  f('children').textContent = c.children;
  const status = f('status');
  if (c.alive) {
    status.className = 'status';
    status.textContent = c.age < c.maturity ? 'Alive · juvenile' : 'Alive';
  } else {
    status.className = 'status dead';
    let text = `Dead · ${CAUSES[c.cause]} on day ${days(c.diedTick)}`;
    if (c.cause === 'predation' && c.killerId) {
      const killer = world.byId.get(c.killerId);
      if (killer) text = `Dead · eaten by a ${world.species.get(killer.speciesId).name}`;
    }
    status.textContent = text;
  }
  const follow = el.querySelector('[data-act=follow]');
  follow.textContent = following ? 'Stop following' : 'Follow';
  follow.hidden = !c.alive;
  const child = c.lastChildId ? world.byId.get(c.lastChildId) : null;
  el.querySelector('[data-act=child]').hidden = !child;
}

// ---------------------------------------------------------------- log

export function renderLogEntry(world, ev, onSpecies) {
  const li = document.createElement('li');
  let html = esc(ev.text);
  for (const id of ev.speciesIds) {
    const sp = world.species.get(id);
    if (!sp) continue;
    html = html.replace(esc(sp.name), `<em data-sp="${id}" style="color:${speciesColor(sp.hue)}">${esc(sp.name)}</em>`);
  }
  li.innerHTML = `<time>d ${days(ev.tick)}</time><span><span class="kind ${ev.kind}">${ev.kind}</span>${html}</span>`;
  for (const em of li.querySelectorAll('em[data-sp]')) em.addEventListener('click', () => onSpecies(Number(em.dataset.sp)));
  return li;
}
