import type { DiagramShape, RawAtom } from '../core/model';
import { NS, escapeAttr, escapeText } from '../docx/xml';

export const DIAGRAM_GROUPS: [string, [string, string][]][] = [
  ['List', [['list', 'Vertical list'], ['blockList', 'Block list'], ['stackedList', 'Stacked list'], ['bulletList', 'Horizontal list'], ['linedList', 'Lined list'], ['chevronList', 'Chevron list'], ['trapezoidList', 'Trapezoid list'], ['tableList', 'Table list'], ['circleList', 'Circle list'], ['numberedList', 'Numbered list']]],
  ['Process', [['process', 'Basic process'], ['chevronProcess', 'Chevron process'], ['verticalProcess', 'Vertical process'], ['stepUp', 'Step up'], ['stepDown', 'Step down'], ['arrowProcess', 'Continuous arrow'], ['timeline', 'Timeline'], ['alternating', 'Alternating flow'], ['circleProcess', 'Circle process'], ['bendingProcess', 'Bending process'], ['upwardArrow', 'Upward arrow'], ['funnelProcess', 'Funnel']]],
  ['Cycle', [['cycle', 'Basic cycle'], ['blockCycle', 'Block cycle'], ['radial', 'Radial cycle'], ['segmentedCycle', 'Segmented cycle'], ['continuousCycle', 'Continuous cycle'], ['gears', 'Gears'], ['textCycle', 'Text cycle']]],
  ['Hierarchy', [['hierarchy', 'Organization chart'], ['horizontalHierarchy', 'Horizontal hierarchy'], ['tableHierarchy', 'Table hierarchy'], ['lineHierarchy', 'Lined hierarchy']]],
  ['Relationship', [['overlap', 'Linear overlap'], ['venn', 'Venn'], ['stackedVenn', 'Stacked circles'], ['target', 'Target'], ['balance', 'Balance'], ['equation', 'Equation'], ['opposing', 'Opposing arrows'], ['converging', 'Converging arrows'], ['diverging', 'Diverging arrows'], ['radialVenn', 'Radial circles'], ['hub', 'Hub and spokes']]],
  ['Matrix', [['matrix', 'Basic matrix'], ['titledMatrix', 'Titled matrix'], ['gridMatrix', 'Grid matrix'], ['cycleMatrix', 'Cycle matrix']]],
  ['Pyramid', [['pyramid', 'Pyramid'], ['invertedPyramid', 'Upside-down pyramid'], ['segmentedPyramid', 'Segmented pyramid'], ['pyramidList', 'Pyramid list']]],
];

export const DIAGRAM_KINDS: [string, string][] = DIAGRAM_GROUPS.flatMap(([, l]) => l);

const WIDTH = 440;

const shade = (c: string, k: number): string => {
  const n = parseInt(c.slice(1, 7), 16);
  const mix = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  const r = mix(n >> 16); const g = mix((n >> 8) & 255); const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};
const box = (x: number, y: number, w: number, h: number, text: string, fill: string, prst = 'roundRect', color = '#ffffff', size = 11): DiagramShape => ({ x, y, w, h, prst, fill, text, color, size });
const deco = (x: number, y: number, w: number, h: number, prst: string, fill: string): DiagramShape => ({ x, y, w, h, prst, fill });

// Items may be indented with two spaces; layouts with levels use that.
export const buildDiagram = (kind: string, text: string, color: string): { shapes: DiagramShape[]; width: number; height: number } => {
  const lines = text.split('\n').filter((l) => l.trim());
  const level = lines.map((l) => Math.floor((/^\s*/.exec(l)?.[0].length ?? 0) / 2));
  const items = lines.map((l) => l.trim());
  const n = Math.max(1, items.length);
  const S: DiagramShape[] = [];
  const tint = (i: number) => shade(color, (i / Math.max(1, n)) * 0.45);
  const done = (height: number, width = WIDTH) => ({ shapes: S, width, height });
  switch (kind) {
    case 'blockList': { const cols = Math.min(3, n); const w = (WIDTH - (cols - 1) * 8) / cols; items.forEach((t, i) => S.push(box((i % cols) * (w + 8), Math.floor(i / cols) * 58, w, 50, t, tint(i), 'rect'))); return done(Math.ceil(n / cols) * 58); }
    case 'stackedList': { items.forEach((t, i) => S.push(box(i * 10, i * 30, WIDTH - (n - 1) * 10, 40, t, tint(i)))); return done(n * 30 + 12); }
    case 'bulletList': { const w = (WIDTH - (n - 1) * 8) / n; items.forEach((t, i) => { S.push(box(i * (w + 8), 0, w, 34, t, color, 'rect')); S.push(box(i * (w + 8), 34, w, 80, '', shade(color, 0.85), 'rect', '#222')); }); return done(116); }
    case 'linedList': { items.forEach((t, i) => { S.push(box(0, i * 40, WIDTH, 34, t, '#ffffff', 'rect', '#222')); S.push(deco(0, i * 40 + 34, WIDTH, 2, 'rect', color)); }); return done(n * 40); }
    case 'chevronList': { items.forEach((t, i) => { S.push(box(0, i * 44, 70, 38, String(i + 1), tint(i), 'chevron')); S.push(box(78, i * 44, WIDTH - 78, 38, t, shade(color, 0.85), 'rect', '#222')); }); return done(n * 44); }
    case 'trapezoidList': { const w = (WIDTH - (n - 1) * 6) / n; items.forEach((t, i) => S.push(box(i * (w + 6), 0, w, 110, t, tint(i), 'trapezoid'))); return done(110); }
    case 'tableList': { S.push(box(0, 0, WIDTH, 40, items[0] ?? '', color, 'rect')); const rest = items.slice(1); const w = WIDTH / Math.max(1, rest.length); rest.forEach((t, i) => S.push(box(i * w, 44, w - 4, 70, t, tint(i + 1), 'rect'))); return done(116); }
    case 'circleList': { items.forEach((t, i) => { S.push(box(0, i * 46, 40, 40, '', tint(i), 'ellipse')); S.push(box(50, i * 46 + 4, WIDTH - 50, 32, t, '#ffffff', 'rect', '#222')); }); return done(n * 46); }
    case 'numberedList': { items.forEach((t, i) => { S.push(box(0, i * 44, 40, 38, String(i + 1), color, 'rect', '#ffffff', 16)); S.push(box(44, i * 44, WIDTH - 44, 38, t, shade(color, 0.85), 'rect', '#222')); }); return done(n * 44); }
    case 'chevronProcess': { const w = (WIDTH + (n - 1) * 14) / n; items.forEach((t, i) => S.push(box(i * (w - 14), 0, w, 56, t, tint(i), i ? 'chevron' : 'homePlate'))); return done(56); }
    case 'verticalProcess': { items.forEach((t, i) => { S.push(box(WIDTH * 0.2, i * 70, WIDTH * 0.6, 46, t, tint(i))); if (i < n - 1) S.push(deco(WIDTH / 2 - 9, i * 70 + 49, 18, 18, 'downArrow', shade(color, 0.5))); }); return done(n * 70 - 24); }
    case 'stepUp': case 'stepDown': { const w = (WIDTH - (n - 1) * 6) / n; const h = 34; items.forEach((t, i) => { const k = kind === 'stepUp' ? i : n - 1 - i; S.push(box(i * (w + 6), (n - 1 - k) * 24, w, h + k * 24, t, tint(i), 'rect')); }); return done((n - 1) * 24 + h + 2); }
    case 'arrowProcess': { S.push(deco(0, 0, WIDTH, 90, 'rightArrow', shade(color, 0.75))); const w = (WIDTH * 0.8 - (n - 1) * 8) / n; items.forEach((t, i) => S.push(box(10 + i * (w + 8), 28, w, 34, t, tint(i)))); return done(90); }
    case 'timeline': { S.push(deco(0, 58, WIDTH, 4, 'rect', color)); const w = WIDTH / n; items.forEach((t, i) => { S.push(deco(i * w + w / 2 - 7, 53, 14, 14, 'ellipse', tint(i))); S.push(box(i * w + 4, i % 2 ? 76 : 0, w - 8, 44, t, shade(color, 0.85), 'roundRect', '#222', 10)); }); return done(122); }
    case 'alternating': { const w = (WIDTH - (n - 1) * 10) / n; items.forEach((t, i) => { S.push(box(i * (w + 10), i % 2 ? 50 : 0, w, 46, t, tint(i))); if (i < n - 1) S.push(deco(i * (w + 10) + w - 4, 34, 18, 26, i % 2 ? 'upArrow' : 'downArrow', shade(color, 0.5))); }); return done(96); }
    case 'circleProcess': { const d = Math.min(90, (WIDTH - (n - 1) * 24) / n); items.forEach((t, i) => { S.push(box(i * (d + 24), 0, d, d, t, tint(i), 'ellipse', '#ffffff', 10)); if (i < n - 1) S.push(deco(i * (d + 24) + d + 4, d / 2 - 8, 16, 16, 'rightArrow', shade(color, 0.5))); }); return done(d); }
    case 'bendingProcess': { const cols = 3; const w = (WIDTH - (cols - 1) * 26) / cols; items.forEach((t, i) => { const r = Math.floor(i / cols); const c = r % 2 ? cols - 1 - (i % cols) : i % cols; S.push(box(c * (w + 26), r * 70, w, 48, t, tint(i))); }); return done(Math.ceil(n / cols) * 70 - 22); }
    case 'upwardArrow': { S.push(deco(0, 0, WIDTH, 150, 'curvedUpArrow', shade(color, 0.7))); items.forEach((t, i) => S.push(box(30 + i * ((WIDTH - 120) / n), 120 - i * (90 / n) - 20, 100, 26, t, tint(i), 'rect', '#ffffff', 10))); return done(150); }
    case 'funnelProcess': { items.forEach((t, i) => { const w = WIDTH * (1 - (i / n) * 0.6); S.push(box((WIDTH - w) / 2, i * 36, w, 32, t, tint(i), 'trapezoid')); }); S.forEach((x) => { x.prst = 'flowChartManualOperation'; }); return done(n * 36); }
    case 'blockCycle': case 'textCycle': case 'cycle': case 'continuousCycle': {
      const size = 270; const c = size / 2; const r = 100; const bw = kind === 'textCycle' ? 110 : 100; const bh = kind === 'textCycle' ? 30 : 44;
      if (kind === 'continuousCycle') S.push(deco(WIDTH / 2 - r, c - r, r * 2, r * 2, 'donut', shade(color, 0.75)));
      items.forEach((t, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        S.push(box(WIDTH / 2 + Math.cos(a) * r * 1.3 - bw / 2, c + Math.sin(a) * r - bh / 2, bw, bh, t, kind === 'textCycle' ? '#ffffff' : tint(i), kind === 'blockCycle' ? 'rect' : 'roundRect', kind === 'textCycle' ? '#222' : '#ffffff'));
        if (kind !== 'continuousCycle') { const m = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2; S.push(deco(WIDTH / 2 + Math.cos(m) * r * 1.3 - 8, c + Math.sin(m) * r - 8, 16, 16, kind === 'cycle' ? 'ellipse' : 'rightArrow', shade(color, 0.5))); }
      });
      return done(size);
    }
    case 'radial': case 'hub': {
      const size = 280; const c = size / 2; const r = 104; const d = 64;
      if (kind === 'hub') S.push(deco(WIDTH / 2 - r * 1.4, c - r, r * 2.8, r * 2, 'donut', shade(color, 0.8)));
      S.push(box(WIDTH / 2 - 46, c - 46, 92, 92, items[0] ?? '', color, 'ellipse'));
      items.slice(1).forEach((t, i, all) => { const a = (i / all.length) * Math.PI * 2 - Math.PI / 2; const x = WIDTH / 2 + Math.cos(a) * r * 1.4; const y = c + Math.sin(a) * r; S.push(box(x - d / 2, y - d / 2, d, d, t, tint(i + 1), 'ellipse', '#ffffff', 10)); });
      return done(size);
    }
    case 'segmentedCycle': { const d = 220; items.forEach((t, i) => S.push(box(WIDTH / 2 - d / 2, 0, d, d, i === 0 ? t : '', tint(i), 'pie'))); S.length = 0; S.push(box(WIDTH / 2 - d / 2, 0, d, d, '', color, 'ellipse')); items.forEach((t, i) => { const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2; S.push(box(WIDTH / 2 + Math.cos(a) * d * 0.28 - 40, d / 2 + Math.sin(a) * d * 0.28 - 12, 80, 24, t, 'transparent', 'rect', '#ffffff', 10)); }); return done(d); }
    case 'gears': { const sizes = [110, 80, 64]; const pos = [[WIDTH / 2 - 120, 40], [WIDTH / 2 - 10, 0], [WIDTH / 2 + 50, 70]]; items.slice(0, 3).forEach((t, i) => S.push(box(pos[i]![0]!, pos[i]![1]!, sizes[i]!, sizes[i]!, t, tint(i), 'gear9', '#ffffff', 10))); return done(150); }
    case 'horizontalHierarchy': {
      const depth = Math.max(...level, 0) + 1; const colW = WIDTH / depth; const rowH = 44;
      let row = 0; items.forEach((t, i) => { S.push(box(level[i]! * colW, row * rowH, colW - 14, 36, t, tint(level[i]!))); if (i < n - 1 && level[i + 1]! <= level[i]!) row++; else if (i < n - 1) { /* child goes on the same row */ } });
      return done((row + 1) * rowH);
    }
    case 'tableHierarchy': { const depth = Math.max(...level, 0) + 1; for (let d = 0; d < depth; d++) { const row = items.filter((_, i) => level[i] === d); const w = WIDTH / Math.max(1, row.length); row.forEach((t, i) => S.push(box(i * w, d * 46, w - 4, 42, t, tint(d), 'rect'))); } return done(depth * 46); }
    case 'lineHierarchy': case 'hierarchy': {
      const depth = Math.max(...level, 0) + 1; const rowH = 66; const bh = 40;
      for (let d = 0; d < depth; d++) {
        const row = items.filter((_, i) => level[i] === d);
        const w = Math.min(130, (WIDTH - 8 * (row.length - 1)) / row.length); const total = row.length * w + (row.length - 1) * 8;
        row.forEach((t, i) => S.push(box((WIDTH - total) / 2 + i * (w + 8), d * rowH, w, bh, t, kind === 'lineHierarchy' ? '#ffffff' : tint(d), kind === 'lineHierarchy' ? 'rect' : 'roundRect', kind === 'lineHierarchy' ? '#222' : '#ffffff')));
        if (d < depth - 1) S.push(deco(WIDTH / 2 - 1, d * rowH + bh, 2, rowH - bh, 'rect', shade(color, 0.3)));
      }
      return done(depth * rowH);
    }
    case 'overlap': { const d = 150; const step = Math.min(100, (WIDTH - d) / Math.max(1, n - 1)); items.forEach((t, i) => S.push({ x: i * step, y: 0, w: d, h: d, prst: 'ellipse', fill: `${tint(i)}aa`, text: t, color: '#ffffff', size: 11 })); return done(d, d + (n - 1) * step); }
    case 'venn': { const d = 160; const pos = [[WIDTH / 2 - 130, 0], [WIDTH / 2 - 30, 0], [WIDTH / 2 - 80, 80]]; items.slice(0, 3).forEach((t, i) => S.push({ x: pos[i]![0]!, y: pos[i]![1]!, w: d, h: d, prst: 'ellipse', fill: `${tint(i)}99`, text: t, color: '#ffffff', size: 11 })); return done(n > 2 ? 240 : 160); }
    case 'stackedVenn': { items.forEach((t, i) => { const d = 240 - i * (180 / n); S.push({ x: WIDTH / 2 - d / 2, y: 240 - d, w: d, h: d, prst: 'ellipse', fill: tint(i), text: t, color: '#ffffff', size: 10 }); }); S.forEach((x) => { x.text = undefined; }); items.forEach((t, i) => { const d = 240 - i * (180 / n); S.push(box(WIDTH / 2 - 60, 240 - d + 6, 120, 18, t, 'transparent', 'rect', '#ffffff', 10)); }); return done(240); }
    case 'target': { const D = 220; items.forEach((_, i) => { const d = D - i * (D / n) * 0.9; S.push(deco(D / 2 - d / 2, D / 2 - d / 2, d, d, 'ellipse', tint(i))); }); items.forEach((t, i) => S.push(box(D + 16, i * 30 + 10, WIDTH - D - 16, 24, t, '#ffffff', 'rect', '#222', 10))); return done(D); }
    case 'balance': { S.push(deco(WIDTH / 2 - 30, 120, 60, 50, 'triangle', shade(color, 0.3))); S.push(deco(40, 108, WIDTH - 80, 10, 'rect', shade(color, 0.3))); items.slice(0, 2).forEach((t, i) => S.push(box(i ? WIDTH - 180 : 40, 40, 140, 60, t, tint(i)))); return done(170); }
    case 'equation': { const d = Math.min(100, (WIDTH - (n - 1) * 34) / n); items.forEach((t, i) => { S.push(box(i * (d + 34), 0, d, d, t, i === n - 1 ? color : tint(i), 'ellipse', '#ffffff', 10)); if (i < n - 1) S.push(deco(i * (d + 34) + d + 6, d / 2 - 11, 22, 22, i === n - 2 ? 'mathEqual' : 'mathPlus', shade(color, 0.4))); }); return done(d); }
    case 'opposing': { S.push(deco(0, 0, WIDTH / 2 - 4, 70, 'rightArrow', tint(0))); S.push(deco(WIDTH / 2 + 4, 0, WIDTH / 2 - 4, 70, 'leftArrow', tint(1))); items.slice(0, 2).forEach((t, i) => S.push(box(i ? WIDTH / 2 + 60 : 20, 22, WIDTH / 2 - 90, 26, t, 'transparent', 'rect'))); return done(70); }
    case 'converging': case 'diverging': { const h = 46; items.forEach((t, i) => { const y = i * (h + 6); S.push(box(0, y, WIDTH * 0.6, h, t, tint(i), kind === 'converging' ? 'rightArrow' : 'leftArrow')); }); S.push(box(WIDTH * 0.66, 0, WIDTH * 0.34, n * (h + 6) - 6, kind === 'converging' ? 'Result' : 'Source', color, 'ellipse')); return done(n * (h + 6) - 6); }
    case 'radialVenn': { const size = 270; const c = size / 2; S.push({ x: WIDTH / 2 - 60, y: c - 60, w: 120, h: 120, prst: 'ellipse', fill: color, text: items[0] ?? '', color: '#ffffff', size: 11 }); items.slice(1).forEach((t, i, all) => { const a = (i / all.length) * Math.PI * 2 - Math.PI / 2; S.push({ x: WIDTH / 2 + Math.cos(a) * 90 - 45, y: c + Math.sin(a) * 90 - 45, w: 90, h: 90, prst: 'ellipse', fill: `${tint(i + 1)}aa`, text: t, color: '#ffffff', size: 10 }); }); return done(size); }
    case 'matrix': case 'titledMatrix': case 'cycleMatrix': {
      const top = kind === 'titledMatrix' ? 30 : 0; const s = 120; const x0 = WIDTH / 2 - s;
      if (kind === 'titledMatrix') S.push(box(x0, 0, s * 2, 26, items[0] ?? '', color, 'rect'));
      const cells = kind === 'titledMatrix' ? items.slice(1, 5) : items.slice(0, 4);
      cells.forEach((t, i) => S.push(box(x0 + (i % 2) * s, top + Math.floor(i / 2) * s, s - 4, s - 4, t, tint(i), kind === 'cycleMatrix' ? (['round1Rect', 'round1Rect', 'round1Rect', 'round1Rect'][i] ?? 'rect') : 'rect')));
      if (kind === 'cycleMatrix') S.push(deco(WIDTH / 2 - 30, top + s - 32, 60, 60, 'circularArrow', '#ffffff'));
      return done(top + s * 2);
    }
    case 'gridMatrix': { const cols = Math.ceil(Math.sqrt(n)); const s = Math.min(100, WIDTH / cols); items.forEach((t, i) => S.push(box((i % cols) * s, Math.floor(i / cols) * s, s - 4, s - 4, t, tint(i), 'rect'))); return done(Math.ceil(n / cols) * s, cols * s); }
    case 'invertedPyramid': { const h = 38; items.forEach((t, i) => { const w = WIDTH * (1 - (i / n) * 0.9); S.push(box((WIDTH - w) / 2, i * (h + 3), w, h, t, tint(i), 'rect')); }); return done(n * (h + 3)); }
    case 'segmentedPyramid': { const H = 200; S.push(deco(WIDTH / 2 - H * 0.7, 0, H * 1.4, H, 'triangle', color)); items.forEach((t, i) => S.push(box(WIDTH / 2 - 60, (i + 0.5) * (H / n) - 10 + H * 0.08, 120, 20, t, 'transparent', 'rect', '#ffffff', 10))); for (let i = 1; i < n; i++) S.push(deco(WIDTH / 2 - H * 0.7 * (i / n), (i * H) / n, H * 1.4 * (i / n), 2, 'rect', '#ffffff')); return done(H); }
    case 'pyramidList': { const H = 200; S.push(deco(0, 0, H * 1.2, H, 'triangle', color)); items.forEach((t, i) => S.push(box(H * 0.5, 20 + i * ((H - 30) / n), WIDTH - H * 0.5, (H - 30) / n - 6, t, '#ffffff', 'rect', '#222', 10))); return done(H); }
    case 'list': { const h = 34; items.forEach((t, i) => S.push(box(0, i * (h + 6), WIDTH, h, t, tint(i), 'rect'))); return done(n * (h + 6)); }
    case 'pyramid': { const h = 38; items.forEach((t, i) => { const w = WIDTH * ((i + 1) / n) * 0.9 + WIDTH * 0.1; S.push(box((WIDTH - w) / 2, i * (h + 3), w, h, t, tint(i), 'rect')); }); return done(n * (h + 3)); }
    default: {
      const gap = 22; const w = (WIDTH - gap * (n - 1)) / n; const h = 64;
      items.forEach((t, i) => { S.push(box(i * (w + gap), 0, w, h, t, tint(i))); if (i < n - 1) S.push(deco(i * (w + gap) + w + 3, h / 2 - 9, gap - 6, 18, 'rightArrow', shade(color, 0.5))); });
      return done(h);
    }
  }
};

const emu = (v: number): number => Math.round(v * 12700);
const hex = (c: string): { rgb: string; alpha?: number } => ({ rgb: c.slice(1, 7).toUpperCase(), alpha: c.length === 9 ? parseInt(c.slice(7), 16) / 255 : undefined });
const fillXml = (c?: string): string => {
  if (!c || c === 'transparent') return '<a:noFill/>';
  const { rgb, alpha } = hex(c);
  return `<a:solidFill><a:srgbClr val="${rgb}">${alpha !== undefined ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : ''}</a:srgbClr></a:solidFill>`;
};

const shapeXml = (s: DiagramShape): string => {
  const text = s.text ? `<wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="${(s.color ?? '#000000').slice(1).toUpperCase()}"/><w:sz w:val="${(s.size ?? 11) * 2}"/></w:rPr><w:t>${escapeText(s.text)}</w:t></w:r></w:p></w:txbxContent></wps:txbx>` : '';
  return `<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="${emu(s.x)}" y="${emu(s.y)}"/><a:ext cx="${emu(s.w)}" cy="${emu(s.h)}"/></a:xfrm><a:prstGeom prst="${escapeAttr(s.prst)}"><a:avLst/></a:prstGeom>${fillXml(s.fill)}<a:ln><a:noFill/></a:ln></wps:spPr>${text}<wps:bodyPr anchor="ctr" lIns="36000" rIns="36000" tIns="18000" bIns="18000"/></wps:wsp>`;
};

export const diagramAtom = (kind: string, text: string, color: string): RawAtom => {
  const { shapes, width, height } = buildDiagram(kind, text, color);
  const cx = emu(width); const cy = emu(height);
  const id = 100000 + Math.floor(Math.random() * 800000);
  const group = `<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm></wpg:grpSpPr>${shapes.map(shapeXml).join('')}</wpg:wgp>`;
  const xml = `<mc:AlternateContent><mc:Choice Requires="wpg"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Diagram ${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="${NS['wpg']}">${group}</a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice></mc:AlternateContent>`;
  return { kind: 'raw', xml, label: 'Diagram', width, height, shapes };
};
