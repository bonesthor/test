// Seeded pseudo-random numbers (sfc32). Every source of chance in the
// simulation flows through one of these so a seed replays exactly.

function hashSeed(seed) {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    out.push((h ^= h >>> 16) >>> 0);
  }
  return out;
}

export class Rng {
  constructor(seed = 1) {
    [this.a, this.b, this.c, this.d] = hashSeed(seed);
    this.spare = null;
    for (let i = 0; i < 12; i++) this.next();
  }

  next() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }

  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  // Standard normal via Box–Muller, caching the second value.
  gauss() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  getState() {
    return [this.a, this.b, this.c, this.d, this.spare];
  }

  setState(s) {
    [this.a, this.b, this.c, this.d, this.spare] = s;
  }
}
