// Binomial names in the style of a naturalist's field notes. The epithet
// is chosen from the founder's most distinctive traits, so a name like
// "Spiromonas vorax velox" tells you something true about the animal.

const GENUS_HEADS = [
  'Cyclo', 'Plankto', 'Vora', 'Cili', 'Nocti', 'Thalasso', 'Micro', 'Rhizo',
  'Chaeto', 'Spiro', 'Lepto', 'Acantho', 'Hydro', 'Medusa', 'Ptero', 'Dino',
  'Echino', 'Coelo', 'Physa', 'Gloeo', 'Luci', 'Aplo', 'Nemato', 'Tricho',
  'Proto', 'Sarco', 'Myxo', 'Opalo', 'Stylo', 'Zoo', 'Halo', 'Bentho',
  'Glauco', 'Litho', 'Pelago', 'Cteno', 'Salpa', 'Tinto', 'Volvo', 'Kera',
];

const GENUS_TAILS = [
  'ella', 'opsis', 'ium', 'ula', 'monas', 'phora', 'nema', 'coccus', 'zoon',
  'ina', 'aster', 'ops', 'ax', 'ites', 'caris', 'morpha', 'phyllum', 'cystis',
  'dinium', 'spira', 'mena', 'lynx', 'thrix', 'gyra',
];

function joinParts(head, tail) {
  const vowels = 'aeiou';
  if (vowels.includes(head.at(-1)) && vowels.includes(tail[0])) head = head.slice(0, -1);
  return head + tail;
}

export function makeGenus(rng) {
  return joinParts(rng.pick(GENUS_HEADS), rng.pick(GENUS_TAILS));
}

function hueEpithets(h) {
  if (h < 18 || h >= 340) return ['rubra', 'coccinea'];
  if (h < 45) return ['aurantia', 'fulva'];
  if (h < 70) return ['flava', 'aurea'];
  if (h < 150) return ['viridis', 'prasina'];
  if (h < 190) return ['thalassina', 'glauca'];
  if (h < 250) return ['azurea', 'caerulea'];
  if (h < 290) return ['violacea', 'ianthina'];
  return ['purpurea', 'rosea'];
}

export function traitEpithets(t) {
  const out = [];
  if (t.diet > 0.7) out.push('vorax', 'rapax', 'ferox', 'sanguinea');
  else if (t.diet > 0.4) out.push('omnivora', 'ambigua', 'versatilis');
  if (t.size > 1.8) out.push('magna', 'gigantea', 'maxima');
  else if (t.size < 0.85) out.push('minuta', 'pusilla', 'nana');
  if (t.speed > 1.25) out.push('velox', 'celeris', 'fugax');
  else if (t.speed < 0.5) out.push('lenta', 'tarda');
  if (t.sense > 170) out.push('oculata', 'vigilans', 'argus');
  if (t.fov > 4) out.push('circumspecta', 'panoptica');
  else if (t.fov < 1.2) out.push('angusta', 'myopica');
  if (t.invest < 0.22) out.push('prolifica', 'fecunda');
  return out;
}

const FALLBACK = ['vulgaris', 'gracilis', 'elegans', 'simplex', 'errans', 'lucida', 'nocturna', 'communis'];

export function makeEpithet(traits, rng, taken) {
  const special = traitEpithets(traits);
  const pools = [special, hueEpithets(traits.hue), FALLBACK];
  for (const pool of pools) {
    const options = pool.filter((e) => !taken(e));
    if (options.length) return rng.pick(options);
  }
  // Every sensible name is in use: fall back to a numbered variety.
  let n = 2;
  const base = rng.pick(FALLBACK);
  while (taken(`${base} ${roman(n)}`)) n++;
  return `${base} ${roman(n)}`;
}

export function roman(n) {
  const table = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of table) while (n >= v) { s += r; n -= v; }
  return s;
}
