# Tidepool

An artificial-life ecosystem that evolves while you watch. Open
[`dist/index.html`](dist/index.html) in any modern browser. It's one
self-contained file with no server and no install.

Hundreds of microscopic creatures swim a 1.6 mm slide of seawater. Each has a
**genome** (body size, diet, muscle, eyesight, field of view, breeding
strategy, even its own mutation rate) and a **neural network** of 25 senses,
12 hidden neurons, and 5 actions. None of their behaviour is scripted after
the first generation. Creatures that find food breed, their offspring inherit
slightly mutated genes and wiring, and the pool sorts out the rest.

## What you'll see

- **Seasons.** Plankton blooms and crashes on a 12-day cycle, fed by drifting
  nutrient upwellings. Populations boom in the bloom and starve in the lean
  season.
- **Predators and prey.** Diet is a gene that trades plankton digestion for
  meat. Hunters grow mandibles, chase, bite, and leave carrion for scavengers.
  Arms races, overhunting and collapse all emerge on their own.
- **Speciation.** When a lineage drifts far enough from its founder's genome,
  it becomes a new species, with a binomial name chosen from its most
  distinctive traits: *vorax* for predators, *velox* for fast swimmers,
  *minuta* for the tiny, and so on.
- **The tree of life.** A spindle diagram in the style palaeontologists use
  for the fossil record: every species' rise, peak and extinction on one
  timeline.
- **A live brain.** Click any creature to see its vision cone and every
  synapse firing in real time, alongside its genome and life story.
- **Evolution at a glance.** Sparklines of mean body size, carnivory,
  muscle and eyesight, and a running tally of what's killing everyone.
- **A field log.** Speciations, extinctions, first blood, seasons and
  immigration events, with dates.
- **The Lab.** Design your own species with sliders and presets, and watch
  it swim in a live preview. The Lab shows its energy budget. Click in the
  pool to release a founding population and see whether it survives.
- **Sound (optional).** A quiet generative score. Births pluck pentatonic
  notes pitched by pigment, kills thump, new species chime, extinctions fall,
  and the sea swells with the seasons.
- **It remembers.** Your pool autosaves in the browser and picks up exactly
  where it left off. Save files include the random-number state, so a
  resumed pool carries on exactly as it would have.

## Controls

| Action | How |
| --- | --- |
| Examine a creature | Click it (Inspect tool) |
| Scatter plankton | Feed tool, then click or drag (`F`) |
| Release a designed species | Lab tab → **Release**, then click in the pool |
| Sound on/off | **Sound** button (`M`) |
| Pan / zoom | Drag / scroll wheel or pinch |
| Pause, speed | `Space`, `1`–`4` |
| Highlight a species | Click it in Census, Lineage or the log |
| New random pool | **New pool** (a seed in the URL hash replays a pool, e.g. `#kelp-4821`) |

## How it works

```
src/sim/      the simulation: pure JS, no DOM, deterministic per seed
  rng.js      seeded sfc32 PRNG
  brain.js    25→12→5 tanh network; two outputs loop back as memory
  genome.js   traits, mutation, genetic distance
  world.js    physics, senses, eating, biting, breeding, speciation, records
  names.js    trait-driven binomial names
  grid.js     spatial hash for neighbour queries
src/ui/       canvas renderer, charts, panels, the Lab and the soundscape
scripts/      build (esbuild → one HTML file) and a headless runner
test/         node:test suite
```

Each tick, every creature senses its surroundings through five vision
sectors: plankton, carrion and other creatures, each scaled by closeness.
It also senses the size and kinship of its nearest neighbour, its own energy,
health and speed, the wall ahead, an internal pulse, and two memory values.
Its network turns those senses into thrust, turning, biting, and new memory
values. Energy comes from food. It is spent on basal metabolism (which
scales with body size), swimming, eyesight and healing. When energy passes the
creature's genetic brood threshold, it buds off a mutated child. Species are
assigned by genetic distance to each species' founder, with new lineages
joining an existing living species if they are close enough to it.

```sh
npm install
npm test               # simulation tests
npm run build          # writes dist/index.html
npm run headless 60    # run 60 days without a browser and print a census
```
