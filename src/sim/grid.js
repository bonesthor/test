// Uniform spatial hash for fast "what's near me?" queries.
export class SpatialGrid {
  constructor(width, height, cellSize) {
    this.cell = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear() {
    for (const b of this.buckets) b.length = 0;
  }

  insert(obj) {
    const cx = Math.min(this.cols - 1, Math.max(0, (obj.x / this.cell) | 0));
    const cy = Math.min(this.rows - 1, Math.max(0, (obj.y / this.cell) | 0));
    this.buckets[cy * this.cols + cx].push(obj);
  }

  // Calls fn(obj) for every object in cells overlapping the query square.
  // Callers do their own exact distance test.
  forEachNear(x, y, r, fn) {
    const { cell, cols, rows, buckets } = this;
    const x0 = Math.max(0, ((x - r) / cell) | 0);
    const x1 = Math.min(cols - 1, ((x + r) / cell) | 0);
    const y0 = Math.max(0, ((y - r) / cell) | 0);
    const y1 = Math.min(rows - 1, ((y + r) / cell) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = buckets[cy * cols + cx];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}
