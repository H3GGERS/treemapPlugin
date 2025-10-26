// === Utilities ===============================================================
function hashSeed(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
// More balanced "random" weights (Dirichlet-ish via sum of uniforms).
// k=3 keeps variety without a long skinny tail; bump k to 4–5 for even tighter sizes.
function randomWeights(n, rng) {
  const k = 3; // increase to 4 or 5 for more uniform sizes
  const w = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += rng(); // Irwin–Hall distribution
    w[i] = Math.max(1e-6, s); // keep positive
  }
  return w;
}

// === Squarified Treemap (correct orientation) ===============================
function squarifyTreemap(weights, W, H, basePadding){
  const total = weights.reduce((a,b)=>a+b,0);
  if (total <= 0) return [];
  const area   = W * H;
  const items  = weights.map((w,i)=>({ area:(w/total)*area, index:i }))
                        .sort((a,b)=>b.area-a.area);

  const rects = [];
  let x = 0, y = 0, w = W, h = H;
  const EPS = 1e-6, MIN_PX = 1;

  function worst(rowAreas, side){
    if (rowAreas.length === 0) return Infinity;
    const sum = rowAreas.reduce((a,b)=>a+b,0);
    const max = Math.max(...rowAreas);
    const min = Math.min(...rowAreas);
    const s2  = side*side || EPS;
    return Math.max((s2*max)/(sum*sum), (sum*sum)/(s2*min));
  }

  function layoutRow(row){
    // Choose orientation: if width >= height → lay a horizontal ROW (across width)
    // Correct thickness: rows use width, columns use height
    const layingRow = (w >= h);

    const rowSum = row.reduce((a,r)=>a+r.area,0);
    const thickness = layingRow ? (rowSum / Math.max(EPS, w))
                                : (rowSum / Math.max(EPS, h));

    if (layingRow){
      // Place a row along the top, spanning current width
      let _x = x;
      for (const r of row){
        const rw = r.area / Math.max(EPS, thickness);
        const rh = thickness;

        const pad = Math.max(0, Math.min(basePadding, rw/2 - 0.5, rh/2 - 0.5));
        const rx  = _x + pad, ry = y + pad;
        const rwP = Math.max(MIN_PX, rw - 2*pad);
        const rhP = Math.max(MIN_PX, rh - 2*pad);

        rects.push({ x: rx, y: ry, w: rwP, h: rhP, index: r.index });
        _x += rw;
      }
      y += thickness;
      h = Math.max(0, h - thickness);
    } else {
      // Place a column along the left, spanning current height
      let _y = y;
      for (const r of row){
        const rh = r.area / Math.max(EPS, thickness);
        const rw = thickness;

        const pad = Math.max(0, Math.min(basePadding, rw/2 - 0.5, rh/2 - 0.5));
        const rx  = x + pad, ry = _y + pad;
        const rwP = Math.max(MIN_PX, rw - 2*pad);
        const rhP = Math.max(MIN_PX, rh - 2*pad);

        rects.push({ x: rx, y: ry, w: rwP, h: rhP, index: r.index });
        _y += rh;
      }
      x += thickness;
      w = Math.max(0, w - thickness);
    }
  }

  let row = [];
  while (items.length){
    // Use the shorter side only for the *aspect test*; not for thickness
    const side = Math.max(EPS, Math.min(w, h));
    const item = items[0];
    const newRow = row.concat([item]);

    if (row.length === 0 ||
        worst(newRow.map(r=>r.area), side) <= worst(row.map(r=>r.area), side)){
      row = newRow;
      items.shift();
    } else {
      layoutRow(row);
      row = [];
    }
  }
  if (row.length && w > EPS && h > EPS){
    layoutRow(row);
  }
  return rects;
}

// === Figma helpers ===========================================================
function ensureFrameSelection(){
  const sel = figma.currentPage.selection;
  if (!sel || sel.length !== 1 || sel[0].type !== 'FRAME'){
    figma.notify('Select a single Frame first.');
    throw new Error('No frame selected.');
  }
  return sel[0];
}
function hslToRgb(h,s,l){
  const a = s*Math.min(l,1-l);
  const f = (n)=>{const k=(n+h*12)%12; const c=l-a*Math.max(Math.min(k-3,9-k,1),-1); return Math.round(255*c);};
  return { r:f(0), g:f(8), b:f(4) };
}
function randomColorFor(index,rng){
  const h=(index*47+Math.floor(rng()*360))%360, s=70+Math.floor(rng()*25), l=55+Math.floor(rng()*15);
  const rgb=hslToRgb(h/360, s/100, l/100);
  return [{ type:'SOLID', color:{ r:rgb.r/255, g:rgb.g/255, b:rgb.b/255 }, opacity:1 }];
}
function removeExistingTreemap(parent){
  parent.children.filter(n=>n.name==='Treemap').forEach(n=>n.remove());
}
function createTreemapContainer(parent){
  removeExistingTreemap(parent);
  const container = figma.createFrame();
  container.name = 'Treemap';
  container.fills = [];
  container.strokes = [];
  container.effects = [];
  container.clipsContent = true;
  container.layoutMode = 'NONE';
  container.x = 0; container.y = 0;
  container.resize(parent.width, parent.height);
  if (parent.layoutMode && parent.layoutMode !== 'NONE'){
    container.layoutPositioning = 'ABSOLUTE';
  }
  parent.appendChild(container);
  return container;
}
function clampToContainer(node, container){
  const eps=0.001;
  if (node.x < 0) node.x = 0;
  if (node.y < 0) node.y = 0;
  if (node.x + node.width  > container.width  + eps){
    node.resizeWithoutConstraints(Math.max(1, container.width  - node.x), node.height);
  }
  if (node.y + node.height > container.height + eps){
    node.resizeWithoutConstraints(node.width, Math.max(1, container.height - node.y));
  }
}

// === Plugin entry ============================================================
figma.on('run', ({command})=>{
  if (command === 'create'){
    figma.showUI(__html__, { width: 360, height: 420 });
  } else {
    figma.closePlugin();
  }
});

figma.ui.onmessage = (msg)=>{
  if (msg.type !== 'run') return;
  try{
    const frame   = ensureFrameSelection();
    frame.clipsContent = true;

    const count   = Math.max(1, msg.count || 1);
    const padding = Math.max(0, Number(msg.padding) || 0);
    const seed    = (msg.seed && String(msg.seed).length) ? String(msg.seed) : String(Math.floor(Math.random()*1e9));
    const rng     = mulberry32(hashSeed(seed));

    const weights = (Array.isArray(msg.weights) && msg.weights.length)
      ? msg.weights.map(Number).filter(n => Number.isFinite(n) && n > 0)
      : randomWeights(count, rng);

    const rects = squarifyTreemap(weights, frame.width, frame.height, padding);
    const container = createTreemapContainer(frame);

    for (const r of rects){
      const node = figma.createRectangle();
      node.x = r.x; node.y = r.y;
      node.resizeWithoutConstraints(Math.max(1, r.w), Math.max(1, r.h));
      node.fills = randomColorFor(r.index, rng);
      node.strokes = [{ type:'SOLID', color:{ r:0, g:0, b:0 }, opacity:0.06 }];
      node.strokeWeight = 1;
      node.name = `Cell ${r.index + 1}`;
      container.appendChild(node);
      clampToContainer(node, container);
    }

    figma.notify(`Treemap created: ${rects.length} rectangles`);
  } catch (err){
    console.error(err);
    figma.notify((err && err.message) || 'Failed to create treemap');
  }
};