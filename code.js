// === Utilities ===============================================================
function hashSeed(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

// Balanced random weights (Irwin–Hall; k controls variance)
function randomWeights(n,rng){const k=3;const w=new Array(n);for(let i=0;i<n;i++){let s=0;for(let j=0;j<k;j++) s+=rng(); w[i]=Math.max(1e-6,s);}return w;}

function clamp01(x){return Math.max(0,Math.min(1,x));}
function lerp(a,b,t){return a+(b-a)*t;}
function hexToRgb(hex){const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());if(!m)throw new Error('Bad color: '+hex);return{r:parseInt(m[1],16)/255,g:parseInt(m[2],16)/255,b:parseInt(m[3],16)/255};}
function rgbToSolidPaint(rgb){return[{type:'SOLID',color:{r:rgb.r,g:rgb.g,b:rgb.b},opacity:1}];}

function luminance(rgb){const f=(v)=>(v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*f(rgb.r)+0.7152*f(rgb.g)+0.0722*f(rgb.b);}
function contrastTextPaintFor(rgb){return[{type:'SOLID',color:luminance(rgb)>0.5?{r:0,g:0,b:0}:{r:1,g:1,b:1},opacity:1}];}
function normalize(values){const min=Math.min(...values),max=Math.max(...values);if(max-min<=1e-9)return values.map(()=>0.5);return values.map(v=>(v-min)/(max-min));}

// Simple template renderer: replaces {{token}}
function renderTemplate(tpl, vars){
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_,k)=> (k in vars ? String(vars[k]) : ''));
}

// === Squarified Treemap (mosaic + controlled randomness) ====================
function squarifyTreemap(weights, W, H, basePadding, rng) {
  const SORT_JITTER = 0.18; // area order noise (0..0.6)
  const FLIP_PROB   = 0.55; // chance to flip orientation after each band (0..1)
  const BREAK_NOISE = 0.18; // noise in 'worst' break test (0..0.5)

  const total = weights.reduce((a,b)=>a+b,0); if (total <= 0) return [];
  const area  = W * H;

  const items = weights.map((w,i)=>{
    const a = (w/total)*area;
    const jitter = 1 + SORT_JITTER * (rng() - 0.5) * 2;
    return { area: a * jitter, index: i };
  }).sort((A,B)=>B.area - A.area);

  const rects = [];
  let x=0, y=0, w=W, h=H;
  const EPS=1e-6, MIN_PX=1;

  function worst(rowAreas, side){
    if (!rowAreas.length) return Infinity;
    const sum=rowAreas.reduce((a,b)=>a+b,0);
    const max=Math.max(...rowAreas);
    const min=Math.min(...rowAreas);
    const s2=Math.max(EPS, side*side);
    return Math.max((s2*max)/(sum*sum), (sum*sum)/(s2*min));
  }

  let nextHorizontal = rng() < 0.5; // start randomly

  function layoutRow(row){
    const rowSum = row.reduce((a,r)=>a+r.area, 0);
    const horizontal = nextHorizontal;
    const thickness  = horizontal ? (rowSum / Math.max(EPS, w))
                                  : (rowSum / Math.max(EPS, h));

    if (horizontal){
      let _x = x;
      for (const r of row){
        const rw = r.area / Math.max(EPS, thickness);
        const rh = thickness;
        const pad = Math.max(0, Math.min(basePadding, rw/2 - 0.5, rh/2 - 0.5));
        rects.push({ x:_x+pad, y:y+pad, w:Math.max(MIN_PX,rw-2*pad), h:Math.max(MIN_PX,rh-2*pad), index:r.index });
        _x += rw;
      }
      y += thickness; h = Math.max(0, h - thickness);
    } else {
      let _y = y;
      for (const r of row){
        const rh = r.area / Math.max(EPS, thickness);
        const rw = thickness;
        const pad = Math.max(0, Math.min(basePadding, rw/2 - 0.5, rh/2 - 0.5));
        rects.push({ x:x+pad, y:_y+pad, w:Math.max(MIN_PX,rw-2*pad), h:Math.max(MIN_PX,rh-2*pad), index:r.index });
        _y += rh;
      }
      x += thickness; w = Math.max(0, w - thickness);
    }

    if (rng() < FLIP_PROB) nextHorizontal = !nextHorizontal;
  }

  let row = [];
  while (items.length && w > EPS && h > EPS){
    const side   = Math.max(EPS, Math.min(w, h));
    const item   = items[0];
    const newRow = row.concat([item]);
    const noise  = 1 + BREAK_NOISE * (rng() - 0.5) * 2;
    const accept = (row.length === 0) ||
                   (worst(newRow.map(r=>r.area), side) <= worst(row.map(r=>r.area), side) * noise);
    if (accept) { row = newRow; items.shift(); }
    else { layoutRow(row); row = []; }
  }
  if (row.length && w > EPS && h > EPS) layoutRow(row);

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
  const a=s*Math.min(l,1-l);
  const f=n=>{const k=(n+h*12)%12; const c=l-a*Math.max(Math.min(k-3,9-k,1),-1); return Math.round(255*c)/255;};
  return { r:f(0), g:f(8), b:f(4) };
}
function randomColorFor(index,rng){
  const h=(index*47+Math.floor(rng()*360))%360, s=0.75, l=0.62;
  const rgb=hslToRgb(h/360,s,l);
  return rgbToSolidPaint(rgb);
}
function removeExistingTreemap(parent){
  parent.children.filter(n=>n.name==='Treemap').forEach(n=>n.remove());
}
function createTreemapContainer(parent){
  removeExistingTreemap(parent);
  const f=figma.createFrame();
  f.name='Treemap';
  f.fills=[]; f.strokes=[]; f.effects=[];
  f.clipsContent=true; f.layoutMode='NONE';
  f.x=0; f.y=0; f.resize(parent.width,parent.height);
  if (parent.layoutMode && parent.layoutMode !== 'NONE'){ f.layoutPositioning='ABSOLUTE'; }
  parent.appendChild(f);
  return f;
}
function clampToContainer(node,container){
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

// === Gradient helpers ========================================================
function listLinearGradientStyles(){
  return figma.getLocalPaintStyles()
    .filter(s => (s.paints||[]).some(p => p.type === 'GRADIENT_LINEAR'))
    .map(s => ({ id: s.id, name: s.name }));
}
function sampleFromGradientPaint(gradPaint, t){
  const stops = gradPaint.gradientStops.slice().sort((a,b)=>a.position-b.position);
  const tt = clamp01(t);
  let i = 0; while (i < stops.length-1 && tt > stops[i+1].position) i++;
  const a = stops[i], b = stops[Math.min(i+1, stops.length-1)];
  const span = Math.max(1e-6, b.position - a.position);
  const lt = clamp01((tt - a.position) / span);
  const r = lerp(a.color.r, b.color.r, lt);
  const g = lerp(a.color.g, b.color.g, lt);
  const bb= lerp(a.color.b, b.color.b, lt);
  return { r, g, b: bb };
}
function getGradientPaintFromStyleId(styleId){
  if (!styleId) return null;
  const style = figma.getStyleById(styleId);
  if (!style || style.type !== 'PAINT') return null;
  const p = (style.paints || []).find(pp => pp.type === 'GRADIENT_LINEAR');
  return p || null;
}
function createLinearGradientStyle({name,start,end,angleDeg}){
  const style = figma.createPaintStyle(); style.name = name;
  const c0=hexToRgb(start), c1=hexToRgb(end);
  const theta=(angleDeg||0)*Math.PI/180, cos=Math.cos(theta), sin=Math.sin(theta);
  const G = [
    [ cos, sin,  0.5 - 0.5*cos - 0.5*sin],
    [-sin, cos,  0.5 + 0.5*sin - 0.5*cos],
  ];
  const paint = {
    type:'GRADIENT_LINEAR',
    gradientStops: [
      { position:0, color:{ r:c0.r, g:c0.g, b:c0.b, a:1 } },
      { position:1, color:{ r:c1.r, g:c1.g, b:c1.b, a:1 } },
    ],
    gradientTransform: G,
  };
  style.paints = [paint];
  return { id: style.id, name: style.name };
}

// === Label rendering =========================================================
async function addLabelIfFits({ rectNode, textPaint, labelText, minW=80, minH=48 }) {
  if (rectNode.width < minW || rectNode.height < minH) return;

  // load fonts (once per call; cached by Figma)
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  } catch (_) {}

  const text = figma.createText();
  text.textAutoResize = "WIDTH_AND_HEIGHT";
  text.characters = labelText;

  // Base styles
  text.fontName = { family: "Inter", style: "Regular" };
  const baseSize = Math.max(10, Math.min(16, Math.floor(rectNode.height * 0.12)));
  text.fontSize = baseSize;
  text.lineHeight = { unit: "AUTO" };
  text.textAlignHorizontal = "CENTER";
  text.fills = textPaint;

  // Bold the first line only
  const firstLineEnd = labelText.indexOf('\n') === -1 ? labelText.length : labelText.indexOf('\n');
  try {
    text.setRangeFontName(0, firstLineEnd, { family: "Inter", style: "Bold" });
    text.setRangeFontSize(0, firstLineEnd, Math.round(baseSize * 1.06));
  } catch (_) {}

  // Center inside the rect
  rectNode.parent.appendChild(text);
  text.x = rectNode.x + (rectNode.width  - text.width)  / 2;
  text.y = rectNode.y + (rectNode.height - text.height) / 2;

  // Final fit check (padding)
  const PAD = 6;
  const fits =
    text.width  <= rectNode.width  - PAD*2 &&
    text.height <= rectNode.height - PAD*2;
  if (!fits) text.remove();
}

// === Plugin entry ============================================================
figma.on('run', ({command})=>{
  if (command === 'create'){
    figma.showUI(__html__, { width: 380, height: 560 });
    // send styles now and again shortly after (UI mount timing safety)
    figma.ui.postMessage({ type:'styles', styles: listLinearGradientStyles() });
    setTimeout(()=>figma.ui.postMessage({ type:'styles', styles: listLinearGradientStyles() }), 50);
  } else {
    figma.closePlugin();
  }
});

figma.ui.onmessage = async (msg)=>{
  if (msg.type === 'request-styles'){
    figma.ui.postMessage({ type:'styles', styles: listLinearGradientStyles() });
    return;
  }
  if (msg.type === 'create-gradient-style'){
    try {
      const created = createLinearGradientStyle({
        name: msg.name, start: msg.start, end: msg.end, angleDeg: msg.angle
      });
      figma.ui.postMessage({ type:'style-created', style: created });
      figma.notify('Gradient style created');
    } catch(e){
      figma.notify('Failed to create gradient style (check hex colors)');
    }
    return;
  }
  if (msg.type !== 'run') return;

  try{
    const frame = ensureFrameSelection();
    frame.clipsContent = true;

    const count   = Math.max(1, msg.count || 1);
    const padding = Math.max(0, Number(msg.padding) || 0);
    const seed    = (msg.seed && String(msg.seed).length) ? String(msg.seed) : String(Math.floor(Math.random()*1e9));
    const rng     = mulberry32(hashSeed(seed));
    const labelTemplate = (msg.labelTemplate && String(msg.labelTemplate).length)
      ? String(msg.labelTemplate)
      : "{{name}}\n{{percent}}%";

    const weights = (Array.isArray(msg.weights) && msg.weights.length)
      ? msg.weights.map(Number).filter(n=>Number.isFinite(n) && n>0)
      : randomWeights(count, rng);

    const rects = squarifyTreemap(weights, frame.width, frame.height, padding, rng);
    const container = createTreemapContainer(frame);

    const totalsum = weights.reduce((a,b)=>a+b,0);
    const normWeights = normalize(weights);

    const useGradient = (msg.colorMode === 'gradient') && msg.gradientStyleId;
    const gradPaint   = useGradient ? getGradientPaintFromStyleId(msg.gradientStyleId) : null;

    for (let i = 0; i < rects.length; i++){
      const r = rects[i];
      const node = figma.createRectangle();
      node.x = r.x; node.y = r.y;
      node.resizeWithoutConstraints(Math.max(1,r.w), Math.max(1,r.h));

      let usedRgb = null;

      if (gradPaint){
        // correlate color with weight
        const t = normWeights[r.index];
        const rgb = sampleFromGradientPaint(gradPaint, t);
        node.fills = rgbToSolidPaint(rgb);
        usedRgb = rgb;
      } else {
        const fill = randomColorFor(r.index, rng);
        node.fills = fill;
        const c = fill[0].color; usedRgb = { r:c.r, g:c.g, b:c.b };
      }

      node.strokes = [{ type:'SOLID', color:{ r:0,g:0,b:0 }, opacity:0.14 }];
      node.strokeWeight = 1;
      node.name = `Cell ${r.index+1}`;
      container.appendChild(node);
      clampToContainer(node, container);

      // Build label from template; fall back to default name
      const name = `Cell ${r.index+1}`;
      const percent = Math.round((weights[r.index] / totalsum) * 100);
      const labelText = renderTemplate(labelTemplate, {
        name, index: (r.index+1), percent
      });

      await addLabelIfFits({
        rectNode: node,
        textPaint: contrastTextPaintFor(usedRgb),
        labelText
      });
    }

    figma.notify(`Treemap created: ${rects.length} rectangles`);
  } catch (err){
    console.error(err);
    figma.notify((err && err.message) || 'Failed to create treemap');
  }
};