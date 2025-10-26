// === Utilities ===============================================================
function hashSeed(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function randomWeights(n,rng){return Array.from({length:n},()=>Math.max(1e-6,rng()));}

// === Squarified Treemap (robust, always places all) ==========================
function squarifyTreemap(weights, W, H, basePadding){
  const total = weights.reduce((a,b)=>a+b,0); if(total<=0) return [];
  const area  = W*H;
  const scaled = weights.map(w => (w/total)*area);

  const rects = [];
  let x=0, y=0, w=W, h=H;
  const items = scaled.map((s,i)=>({area:s,index:i})).sort((a,b)=>b.area-a.area);

  const EPS = 1e-6, MIN_PX = 1;

  function worst(rowAreas, side){
    if(rowAreas.length===0) return Infinity;
    const sum=rowAreas.reduce((a,b)=>a+b,0), max=Math.max(...rowAreas), min=Math.min(...rowAreas);
    const s2=side*side || EPS; // avoid div-by-0
    return Math.max((s2*max)/(sum*sum), (sum*sum)/(s2*min));
  }

  function layoutRow(row, side){
    // If the shorter side is the HEIGHT, we lay out a horizontal row (across width).
    const horizontal = (side === h);
    const rowSum = row.reduce((a,r)=>a+r.area,0);
    const thickness = rowSum / side;                // height (if horizontal) or width (if vertical)

    if(horizontal){
      let _x = x;
      for(const r of row){
        const rw = r.area / thickness;
        const rh = thickness;

        // safe per-cell padding
        const pad = Math.max(0, Math.min(basePadding, rw/2-0.5, rh/2-0.5));
        const rx = _x + pad, ry = y + pad;
        const rwPad = Math.max(MIN_PX, rw - 2*pad);
        const rhPad = Math.max(MIN_PX, rh - 2*pad);

        rects.push({ x: rx, y: ry, w: rwPad, h: rhPad, index: r.index });
        _x += rw;
      }
      y += thickness;
      h = Math.max(0, h - thickness);
    }else{
      let _y = y;
      for(const r of row){
        const rh = r.area / thickness;
        const rw = thickness;

        const pad = Math.max(0, Math.min(basePadding, rw/2-0.5, rh/2-0.5));
        const rx = x + pad, ry = _y + pad;
        const rwPad = Math.max(MIN_PX, rw - 2*pad);
        const rhPad = Math.max(MIN_PX, rh - 2*pad);

        rects.push({ x: rx, y: ry, w: rwPad, h: rhPad, index: r.index });
        _y += rh;
      }
      x += thickness;
      w = Math.max(0, w - thickness);
    }
  }

  let row = [];
  while(items.length){
    const side = Math.max(EPS, Math.min(w,h));      // never 0
    const item = items[0];
    const newRow = row.concat([item]);
    if(row.length===0 || worst(newRow.map(r=>r.area), side) <= worst(row.map(r=>r.area), side)){
      row = newRow; items.shift();
    }else{
      layoutRow(row, side);
      row = [];
      if(w<=EPS || h<=EPS) break;                   // no space left; safety break
    }
  }
  if(row.length && w>EPS && h>EPS){
    layoutRow(row, Math.min(w,h));
  }

  // If numerical issues ever left some items unplaced, put tiny tiles along the bottom-left.
  const missing = weights.length - rects.length;
  if(missing > 0){
    for(let i=0;i<missing;i++){
      rects.push({ x: Math.min(W-1, i%Math.max(1,Math.floor(W/4))*4),
                   y: Math.min(H-1, H-4 - Math.floor(i/Math.max(1,Math.floor(W/4)))*4),
                   w: 4, h: 4, index: rects.length + i });
    }
  }
  return rects;
}

// === Figma helpers ===========================================================
function ensureFrameSelection(){
  const sel = figma.currentPage.selection;
  if(!sel || sel.length!==1 || sel[0].type!=='FRAME'){
    figma.notify('Select a single Frame first.');
    throw new Error('No frame selected.');
  }
  return sel[0];
}
function hslToRgb(h,s,l){
  const a=s*Math.min(l,1-l);
  const f=n=>{const k=(n+h*12)%12; const c=l-a*Math.max(Math.min(k-3,9-k,1),-1); return Math.round(255*c);};
  return {r:f(0), g:f(8), b:f(4)};
}
function randomColorFor(index,rng){
  const h=(index*47+Math.floor(rng()*360))%360, s=70+Math.floor(rng()*25), l=55+Math.floor(rng()*15);
  const rgb=hslToRgb(h/360,s/100,l/100);
  return [{type:'SOLID', color:{r:rgb.r/255,g:rgb.g/255,b:rgb.b/255}, opacity:1}];
}
function removeExistingTreemap(parent){
  parent.children.filter(n=>n.name==='Treemap').forEach(n=>n.remove());
}
function createTreemapContainer(parent){
  removeExistingTreemap(parent);
  const container = figma.createFrame();
  container.name='Treemap';
  container.fills=[]; container.strokes=[]; container.effects=[];
  container.clipsContent=true; container.layoutMode='NONE';
  container.x=0; container.y=0; container.resize(parent.width,parent.height);
  if(parent.layoutMode && parent.layoutMode!=='NONE'){ container.layoutPositioning='ABSOLUTE'; }
  parent.appendChild(container);
  return container;
}
function clampToContainer(node, container){
  const eps=0.001;
  if(node.x<0) node.x=0;
  if(node.y<0) node.y=0;
  if(node.x+node.width>container.width+eps){
    node.resizeWithoutConstraints(Math.max(1, container.width-node.x), node.height);
  }
  if(node.y+node.height>container.height+eps){
    node.resizeWithoutConstraints(node.width, Math.max(1, container.height-node.y));
  }
}

// === Plugin entry ============================================================
figma.on('run', ({command})=>{
  if(command==='create'){ figma.showUI(__html__, {width:360, height:420}); }
  else { figma.closePlugin(); }
});

figma.ui.onmessage = (msg)=>{
  if(msg.type!=='run') return;
  try{
    const frame = ensureFrameSelection();
    frame.clipsContent = true;

    const count   = Math.max(1, msg.count || 1);
    const padding = Math.max(0, Number(msg.padding) || 0);
    const seed    = (msg.seed && String(msg.seed).length) ? String(msg.seed) : String(Math.floor(Math.random()*1e9));
    const rng     = mulberry32(hashSeed(seed));
    const weights = (Array.isArray(msg.weights) && msg.weights.length)
      ? msg.weights.map(Number).filter(n=>Number.isFinite(n)&&n>0)
      : randomWeights(count, rng);

    const rects = squarifyTreemap(weights, frame.width, frame.height, padding);
    const container = createTreemapContainer(frame);

    for(const r of rects){
      const node = figma.createRectangle();
      node.x = r.x; node.y = r.y;
      node.resizeWithoutConstraints(Math.max(1,r.w), Math.max(1,r.h));
      node.fills = randomColorFor(r.index, rng);
      node.strokes = [{type:'SOLID', color:{r:0,g:0,b:0}, opacity:0.06}];
      node.strokeWeight = 1;
      node.name = `Cell ${r.index+1}`;
      container.appendChild(node);
      clampToContainer(node, container);
    }

    figma.notify(`Treemap created: ${rects.length} rectangles`);
  }catch(err){
    console.error(err);
    figma.notify((err && err.message) || 'Failed to create treemap');
  }
};