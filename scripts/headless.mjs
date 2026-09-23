// Run the simulation without a browser and print a daily census.
// Usage: node scripts/headless.mjs [days] [seed]
import { World, TICKS_PER_DAY } from '../src/sim/world.js';

const days = Number(process.argv[2] ?? 30);
const seed = process.argv[3] ?? 'tidepool';
const world = new World({ seed });
const started = performance.now();

for (let d = 1; d <= days; d++) {
  for (let i = 0; i < TICKS_PER_DAY; i++) world.step();
  const living = world.livingSpecies().sort((a, b) => b.population - a.population);
  const top = living
    .slice(0, 3)
    .map((s) => `${s.name}(${s.population}, d${s.founder.traits.diet.toFixed(2)})`)
    .join(' ');
  const n = world.creatures.length || 1;
  const diet = world.creatures.reduce((a, c) => a + c.genome.traits.diet, 0) / n;
  const size = world.creatures.reduce((a, c) => a + c.genome.traits.size, 0) / n;
  console.log(
    `day ${String(d).padStart(3)} pop ${String(world.creatures.length).padStart(4)} ` +
      `plank ${String(world.plankton).padStart(4)} sp ${String(living.length).padStart(3)}/${world.speciesOrder.length} ` +
      `gen ${world.maxGeneration} diet ${diet.toFixed(2)} size ${size.toFixed(2)} kills ${world.totalKills} season ${world.season.toFixed(2)} | ${top}`,
  );
}
const ms = performance.now() - started;
console.log(`${((days * TICKS_PER_DAY) / (ms / 1000)).toFixed(0)} ticks/s`);
