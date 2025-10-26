// --- Utilities --------------------------------------------------------------

function hashSeed(s: string): number {
  // Simple string hash -> [0, 2^31)
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32 PRNG for reproducible randomness
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWeights(n: number, rng: () => number): number[] {
  // Generate positive random weights then normalize
  const w = Array.from({ length: n }, () => Math.max(1e-6, rng()));
  return w;
}

// --- Squarified Treemap -----------------------------------------------------
// Based on Bruls, Huizing, van Wijk (2000), simplified implementation.

type TreemapRect = { x: number; y: number; w: number; h: number; index: number };

function squarifyTreemap(
  weights: number[],
  width: number,
  height: number,
  padding: number
): TreemapRect[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];

  // Normalize to rectangle area
  const area = width * height;
  const scaled = weights.map((w) => (w / total) * area);

  // Work arrays
  const rects: TreemapRect[] = [];
  let x = 0, y = 0, w = width, h = height;

  // Items: keep indices so we can color deterministically
  const items = scaled.map((s, i) => ({ area: s, index: i }))
    // Sort descending so big rectangles place first (improves aspect)
    .sort((a, b) => b.area - a.area);

  function worst(row: number[], side: number): number {
    if (row.length === 0) return Infinity;
    const sum = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    const s2 = side * side;
    return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
  }

  function layoutRow(row: { area: number; index: number }[], side: number) {
    const rowSum = row.reduce((a, r) => a + r.area, 0);
    const horizontal = side === h; // laying along width if side==h
    const rowThickness = rowSum / side;

    if (horizontal) {
      // Split horizontally: place a row across the top
      let _x = x;
      for (const r of row) {
        const rw = r.area / rowThickness;
        const rx = _x + padding;
        const ry = y + padding;
        const rwPad = Math.max(0, rw - 2 * padding);
        const rhPad = Math.max(0, rowThickness - 2 * padding);
        rects.push({ x: rx, y: ry, w: rwPad, h: rhPad, index: r.index });
        _x += rw;
      }
      y += rowThickness;
      h -= rowThickness;
    } else {
      // Split vertically: place a column on the left
      let _y = y;
      for (const r of row) {
        const rhh = r.area / rowThickness;
        const rx = x + padding;
        const ry = _y + padding;
        const rwPad = Math.max(0, rowThickness - 2 * padding);
        const rhPad = Math.max(0, rhh - 2 * padding);
        rects.push({ x: rx, y: ry, w: rwPad, h: rhPad, index: r.index });
        _y += rhh;
      }
      x += rowThickness;
      w -= rowThickness;
    }
  }

  let row: { area: number; index: number }[] = [];
  let side: number;

  while (items.length) {
    side = Math.min(w, h);
    const item = items[0];
    const newRow = row.concat([item]);
    if (row.length === 0 || worst(newRow.map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) {
      row = newRow;
      items.shift();
    } else {
      layoutRow(row, side);
      row = [];
    }
  }
  if (row.length) {
    side = Math.min(w, h);
    layoutRow(row, side);
  }

  return rects;
}

// --- Figma helpers -----------------------------------------------------------

function ensureFrameSelection(): FrameNode {
  const selection = figma.currentPage.selection;
  if (!selection || selection.length !== 1 || selection[0].type !== 'FRAME') {
    figma.notify('Select a single Frame first.');
    throw new Error('No frame selected.');
  }
  return selection[0] as FrameNode;
}

function randomColorFor(index: number, rng: () => number): Paint[] {
  // Pleasant random HSL to RGB conversion (simple)
  const h = (index * 47 + Math.floor(rng() * 360)) % 360;
  const s = 70 + Math.floor(rng() * 25); // 70–95
  const l = 55 + Math.floor(rng() * 15); // 55–70
  const rgb = hslToRgb(h / 360, s / 100, l / 100);
  return [{
    type: 'SOLID',
    color: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
    opacity: 1
  }];
}

// HSL -> RGB
function hslToRgb(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c);
  };
  return { r: f(0), g: f(8), b: f(4) };
}

// --- Plugin entry ------------------------------------------------------------

figma.on('run', ({ command }) => {
  if (command === 'create') {
    figma.showUI(__html__, { width: 360, height: 420 });
  } else {
    figma.closePlugin();
  }
});

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'run') return;

  try {
    const frame = ensureFrameSelection();

    const { count, padding, seed, weights } = msg as {
      count: number; padding: number; seed?: string; weights?: number[];
    };

    const rng = (seed && seed.length) ? mulberry32(hashSeed(seed)) : mulberry32(Math.floor(Math.random() * 1e9));

    // Determine weights
    const W: number[] = weights && weights.length ? weights : randomWeights(Math.max(1, count || 1), rng);

    // Compute treemap rects in local frame coordinates
    const rects = squarifyTreemap(W, frame.width, frame.height, padding || 0);

    // Clear existing children? Keep both? We'll add on top but group them.
    const groupNodes: SceneNode[] = [];

    for (const r of rects) {
      const node = figma.createRectangle();
      node.x = r.x;
      node.y = r.y;
      node.resizeWithoutConstraints(Math.max(0, r.w), Math.max(0, r.h));
      node.fills = randomColorFor(r.index, rng);

      // Optional: subtle stroke for separation at tiny paddings
      node.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.06 }];
      node.strokeWeight = 1;
      node.name = `Treemap Cell ${r.index + 1}`;
      frame.appendChild(node);
      groupNodes.push(node);
    }

    if (groupNodes.length) {
      const group = figma.group(groupNodes, frame);
      group.name = 'Treemap';
    }

    figma.notify(`Treemap created: ${rects.length} rectangles`);
  } catch (err) {
    console.error(err);
    figma.notify((err as Error).message || 'Failed to create treemap');
  } finally {
    // keep UI open for tweaks
  }
};