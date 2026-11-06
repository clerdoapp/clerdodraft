import type { DiagramShape, RawAtom } from '../core/model';
import { NS, escapeAttr, escapeText } from '../docx/xml';

export const DIAGRAM_KINDS: [string, string][] = [['process', 'Process'], ['cycle', 'Cycle'], ['hierarchy', 'Hierarchy'], ['list', 'List'], ['pyramid', 'Pyramid'], ['overlap', 'Overlap']];

const WIDTH = 440;

const box = (x: number, y: number, w: number, h: number, text: string, fill: string, prst = 'roundRect'): DiagramShape => ({ x, y, w, h, prst, fill, text, color: '#ffffff', size: 11 });
const arrow = (x: number, y: number, w: number, h: number, prst: string, fill: string): DiagramShape => ({ x, y, w, h, prst, fill: `${fill}66` });

// Items may be indented with two spaces; a hierarchy uses that to find each item's parent.
export const buildDiagram = (kind: string, text: string, color: string): { shapes: DiagramShape[]; width: number; height: number } => {
  const lines = text.split('\n').filter((l) => l.trim());
  const items = lines.map((l) => l.trim());
  const n = Math.max(1, items.length);
  const shapes: DiagramShape[] = [];
  switch (kind) {
    case 'cycle': {
      const size = 260; const r = 96; const bw = 96; const bh = 44; const c = size / 2;
      items.forEach((t, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        shapes.push(box(WIDTH / 2 + Math.cos(a) * r * 1.4 - bw / 2, c + Math.sin(a) * r - bh / 2, bw, bh, t, color));
        const m = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
        shapes.push({ x: WIDTH / 2 + Math.cos(m) * r * 1.4 - 7, y: c + Math.sin(m) * r - 7, w: 14, h: 14, prst: 'ellipse', fill: `${color}66` });
      });
      return { shapes, width: WIDTH, height: size };
    }
    case 'hierarchy': {
      const level = lines.map((l) => Math.floor((/^\s*/.exec(l)?.[0].length ?? 0) / 2));
      const depth = Math.max(...level, 0) + 1;
      const rowH = 64; const bh = 40;
      for (let d = 0; d < depth; d++) {
        const row = items.filter((_, i) => level[i] === d);
        const w = Math.min(130, (WIDTH - 8 * (row.length - 1)) / row.length);
        const total = row.length * w + (row.length - 1) * 8;
        row.forEach((t, i) => shapes.push(box((WIDTH - total) / 2 + i * (w + 8), d * rowH, w, bh, t, color)));
        if (d < depth - 1) shapes.push(arrow(WIDTH / 2 - 8, d * rowH + bh + 2, 16, rowH - bh - 4, 'downArrow', color));
      }
      return { shapes, width: WIDTH, height: depth * rowH };
    }
    case 'list': {
      const h = 34;
      items.forEach((t, i) => shapes.push(box(0, i * (h + 6), WIDTH, h, t, color, 'rect')));
      return { shapes, width: WIDTH, height: n * (h + 6) };
    }
    case 'pyramid': {
      const h = 38;
      items.forEach((t, i) => { const w = WIDTH * ((i + 1) / n) * 0.9 + WIDTH * 0.1; shapes.push(box((WIDTH - w) / 2, i * (h + 3), w, h, t, color, 'rect')); });
      return { shapes, width: WIDTH, height: n * (h + 3) };
    }
    case 'overlap': {
      const d = 150; const step = Math.min(100, (WIDTH - d) / Math.max(1, n - 1));
      items.forEach((t, i) => shapes.push({ x: i * step, y: 0, w: d, h: d, prst: 'ellipse', fill: `${color}88`, text: t, color: '#ffffff', size: 11 }));
      return { shapes, width: d + (n - 1) * step, height: d };
    }
    default: {
      const gap = 22; const w = (WIDTH - gap * (n - 1)) / n; const h = 64;
      items.forEach((t, i) => {
        shapes.push(box(i * (w + gap), 0, w, h, t, color));
        if (i < n - 1) shapes.push(arrow(i * (w + gap) + w + 3, h / 2 - 9, gap - 6, 18, 'rightArrow', color));
      });
      return { shapes, width: WIDTH, height: h };
    }
  }
};

const emu = (v: number): number => Math.round(v * 12700);
const hex = (c: string): { rgb: string; alpha?: number } => ({ rgb: c.slice(1, 7).toUpperCase(), alpha: c.length === 9 ? parseInt(c.slice(7), 16) / 255 : undefined });
const fillXml = (c?: string): string => {
  if (!c) return '<a:noFill/>';
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
