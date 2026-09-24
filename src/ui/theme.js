// Canvas drawing reads its colours from the same CSS tokens as the page,
// refreshed whenever the viewer's theme changes.

const TOKENS = [
  'ground', 'surface', 'raised', 'ink', 'ink-soft', 'muted', 'rule', 'rule-soft', 'accent',
  'pool', 'pool-deep', 'pool-grid', 'pool-grid-major', 'plankton', 'carrion', 'upwelling',
  'grazer', 'omnivore', 'hunter', 'focus', 'mutagen', 'gold', 'species-l', 'species-s',
];

export const theme = { dark: false, version: 0 };
const cache = new Map();

export function refreshTheme() {
  const style = getComputedStyle(document.documentElement);
  for (const t of TOKENS) theme[camel(t)] = style.getPropertyValue(`--${t}`).trim();
  theme.dark = style.getPropertyValue('color-scheme').includes('dark');
  theme.version++;
  cache.clear();
}

function camel(s) {
  return s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
}

export function speciesColor(hue, alpha = 1) {
  const key = `${Math.round(hue)}|${alpha}`;
  let c = cache.get(key);
  if (!c) {
    c = `hsla(${Math.round(hue)}, ${theme.speciesS}, ${theme.speciesL}, ${alpha})`;
    cache.set(key, c);
  }
  return c;
}

export function dietClass(diet) {
  if (diet > 0.55) return 'hunter';
  if (diet > 0.3) return 'omnivore';
  return 'grazer';
}

export const DIET_LABEL = { grazer: 'Grazer', omnivore: 'Omnivore', hunter: 'Hunter' };

export function watchTheme(onChange) {
  refreshTheme();
  const update = () => {
    refreshTheme();
    onChange();
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
