figma.showUI(__html__, { width: 300, height: 200 });

function hexToRgb(hex: string): RGB {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return {
    r: ((bigint >> 16) & 255) / 255,
    g: ((bigint >> 8) & 255) / 255,
    b: (bigint & 255) / 255,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateColor(c1: RGB, c2: RGB, t: number): RGB {
  return {
    r: lerp(c1.r, c2.r, t),
    g: lerp(c1.g, c2.g, t),
    b: lerp(c1.b, c2.b, t),
  };
}

function getColorFromGradient(c1: RGB, c2: RGB, c3: RGB, t: number): RGB {
  return t <= 0.5
    ? interpolateColor(c1, c2, t * 2)
    : interpolateColor(c2, c3, (t - 0.5) * 2);
}

figma.ui.onmessage = (msg) => {
  if (msg.type === 'apply-gradient') {
    const [hex1, hex2, hex3] = msg.colors;
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const rgb3 = hexToRgb(hex3);

    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.notify("Please select one or more objects.");
    } else {
      for (const node of selection) {
        if ("fills" in node && Array.isArray(node.fills)) {
          const t = Math.random();
          const color = getColorFromGradient(rgb1, rgb2, rgb3, t);
          const newPaint: Paint = {
            type: "SOLID",
            color,
          };
          node.fills = [newPaint];
        }
      }
      figma.notify("Applied custom gradient colors.");
    }

    figma.closePlugin();
  }
};