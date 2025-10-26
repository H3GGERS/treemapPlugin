// === Utilities ===============================================================
function hashSeed(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
// Balanced random weights
function randomWeights(n,rng){const k=3;const w=new Array(n);for(let i=0;i<n;i++){let s=0;for(let j=0;j<k;j++) s+=rng(); w[i]=Math.max(1e-6,s);}return w;}
function clamp01(x){return Math.max(0,Math.min(1,x));}
function lerp(a,b,t){return a+(b-a)*t;}
function hexToRgb(hex){const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());if(!m)throw new Error('Bad color: '+hex);return{r:parseInt(m[1],16)/255,g:parseInt(m[2],16)/255,b:parseInt(m[3],16)/255};}
function rgbToSolidPaint(rgb){return[{type:'SOLID',color:{r:rgb.r,g:rgb.g,b:rgb.b},opacity:1}];}

// === Squarified Treemap (mosaic alternation) ================================
function squarifyTreemap(weights,W,H,basePadding){
  const total=weights.reduce((a,b)=>a+b,0); if(total<=0)return[];
  const area=W*H;
  const items=weights.map((w,i)=>({area:(w/total)*area,index:i})).sort((a,b)=>b.area-a.area);
  const rects=[]; let x=0,y=0,w=W,h=H; const EPS=1e-6,MIN_PX=1;
  function worst(rowAreas,side){if(!rowAreas.length)return Infinity;const sum=rowAreas.reduce((a,b)=>a+b,0),max=Math.max(...rowAreas),min=Math.min(...rowAreas);const s2=Math.max(EPS,side*side);return Math.max((s2*max)/(sum*sum),(sum*sum)/(s2*min));}
  let nextHorizontal=(W>=H);
  function layoutRow(row){
    const rowSum=row.reduce((a,r)=>a+r.area,0);
    const horizontal=nextHorizontal;
    const thickness=horizontal?(rowSum/Math.max(EPS,w)):(rowSum/Math.max(EPS,h));
    if(horizontal){
      let _x=x;
      for(const r of row){
        const rw=r.area/Math.max(EPS,thickness), rh=thickness;
        const pad=Math.max(0,Math.min(basePadding,rw/2-0.5,rh/2-0.5));
        rects.push({x:_x+pad,y:y+pad,w:Math.max(MIN_PX,rw-2*pad),h:Math.max(MIN_PX,rh-2*pad),index:r.index});
        _x+=rw;
      }
      y+=thickness; h=Math.max(0,h-thickness);
    }else{
      let _y=y;
      for(const r of row){
        const rh=r.area/Math.max(EPS,thickness), rw=thickness;
        const pad=Math.max(0,Math.min(basePadding,rw/2-0.5,rh/2-0.5));
        rects.push({x:x+pad,y:_y+pad,w:Math.max(MIN_PX,rw-2*pad),h:Math.max(MIN_PX,rh-2*pad),index:r.index});
        _y+=rh;
      }
      x+=thickness; w=Math.max(0,w-thickness);
    }
    nextHorizontal=!nextHorizontal;
  }
  let row=[];
  while(items.length&&w>EPS&&h>EPS){
    const side=Math.max(EPS,Math.min(w,h)); const item=items[0]; const newRow=row.concat([item]);
    if(row.length===0||worst(newRow.map(r=>r.area),side)<=worst(row.map(r=>r.area),side)){row=newRow;items.shift();}
    else{layoutRow(row);row=[];}
  }
  if(row.length&&w>EPS&&h>EPS) layoutRow(row);
  return rects;
}

// === Figma helpers ===========================================================
function ensureFrameSelection(){const sel=figma.currentPage.selection; if(!sel||sel.length!==1||sel[0].type!=='FRAME'){figma.notify('Select a single Frame first.');throw new Error('No frame selected.');} return sel[0];}
function hslToRgb(h,s,l){const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h*12)%12;const c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c)/255;};return{r:f(0),g:f(8),b:f(4)};}
function randomColorFor(index,rng){const h=(index*47+Math.floor(rng()*360))%360,s=0.75,l=0.62;const rgb=hslToRgb(h/360,s,l);return rgbToSolidPaint(rgb);}
function removeExistingTreemap(parent){parent.children.filter(n=>n.name==='Treemap').forEach(n=>n.remove());}
function createTreemapContainer(parent){removeExistingTreemap(parent);const f=figma.createFrame();f.name='Treemap';f.fills=[];f.strokes=[];f.effects=[];f.clipsContent=true;f.layoutMode='NONE';f.x=0;f.y=0;f.resize(parent.width,parent.height);if(parent.layoutMode&&parent.layoutMode!=='NONE'){f.layoutPositioning='ABSOLUTE';}parent.appendChild(f);return f;}
function clampToContainer(node,container){const eps=0.001;if(node.x<0)node.x=0;if(node.y<0)node.y=0;if(node.x+node.width>container.width+eps){node.resizeWithoutConstraints(Math.max(1,container.width-node.x),node.height);}if(node.y+node.height>container.height+eps){node.resizeWithoutConstraints(node.width,Math.max(1,container.height-node.y));}}

// === Gradient helpers ========================================================
function listLinearGradientStyles(){
  return figma.getLocalPaintStyles()
    .filter(s => (s.paints||[]).some(p => p.type==='GRADIENT_LINEAR'))
    .map(s => ({ id: s.id, name: s.name }));
}
function sampleFromGradientPaint(gradPaint, t){
  const stops=gradPaint.gradientStops.slice().sort((a,b)=>a.position-b.position);
  const tt=clamp01(t); let i=0; while(i<stops.length-1 && tt>stops[i+1].position) i++;
  const a=stops[i], b=stops[Math.min(i+1,stops.length-1)];
  const span=Math.max(1e-6,b.position-a.position);
  const lt=clamp01((tt-a.position)/span);
  const r=lerp(a.color.r,b.color.r,lt), g=lerp(a.color.g,b.color.g,lt), bb=lerp(a.color.b,b.color.b,lt);
  return { r, g, b: bb };
}
function getGradientPaintFromStyleId(styleId){
  if(!styleId) return null;
  const style=figma.getStyleById(styleId);
  if(!style||style.type!=='PAINT') return null;
  const p=(style.paints||[]).find(pp=>pp.type==='GRADIENT_LINEAR');
  return p||null;
}
function createLinearGradientStyle({name,start,end,angleDeg}){
  const style=figma.createPaintStyle(); style.name=name;
  const c0=hexToRgb(start), c1=hexToRgb(end);
  const theta=(angleDeg||0)*Math.PI/180, cos=Math.cos(theta), sin=Math.sin(theta);
  const G=[[cos,sin,0.5-0.5*cos-0.5*sin],[-sin,cos,0.5+0.5*sin-0.5*cos]];
  const paint={ type:'GRADIENT_LINEAR', gradientStops:[
      {position:0,color:{r:c0.r,g:c0.g,b:c0.b,a:1}},
      {position:1,color:{r:c1.r,g:c1.g,b:c1.b,a:1}},
    ], gradientTransform:G };
  style.paints=[paint];
  return { id: style.id, name: style.name };
}

// === Plugin entry ============================================================
figma.on('run', ({command})=>{
  if(command==='create'){
    figma.showUI(__html__, { width: 380, height: 560 });
    // send styles now and shortly after (UI mount timing safety)
    figma.ui.postMessage({ type:'styles', styles: listLinearGradientStyles() });
    setTimeout(()=>figma.ui.postMessage({ type:'styles', styles: listLinearGradientStyles() }), 50);
  } else {
    figma.closePlugin();
  }
});

figma.ui.onmessage = (msg)=>{
  if(msg.type==='request-styles'){
    figma.ui.postMessage({ type:'styles', styles: listLinearGradientStyles() });
    return;
  }
  if(msg.type==='create-gradient-style'){
    try{
      const created=createLinearGradientStyle({ name: msg.name, start: msg.start, end: msg.end, angleDeg: msg.angle });
      figma.ui.postMessage({ type:'style-created', style: created });
      figma.notify('Gradient style created');
    }catch(e){
      figma.notify('Failed to create gradient style (check hex colors)');
    }
    return;
  }
  if(msg.type!=='run') return;

  try{
    const frame=ensureFrameSelection();
    frame.clipsContent=true;

    const count=Math.max(1,msg.count||1);
    const padding=Math.max(0,Number(msg.padding)||0);
    const seed=(msg.seed&&String(msg.seed).length)?String(msg.seed):String(Math.floor(Math.random()*1e9));
    const rng=mulberry32(hashSeed(seed));

    const weights=(Array.isArray(msg.weights)&&msg.weights.length)
      ? msg.weights.map(Number).filter(n=>Number.isFinite(n)&&n>0)
      : randomWeights(count,rng);

    const rects=squarifyTreemap(weights,frame.width,frame.height,padding);
    const container=createTreemapContainer(frame);

    const useGradient=(msg.colorMode==='gradient')&&msg.gradientStyleId;
    const gradPaint=useGradient?getGradientPaintFromStyleId(msg.gradientStyleId):null;

    for(const r of rects){
      const node=figma.createRectangle();
      node.x=r.x; node.y=r.y;
      node.resizeWithoutConstraints(Math.max(1,r.w),Math.max(1,r.h));
      if(gradPaint){
        const t=rng(); const rgb=sampleFromGradientPaint(gradPaint,t);
        node.fills=rgbToSolidPaint(rgb);
      }else{
        node.fills=randomColorFor(r.index,rng);
      }
      node.strokes=[{type:'SOLID',color:{r:0,g:0,b:0},opacity:0.14}];
      node.strokeWeight=1;
      node.name=`Cell ${r.index+1}`;
      container.appendChild(node);
      clampToContainer(node,container);
    }

    figma.notify(`Treemap created: ${rects.length} rectangles`);
  }catch(err){
    console.error(err);
    figma.notify((err&&err.message)||'Failed to create treemap');
  }
};