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
  for (let i = 0; i < living.length; i++) {
    const sp = living[i];
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
    // Only move rows whose position changed, so a click in progress isn't lost.
    if (listEl.children[i] !== li) listEl.insertBefore(li, listEl.children[i] ?? null);
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

// ---------------------------------------------------------------- trends

export function renderTrends(el, world, trends, draw, color) {
  if (!el.children.length) {
    el.innerHTML = trends
      .map((t) => `<div class="trend" data-key="${t.key}">
          <header><span>${t.label}</span><span><b></b> <small></small></span></header>
          <canvas class="chart"></canvas>
        </div>`)
      .join('');
  }
  for (const t of trends) {
    const box = el.querySelector(`[data-key="${t.key}"]`);
    const r = draw(box.querySelector('canvas'), world.samples, t.key, color);
    box.querySelector('b').textContent = r ? t.fmt(r.last) : '–';
    let delta = '';
    if (r && Math.abs(r.first) > 1e-6) {
      const pct = Math.round(((r.last - r.first) / Math.abs(r.first)) * 100);
      delta = pct === 0 ? '±0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
    } else if (r) delta = `${r.last >= r.first ? '+' : '−'}${t.fmt(Math.abs(r.last - r.first))}`;
    box.querySelector('small').textContent = delta;
    box.title = r ? `${t.label}: ${t.fmt(r.first)} at the start of the record, ${t.fmt(r.last)} now` : '';
  }
}

// ---------------------------------------------------------------- species card

const COMPARE = [
  ['size', 'Body size', (v) => `${(v * 10).toFixed(1)} µm`],
  ['diet', 'Carnivory', (v) => `${Math.round(v * 100)}%`],
  ['speed', 'Muscle', (v) => v.toFixed(2)],
  ['sense', 'Sight range', (v) => `${Math.round(v)} µm`],
  ['fov', 'Field of view', (v) => `${Math.round((v * 180) / Math.PI)}°`],
];

export function renderSpeciesCard(el, world, id, handlers) {
  const sp = id ? world.species.get(id) : null;
  el.hidden = !sp;
  if (!sp) {
    el.dataset.id = '';
    return;
  }
  if (el.dataset.id !== String(id)) {
    el.dataset.id = String(id);
    const parent = sp.parentId ? world.species.get(sp.parentId) : null;
    el.innerHTML = `
      <div>
        <div class="eyebrow" data-f="state"></div>
        <h2 style="color:${speciesColor(sp.hue)}">${esc(sp.name)}</h2>
        <p>${parent ? `Branched from <i>${esc(parent.name)}</i> on day ${days(sp.bornTick)}` : `A founding lineage, arrived day ${days(sp.bornTick)}`}</p>
      </div>
      <div class="tally">
        <div><b data-f="alive"></b><span>alive</span></div>
        <div><b data-f="peak"></b><span>peak</span></div>
        <div><b data-f="kills"></b><span>kills</span></div>
        <div><b data-f="daughters"></b><span>offshoots</span></div>
      </div>
      <table class="compare">
        <thead><tr><th>Trait</th><th>Founder</th><th>Today</th></tr></thead>
        <tbody>${COMPARE.map(([k, label]) => `<tr><td>${label}</td><td data-f="f-${k}"></td><td data-f="n-${k}"></td></tr>`).join('')}</tbody>
      </table>
      <div class="row-actions">
        <button class="btn" type="button" data-act="member">Examine a member</button>
        <button class="btn" type="button" data-act="close">Stop highlighting</button>
      </div>`;
    el.querySelector('[data-act=member]').addEventListener('click', () => handlers.member(id));
    el.querySelector('[data-act=close]').addEventListener('click', handlers.close);
  }
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const members = world.creatures.filter((c) => c.speciesId === id);
  f('state').textContent = sp.population > 0
    ? `Living · ${days(world.tick - sp.bornTick)} days old`
    : `Extinct on day ${days(sp.extinctTick)} after ${days(sp.extinctTick - sp.bornTick)} days`;
  f('alive').textContent = sp.population;
  f('peak').textContent = sp.peak;
  f('kills').textContent = sp.kills;
  f('daughters').textContent = world.speciesOrder.filter((s) => s.parentId === id).length;
  for (const [k, , fmt] of COMPARE) {
    const founder = sp.founder.traits[k];
    f(`f-${k}`).textContent = fmt(founder);
    const cell = f(`n-${k}`);
    if (members.length) {
      const mean = members.reduce((a, c) => a + c.genome.traits[k], 0) / members.length;
      cell.textContent = fmt(mean);
    } else cell.textContent = '–';
  }
  el.querySelector('[data-act=member]').hidden = !members.length;
}

// ---------------------------------------------------------------- deaths

const CAUSE_ROWS = [
  ['starvation', 'Starved', 'var(--omnivore)'],
  ['predation', 'Eaten', 'var(--hunter)'],
  ['age', 'Old age', 'var(--muted)'],
];

export function renderDeaths(el, spanEl, world, windowDays = 2) {
  const samples = world.samples;
  const last = samples.at(-1);
  const cutoff = world.tick - windowDays * TICKS_PER_DAY;
  const first = samples.find((s) => s.tick >= cutoff && s.deaths) ?? samples.find((s) => s.deaths);
  if (!last?.deaths || !first) {
    el.innerHTML = '<p class="note">No deaths recorded yet.</p>';
    return;
  }
  const counts = CAUSE_ROWS.map(([k]) => Math.max(0, world.deaths[k] - first.deaths[k]));
  const total = counts.reduce((a, b) => a + b, 0);
  spanEl.textContent = `last ${Math.min(windowDays, (world.tick - first.tick) / TICKS_PER_DAY).toFixed(1)} days · ${total}`;
  const bar = CAUSE_ROWS.map(([k, label, c], i) =>
    counts[i] ? `<span style="--c:${c};flex:${counts[i]}" title="${label}: ${counts[i]}"></span>` : '').join('');
  el.innerHTML = `<div class="deathbar" role="img" aria-label="${CAUSE_ROWS.map(([, l], i) => `${l} ${counts[i]}`).join(', ')}">${bar}</div>
    <div class="legend">${CAUSE_ROWS.map(([, label, c], i) =>
      `<span style="--c:${c}">${label} ${total ? Math.round((counts[i] / total) * 100) : 0}%</span>`).join('')}</div>`;
}
