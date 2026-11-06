import { symbolChar } from '../core/fonts';
import { strFromU8, unzipSync } from 'fflate';
import { defaultStyles } from '../core/defaults';
import {
  ATOM_CHAR, defaultSection, newId,
  type AbstractNumbering, type Atom, type Block, type BorderLine, type Bookmark, type CellProps, type Comment, type DiagramShape, type Doc, type FloatPlacement, type MediaItem, type Note, type NumberingLevel, type Paragraph, type ParaBorders, type ParaProps, type RawBlock, type Revision, type Run, type RunProps, type Section, type Style, type Styles, type TabStop, type Source, type Table, type TableBorders, type TableCell, type TableProps, type TableRow, type Theme, type UnderlineKind, type WrapKind,
} from '../core/model';
import { normalizeRuns } from '../core/tree';
import { find, kid, kids, parseXml, serialize, textOf, type XNode } from './xml';
import { drawingColor, parseChart, parseDiagram, parseGroup } from './charts';

const MAX_INFLATED = 512 * 1024 * 1024;

const HIGHLIGHT: Record<string, string> = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };

const num = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
};
const tw = (s: string | undefined): number | undefined => { const v = num(s); return v === undefined ? undefined : v / 20; };
const emu = (s: string | undefined): number => (num(s) ?? 0) / 12700;
const on = (n: XNode | undefined): boolean | undefined => {
  if (!n) return undefined;
  const v = n.attrs['w:val'];
  return v === undefined ? true : !(v === '0' || v === 'false' || v === 'off');
};
const hex = (s: string | undefined): string | undefined => (s && /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : undefined);

interface Rel { id: string; type: string; target: string; external?: boolean }

interface Ctx {
  files: Record<string, Uint8Array>;
  theme: Theme;
  media: Record<string, MediaItem>;
  rels: Map<string, Rel>; // of the current part
  partDir: string;
  openComments: Set<string>;
  paraIds: Map<string, string>; // w14:paraId of comment paragraphs
  boxes: Record<string, Block[]>;
  diagrams: { next: number };
  commentId?: string;
}

const resolvePath = (dir: string, target: string): string => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${dir}/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
};

const readRels = (files: Record<string, Uint8Array>, part: string): Rel[] => {
  const dir = part.includes('/') ? part.slice(0, part.lastIndexOf('/')) : '';
  const name = part.slice(part.lastIndexOf('/') + 1);
  const data = files[`${dir ? `${dir}/` : ''}_rels/${name}.rels`];
  if (!data) return [];
  return kids(parseXml(strFromU8(data))).map((r) => ({ id: r.attrs['Id'] ?? '', type: r.attrs['Type'] ?? '', target: r.attrs['Target'] ?? '', external: r.attrs['TargetMode'] === 'External' }));
};

const relOfType = (rels: Rel[], suffix: string): Rel | undefined => rels.find((r) => r.type.endsWith(`/${suffix}`));

const parseTheme = (files: Record<string, Uint8Array>, path: string | undefined): Theme => {
  if (!path || !files[path]) return {};
  const x = parseXml(strFromU8(files[path]!));
  const scheme = find(x, 'a:fontScheme');
  const colors: Record<string, string> = {};
  for (const c of kids(find(x, 'a:clrScheme'))) {
    const v = kid(c, 'a:srgbClr')?.attrs['val'] ?? kid(c, 'a:sysClr')?.attrs['lastClr'];
    if (v) colors[c.name.slice(2)] = `#${v.toLowerCase()}`;
  }
  const major = kid(scheme, 'a:majorFont');
  const minor = kid(scheme, 'a:minorFont');
  return {
    majorFont: kid(major, 'a:latin')?.attrs['typeface'],
    minorFont: kid(minor, 'a:latin')?.attrs['typeface'],
    majorFontCs: kid(major, 'a:cs')?.attrs['typeface'] || undefined,
    minorFontCs: kid(minor, 'a:cs')?.attrs['typeface'] || undefined,
    colors,
  };
};

const THEME_COLOR: Record<string, string> = { text1: 'dk1', text2: 'dk2', background1: 'lt1', background2: 'lt2', dark1: 'dk1', dark2: 'dk2', light1: 'lt1', light2: 'lt2' };

const colorOf = (n: XNode | undefined, theme: Theme): string | undefined => {
  if (!n) return undefined;
  const direct = hex(n.attrs['w:val']);
  if (direct) return direct;
  const t = n.attrs['w:themeColor'];
  return t ? theme.colors?.[THEME_COLOR[t] ?? t] : undefined;
};

const border = (n: XNode | undefined, theme: Theme): BorderLine | undefined => {
  if (!n) return undefined;
  const style = n.attrs['w:val'] ?? 'single';
  const sz = num(n.attrs['w:sz']);
  return {
    style,
    width: sz === undefined ? 0.5 : sz / 8,
    color: hex(n.attrs['w:color']) ?? (n.attrs['w:themeColor'] ? theme.colors?.[THEME_COLOR[n.attrs['w:themeColor']!] ?? n.attrs['w:themeColor']!] : undefined),
    space: num(n.attrs['w:space']),
  };
};

const shadeOf = (n: XNode | undefined, theme: Theme): string | undefined => {
  if (!n) return undefined;
  const f = n.attrs['w:fill'];
  if (f && f !== 'auto') return hex(f);
  const t = n.attrs['w:themeFill'];
  return t ? theme.colors?.[THEME_COLOR[t] ?? t] : undefined;
};

const fontOf = (n: XNode | undefined, theme: Theme, cs = false): string | undefined => {
  if (!n) return undefined;
  const keys = cs ? ['w:cs'] : ['w:ascii', 'w:hAnsi'];
  for (const k of keys) if (n.attrs[k]) return n.attrs[k];
  const t = cs ? n.attrs['w:cstheme'] : (n.attrs['w:asciiTheme'] ?? n.attrs['w:hAnsiTheme']);
  if (!t) return undefined;
  if (t.startsWith('major')) return cs ? theme.majorFontCs : theme.majorFont;
  if (t.startsWith('minor')) return cs ? theme.minorFontCs : theme.minorFont;
  return undefined;
};

const UNDER: Record<string, UnderlineKind | 'none'> = { single: 'single', double: 'double', thick: 'thick', dotted: 'dotted', dottedHeavy: 'dotted', dash: 'dashed', dashedHeavy: 'dashed', dashLong: 'dashed', dotDash: 'dashed', dotDotDash: 'dashed', wave: 'wave', wavyHeavy: 'wave', wavyDouble: 'wave', words: 'words', none: 'none' };

export const parseRPr = (n: XNode | undefined, theme: Theme): RunProps => {
  const p: RunProps = {};
  if (!n) return p;
  for (const c of kids(n)) {
    const a = c.attrs;
    switch (c.name) {
      case 'w:rStyle': p.charStyle = a['w:val']; break;
      case 'w:rFonts': { const f = fontOf(c, theme); if (f) p.font = f; const cs = fontOf(c, theme, true); if (cs) p.fontCs = cs; break; }
      case 'w:b': p.bold = on(c); break;
      case 'w:i': p.italic = on(c); break;
      case 'w:caps': p.caps = on(c); break;
      case 'w:smallCaps': p.smallCaps = on(c); break;
      case 'w:strike': p.strike = on(c); break;
      case 'w:dstrike': p.doubleStrike = on(c); break;
      case 'w:outline': p.outline = on(c); break;
      case 'w:shadow': p.shadow = on(c); break;
      case 'w:emboss': p.emboss = on(c); break;
      case 'w:imprint': p.imprint = on(c); break;
      case 'w:vanish': p.hidden = on(c); break;
      case 'w:color': { const v = colorOf(c, theme); if (v) p.color = v; break; }
      case 'w:spacing': p.spacing = tw(a['w:val']); break;
      case 'w:w': p.scale = num(a['w:val']); break;
      case 'w:position': { const v = num(a['w:val']); if (v !== undefined) p.position = v / 2; break; }
      case 'w:sz': { const v = num(a['w:val']); if (v) p.size = v / 2; break; }
      case 'w:highlight': { const v = HIGHLIGHT[a['w:val'] ?? '']; if (v) p.highlight = v; break; }
      case 'w:u': { p.underline = UNDER[a['w:val'] ?? 'single'] ?? 'single'; const col = hex(a['w:color']); if (col) p.underlineColor = col; break; }
      case 'w:bdr': p.border = border(c, theme); break;
      case 'w:shd': { const v = shadeOf(c, theme); if (v) p.shading = v; break; }
      case 'w:vertAlign': if (a['w:val'] === 'superscript') p.vertAlign = 'super'; else if (a['w:val'] === 'subscript') p.vertAlign = 'sub'; break;
      case 'w:rtl': p.rtl = on(c); break;
      case 'w:lang': if (a['w:val']) p.lang = a['w:val']; break;
      case 'w14:glow': { const col = find(c, 'w14:srgbClr')?.attrs['w14:val']; p.glow = { color: col ? `#${col.toLowerCase()}` : '#ffd43b', size: Number(a['w14:rad'] ?? 0) / 12700 || 6 }; break; }
      case 'w14:reflection': p.reflect = true; break;
      case 'w14:textOutline': { const col = find(c, 'w14:srgbClr')?.attrs['w14:val']; if (col) p.lineColor = `#${col.toLowerCase()}`; break; }
      case 'w14:textFill': { const stops = kids(find(c, 'w14:gsLst'), 'w14:gs').map((g) => find(g, 'w14:srgbClr')?.attrs['w14:val']).filter(Boolean) as string[]; if (stops.length >= 2) p.gradient = [`#${stops[0]!.toLowerCase()}`, `#${stops[stops.length - 1]!.toLowerCase()}`]; break; }
    }
  }
  return p;
};

const parseBorders = (n: XNode | undefined, theme: Theme): ParaBorders | undefined => {
  if (!n) return undefined;
  const b: ParaBorders = {};
  for (const k of ['top', 'bottom', 'left', 'right', 'between'] as const) {
    const v = border(kid(n, `w:${k}`), theme);
    if (v) b[k] = v;
  }
  return b;
};

const TAB: Record<string, TabStop['kind']> = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', decimal: 'decimal', bar: 'bar', clear: 'clear', num: 'left' };

export const parsePPr = (n: XNode | undefined, theme: Theme): ParaProps => {
  const p: ParaProps = {};
  if (!n) return p;
  for (const c of kids(n)) {
    const a = c.attrs;
    switch (c.name) {
      case 'w:pStyle': p.style = a['w:val']; break;
      case 'w:keepNext': p.keepNext = on(c); break;
      case 'w:keepLines': p.keepLines = on(c); break;
      case 'w:pageBreakBefore': p.pageBreakBefore = on(c); break;
      case 'w:widowControl': p.widowControl = on(c); break;
      case 'w:numPr': { const id = kid(c, 'w:numId')?.attrs['w:val']; if (id !== undefined) p.numbering = { numId: id, level: num(kid(c, 'w:ilvl')?.attrs['w:val']) ?? 0 }; break; }
      case 'w:suppressLineNumbers': p.suppressLineNumbers = on(c); break;
      case 'w:pBdr': p.borders = parseBorders(c, theme); break;
      case 'w:shd': { const v = shadeOf(c, theme); if (v) p.shading = v; break; }
      case 'w:tabs': p.tabs = kids(c, 'w:tab').map((t) => ({ pos: tw(t.attrs['w:pos']) ?? 0, kind: TAB[t.attrs['w:val'] ?? 'left'] ?? 'left', leader: (t.attrs['w:leader'] as TabStop['leader']) ?? 'none' })); break;
      case 'w:suppressAutoHyphens': p.suppressHyphenation = on(c); break;
      case 'w:framePr': if (c.attrs['w:dropCap'] === 'drop' || c.attrs['w:dropCap'] === 'margin') p.dropCap = { kind: c.attrs['w:dropCap'], lines: Number(c.attrs['w:lines'] ?? 3) }; break;
      case 'w:bidi': p.bidi = on(c); break;
      case 'w:spacing': {
        const before = tw(a['w:before']);
        const after = tw(a['w:after']);
        if (before !== undefined) p.spaceBefore = before;
        if (after !== undefined) p.spaceAfter = after;
        const line = num(a['w:line']);
        if (line !== undefined) {
          const rule = a['w:lineRule'] ?? 'auto';
          p.lineSpacing = rule === 'auto' ? { rule: 'auto', value: line / 240 } : { rule: rule === 'exact' ? 'exact' : 'atLeast', value: line / 20 };
        }
        break;
      }
      case 'w:ind': {
        const l = tw(a['w:left'] ?? a['w:start']);
        const r = tw(a['w:right'] ?? a['w:end']);
        if (l !== undefined) p.indentLeft = l;
        if (r !== undefined) p.indentRight = r;
        const hang = tw(a['w:hanging']);
        const first = tw(a['w:firstLine']);
        if (hang !== undefined) p.firstLine = -hang;
        else if (first !== undefined) p.firstLine = first;
        break;
      }
      case 'w:contextualSpacing': p.contextualSpacing = on(c); break;
      case 'w:jc': {
        const v = a['w:val'];
        p.align = v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'both' ? 'justify' : v === 'distribute' ? 'distribute' : 'left';
        break;
      }
      case 'w:outlineLvl': p.outlineLevel = num(a['w:val']); break;
    }
  }
  return p;
};

const parseSection = (n: XNode | undefined, theme: Theme): Section => {
  const s = defaultSection();
  s.columns = { count: 1, space: 36 };
  if (!n) return s;
  const hf = (name: string, out: Section['headers']) => {
    for (const r of kids(n, name)) {
      const t = (r.attrs['w:type'] ?? 'default') as 'default' | 'first' | 'even';
      const id = r.attrs['r:id'];
      if (id) out[t] = id;
    }
  };
  s.headers = {};
  s.footers = {};
  hf('w:headerReference', s.headers);
  hf('w:footerReference', s.footers);
  const sz = kid(n, 'w:pgSz');
  if (sz) {
    s.pageWidth = tw(sz.attrs['w:w']) ?? s.pageWidth;
    s.pageHeight = tw(sz.attrs['w:h']) ?? s.pageHeight;
    s.landscape = sz.attrs['w:orient'] === 'landscape' || undefined;
  }
  const m = kid(n, 'w:pgMar');
  if (m) {
    const a = m.attrs;
    s.marginTop = Math.abs(tw(a['w:top']) ?? 72);
    s.marginBottom = Math.abs(tw(a['w:bottom']) ?? 72);
    s.marginLeft = tw(a['w:left']) ?? 72;
    s.marginRight = tw(a['w:right']) ?? 72;
    s.gutter = tw(a['w:gutter']) || undefined;
    s.headerDistance = tw(a['w:header']) ?? 36;
    s.footerDistance = tw(a['w:footer']) ?? 36;
  }
  const c = kid(n, 'w:cols');
  if (c) {
    const list = kids(c, 'w:col');
    s.columns = {
      count: num(c.attrs['w:num']) ?? (list.length || 1),
      space: tw(c.attrs['w:space']) ?? 36,
      separator: on(c.attrs['w:sep'] !== undefined ? { name: '', attrs: { 'w:val': c.attrs['w:sep'] }, children: [] } : undefined),
      widths: list.length && c.attrs['w:equalWidth'] !== '1' ? list.map((k) => ({ w: tw(k.attrs['w:w']) ?? 0, space: tw(k.attrs['w:space']) ?? 0 })) : undefined,
    };
  }
  const t = kid(n, 'w:type')?.attrs['w:val'];
  if (t) s.breakType = t as Section['breakType'];
  if (kid(n, 'w:titlePg') && on(kid(n, 'w:titlePg'))) s.titlePage = true;
  const pn = kid(n, 'w:pgNumType');
  if (pn) s.pageNumbers = { start: num(pn.attrs['w:start']), format: pn.attrs['w:fmt'] };
  const ln = kid(n, 'w:lnNumType');
  if (ln) s.lineNumbers = { countBy: num(ln.attrs['w:countBy']) ?? 1, start: num(ln.attrs['w:start']), distance: tw(ln.attrs['w:distance']), restart: ln.attrs['w:restart'] };
  const pb = kid(n, 'w:pgBorders');
  if (pb) s.pageBorders = parseBorders(pb, theme);
  const va = kid(n, 'w:vAlign')?.attrs['w:val'];
  if (va) s.vAlign = va as Section['vAlign'];
  if (on(kid(n, 'w:bidi'))) s.bidi = true;
  return s;
};

const revision = (n: XNode): Revision => ({ id: n.attrs['w:id'] ?? newId(), author: n.attrs['w:author'] ?? '', date: n.attrs['w:date'] ?? '' });

const fieldKind = (instr: string): import('../core/model').FieldKind => {
  const w = instr.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  const map: Record<string, import('../core/model').FieldKind> = { PAGE: 'page', NUMPAGES: 'numpages', DATE: 'date', CREATEDATE: 'date', SAVEDATE: 'date', PRINTDATE: 'date', TIME: 'time', AUTHOR: 'author', TITLE: 'title', SECTION: 'section', SEQ: 'seq', REF: 'ref', PAGEREF: 'ref', MERGEFIELD: 'merge' };
  return map[w] ?? 'other';
};

const wrapOf = (anchor: XNode): WrapKind => {
  if (kid(anchor, 'wp:wrapSquare')) return 'square';
  if (kid(anchor, 'wp:wrapTight')) return 'tight';
  if (kid(anchor, 'wp:wrapThrough')) return 'through';
  if (kid(anchor, 'wp:wrapTopAndBottom')) return 'topBottom';
  return anchor.attrs['behindDoc'] === '1' ? 'behind' : 'front';
};

const placementOf = (a: XNode): FloatPlacement => {
  const h = kid(a, 'wp:positionH');
  const v = kid(a, 'wp:positionV');
  const rh = h?.attrs['relativeFrom'] ?? 'column';
  const rv = v?.attrs['relativeFrom'] ?? 'paragraph';
  const dist = (k: string) => (a.attrs[k] !== undefined ? emu(a.attrs[k]) : undefined);
  return {
    relH: rh === 'page' ? 'page' : rh === 'margin' ? 'margin' : rh === 'character' ? 'character' : 'column',
    relV: rv === 'page' ? 'page' : rv === 'margin' ? 'margin' : rv === 'line' ? 'line' : 'paragraph',
    x: emu(textOf(kid(h, 'wp:posOffset'))),
    y: emu(textOf(kid(v, 'wp:posOffset'))),
    alignH: (textOf(kid(h, 'wp:align')) as FloatPlacement['alignH']) || undefined,
    alignV: (textOf(kid(v, 'wp:align')) as FloatPlacement['alignV']) || undefined,
    distL: dist('distL'), distR: dist('distR'), distT: dist('distT'), distB: dist('distB'),
  };
};

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' };

const parseDrawing = (n: XNode, ctx: Ctx): Atom => {
  const box = kid(n, 'wp:inline') ?? kid(n, 'wp:anchor');
  const ext = kid(box, 'wp:extent');
  const width = emu(ext?.attrs['cx']);
  const height = emu(ext?.attrs['cy']);
  const docPr = kid(box, 'wp:docPr');
  const blip = find(box, 'a:blip');
  const rel = blip ? ctx.rels.get(blip.attrs['r:embed'] ?? '') : undefined;
  const floating = box?.name === 'wp:anchor';
  if (rel && !rel.external) {
    const path = resolvePath(ctx.partDir, rel.target);
    const data = ctx.files[path];
    if (data) {
      if (!ctx.media[path]) ctx.media[path] = { mime: MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', data, name: path.split('/').pop() };
      const rot = num(find(box, 'a:xfrm')?.attrs['rot']);
      const rect = find(box, 'a:srcRect')?.attrs;
      const lum = kid(blip, 'a:lum')?.attrs;
      const crop = rect && (rect['l'] || rect['t'] || rect['r'] || rect['b']) ? { l: Number(rect['l'] ?? 0) / 1000, t: Number(rect['t'] ?? 0) / 1000, r: Number(rect['r'] ?? 0) / 1000, b: Number(rect['b'] ?? 0) / 1000 } : undefined;
      return { kind: 'image', media: path, width, height, alt: docPr?.attrs['descr'], wrap: floating ? wrapOf(box!) : 'inline', float: floating ? placementOf(box!) : undefined, rotation: rot ? rot / 60000 : undefined, crop, bright: lum?.['bright'] ? Number(lum['bright']) / 1000 : undefined, contrast: lum?.['contrast'] ? Number(lum['contrast']) / 1000 : undefined, gray: kid(blip, 'a:grayscl') ? true : undefined };
    }
  }
  const placed = { width, height, wrap: floating ? wrapOf(box!) : ('inline' as WrapKind), float: floating ? placementOf(box!) : undefined };
  const chartRef = find(box, 'c:chart');
  if (chartRef) {
    const target = ctx.rels.get(chartRef.attrs['r:id'] ?? '');
    const data = target && !target.external ? ctx.files[resolvePath(ctx.partDir, target.target)] : undefined;
    const parsed = data ? parseChart(parseXml(strFromU8(data)), ctx.theme) : null;
    if (parsed) return { kind: 'chart', ...parsed, ...placed, alt: docPr?.attrs['descr'], xml: serialize(n) };
  }
  const wsp = find(box, 'wps:wsp');
  if (wsp && !find(box, 'wpg:wgp')) {
    const sp = kid(wsp, 'wps:spPr');
    const style = kid(wsp, 'wps:style');
    const ln = kid(sp, 'a:ln');
    const fill = kid(sp, 'a:noFill') ? undefined : (drawingColor(kid(sp, 'a:solidFill'), ctx.theme) ?? drawingColor(kid(style, 'a:fillRef'), ctx.theme));
    const stroke = kid(ln, 'a:noFill') ? undefined : (drawingColor(kid(ln, 'a:solidFill'), ctx.theme) ?? drawingColor(kid(style, 'a:lnRef'), ctx.theme));
    const content = kid(kid(wsp, 'wps:txbx'), 'w:txbxContent');
    let textId: string | undefined;
    if (content) {
      textId = newId();
      const blocks = parseBlocks(kids(content), { ctx, toc: 0 });
      ctx.boxes[textId] = blocks.some((b) => b.type === 'p') ? blocks : [{ type: 'p', id: newId(), props: {}, runs: [] }];
    }
    return { kind: 'shape', shape: kid(sp, 'a:prstGeom')?.attrs['prst'] ?? 'rect', fill, stroke, strokeWidth: ln?.attrs['w'] ? emu(ln.attrs['w']) : undefined, textId, ...placed, xml: serialize(n) };
  }
  let shapes: DiagramShape[] | undefined;
  if (find(box, 'dgm:relIds')) {
    const parts = [...ctx.rels.values()].filter((r) => r.type.endsWith('/diagramDrawing'));
    const part = parts[ctx.diagrams.next++];
    const data = part ? ctx.files[resolvePath(ctx.partDir, part.target)] : undefined;
    if (data) shapes = parseDiagram(parseXml(strFromU8(data)), ctx.theme);
  }
  const grouped = find(box, 'wpg:wgp');
  if (grouped) shapes = parseGroup(grouped, ctx.theme);
  // A floating group becomes a shape so it can be placed on the page like other drawings.
  if (grouped && floating && shapes?.length) return { kind: 'shape', shape: 'rect', group: shapes, ...placed, xml: serialize(n) };
  const label = chartRef ? 'Chart' : find(box, 'dgm:relIds') || grouped ? 'Diagram' : 'Graphic';
  return shapes?.length || !floating ? { kind: 'raw', xml: serialize(n), label, width, height, shapes } : { kind: 'raw', xml: serialize(n), label };
};

const PROG_NAMES: [RegExp, string][] = [[/^Excel/i, 'Spreadsheet'], [/^Word/i, 'Document'], [/^PowerPoint/i, 'Presentation'], [/^AcroExch|PDF/i, 'PDF'], [/^Package/i, 'File'], [/^Equation/i, 'Equation'], [/^Visio/i, 'Drawing']];

// Embedded files keep their original markup; the picture and the file itself are also read so they can be shown and opened.
const parseObject = (n: XNode, ctx: Ctx): Atom => {
  const ole = find(n, 'o:OLEObject');
  const shape = find(n, 'v:shape');
  const style = shape?.attrs['style'] ?? '';
  const size = (k: string) => { const m = new RegExp(`${k}:\\s*([\\d.]+)(pt|in|px)?`).exec(style); return m ? Number(m[1]) * (m[2] === 'in' ? 72 : m[2] === 'px' ? 0.75 : 1) : undefined; };
  const progId = ole?.attrs['ProgID'];
  const grab = (rid?: string): string | undefined => {
    const rel = rid ? ctx.rels.get(rid) : undefined;
    if (!rel || rel.external) return undefined;
    const path = resolvePath(ctx.partDir, rel.target);
    const data = ctx.files[path];
    if (!data) return undefined;
    if (!ctx.media[path]) ctx.media[path] = { mime: MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', data, name: path.split('/').pop() };
    return path;
  };
  const file = grab(ole?.attrs['r:id']);
  const preview = grab(find(n, 'v:imagedata')?.attrs['r:id']);
  const kind = PROG_NAMES.find(([r]) => r.test(progId ?? ''))?.[1] ?? 'Object';
  return { kind: 'raw', xml: serialize(n), label: kind, width: size('width') ?? 96, height: size('height') ?? 64, object: { name: kind, progId, file, preview } };
};

const ommlText = (n: XNode): string => {
  const group = (x: XNode | undefined): string => {
    const t = kids(x).map(node).join('');
    return /^[\p{L}\p{N}]$/u.test(t) ? t : `(${t})`;
  };
  const node = (x: XNode): string => {
    switch (x.name) {
      case 'm:t': return textOf(x);
      case 'm:f': return `${group(kid(x, 'm:num'))}/${group(kid(x, 'm:den'))}`;
      case 'm:sSup': return `${group(kid(x, 'm:e'))}^${group(kid(x, 'm:sup'))}`;
      case 'm:sSub': return `${group(kid(x, 'm:e'))}_${group(kid(x, 'm:sub'))}`;
      case 'm:sSubSup': return `${group(kid(x, 'm:e'))}_${group(kid(x, 'm:sub'))}^${group(kid(x, 'm:sup'))}`;
      case 'm:rad': return `sqrt${group(kid(x, 'm:e'))}`;
      case 'm:nary': {
        const op = kid(kid(x, 'm:naryPr'), 'm:chr')?.attrs['m:val'] ?? '∫';
        const sub = kids(kid(x, 'm:sub')).length ? `_${group(kid(x, 'm:sub'))}` : '';
        const sup = kids(kid(x, 'm:sup')).length ? `^${group(kid(x, 'm:sup'))}` : '';
        return `${op}${sub}${sup} ${kids(kid(x, 'm:e')).map(node).join('')}`;
      }
      case 'm:d': {
        const pr = kid(x, 'm:dPr');
        return `${kid(pr, 'm:begChr')?.attrs['m:val'] ?? '('}${kids(x, 'm:e').map((e) => kids(e).map(node).join('')).join(', ')}${kid(pr, 'm:endChr')?.attrs['m:val'] ?? ')'}`;
      }
      case 'm:rPr': case 'm:ctrlPr': case 'w:rPr': case 'm:naryPr': case 'm:dPr': case 'm:fPr': case 'm:sSupPr': case 'm:sSubPr': case 'm:sSubSupPr': case 'm:radPr': return '';
      default: return kids(x).map(node).join('');
    }
  };
  return kids(n).map(node).join('');
};

interface Inline {
  props?: RunProps;
  link?: Run['link'];
  ins?: Revision;
  del?: Revision;
}

interface FieldFrame {
  instr: string;
  result: Run[];
  phase: 'instr' | 'result';
  locked?: boolean;
  props: RunProps;
}

interface ParaState {
  runs: Run[];
  offset: number;
  bookmarks: Bookmark[];
  openMarks: Map<string, Bookmark>;
  fields: FieldFrame[];
  doc: DocState;
}

interface DocState {
  ctx: Ctx;
  toc: number; // depth of table-of-contents field spanning paragraphs
  perm?: boolean; // inside a range that stays editable when the document is protected
}

const push = (st: ParaState, run: Run): void => {
  const f = st.fields[st.fields.length - 1];
  if (f) {
    if (f.phase === 'result') f.result.push(run);
    return;
  }
  const comments = [...st.doc.ctx.openComments];
  if (comments.length) run.comments = comments;
  st.runs.push(run);
  st.offset += run.text.length;
};

const addAtom = (st: ParaState, atom: Atom, props: RunProps, inl: Inline): void =>
  push(st, { text: ATOM_CHAR, props, atom, ...meta(inl) });

const meta = (i: Inline): Partial<Run> => ({ ...(i.link ? { link: i.link } : {}), ...(i.ins ? { ins: i.ins } : {}), ...(i.del ? { del: i.del } : {}) });

const parseRun = (r: XNode, st: ParaState, inl: Inline): void => {
  const ctx = st.doc.ctx;
  const props = parseRPr(kid(r, 'w:rPr'), ctx.theme);
  const change = kid(kid(r, 'w:rPr'), 'w:rPrChange');
  const fmtRev = change ? { rev: revision(change), old: parseRPr(kid(change, 'w:rPr'), ctx.theme) } : undefined;
  const text = (t: string) => { if (t) push(st, { text: t, props, ...meta(inl), ...(fmtRev ? { fmtRev } : {}) }); };
  for (const c of kids(r)) {
    switch (c.name) {
      case 'w:rPr': break;
      case 'w:t': case 'w:delText': text(textOf(c)); break;
      case 'w:instrText': case 'w:delInstrText': {
        const f = st.fields[st.fields.length - 1];
        if (f && f.phase === 'instr') f.instr += textOf(c);
        break;
      }
      case 'w:tab': case 'w:ptab': text('\t'); break;
      case 'w:cr': text('\n'); break;
      case 'w:br': {
        const t = c.attrs['w:type'];
        text(t === 'page' ? '\f' : t === 'column' ? '\v' : '\n');
        break;
      }
      case 'w:noBreakHyphen': text('‑'); break;
      case 'w:softHyphen': text('­'); break;
      case 'w:fldChar': {
        const t = c.attrs['w:fldCharType'];
        if (t === 'begin') st.fields.push({ instr: '', result: [], phase: 'instr', locked: on(c.attrs['w:fldLock'] ? { name: '', attrs: { 'w:val': c.attrs['w:fldLock'] }, children: [] } : undefined), props });
        else if (t === 'separate') {
          const f = st.fields[st.fields.length - 1];
          if (f) {
            f.phase = 'result';
            if (/^\s*TOC\b/i.test(f.instr)) { st.fields.pop(); st.doc.toc++; }
          }
        } else if (t === 'end') {
          const f = st.fields.pop();
          if (!f) { if (st.doc.toc > 0) st.doc.toc--; break; }
          const result = f.result.filter((x) => !x.atom).map((x) => x.text).join('');
          addAtom(st, { kind: 'field', field: fieldKind(f.instr), instr: f.instr.trim(), result, locked: f.locked }, f.result[0]?.props ?? f.props, inl);
        }
        break;
      }
      case 'w:footnoteReference': addAtom(st, { kind: 'footnote', id: c.attrs['w:id'] ?? '' }, props, inl); break;
      case 'w:endnoteReference': addAtom(st, { kind: 'endnote', id: c.attrs['w:id'] ?? '' }, props, inl); break;
      case 'w:footnoteRef': case 'w:endnoteRef': case 'w:commentReference': case 'w:annotationRef': case 'w:lastRenderedPageBreak': break;
      case 'w:drawing': addAtom(st, parseDrawing(c, ctx), props, inl); break;
      case 'mc:AlternateContent': {
        const d = find(kid(c, 'mc:Choice'), 'w:drawing');
        addAtom(st, d ? { ...parseDrawing(d, ctx), ...(d ? { xml: serialize(c) } : {}) } as Atom : { kind: 'raw', xml: serialize(c), label: 'Graphic' }, props, inl);
        break;
      }
      case 'w:sym': {
        const code = parseInt(c.attrs['w:char'] ?? '', 16);
        const glyph = Number.isFinite(code) ? symbolChar(c.attrs['w:font'], String.fromCharCode(code)) : '';
        addAtom(st, { kind: 'raw', xml: serialize(c), label: 'Symbol', glyph: glyph && glyph.charCodeAt(0) < 0xe000 || glyph.charCodeAt(0) > 0xf8ff ? glyph : '•' }, props, inl);
        break;
      }
      case 'w:object': addAtom(st, parseObject(c, ctx), props, inl); break;
      default: addAtom(st, { kind: 'raw', xml: serialize(c), label: 'Object' }, props, inl);
    }
  }
};

const parseInline = (nodes: XNode[], st: ParaState, inl: Inline): void => {
  const ctx = st.doc.ctx;
  for (const c of nodes) {
    switch (c.name) {
      case 'w:r': parseRun(c, st, inl); break;
      case 'w:pPr': break;
      case 'w:hyperlink': {
        const rel = c.attrs['r:id'] ? ctx.rels.get(c.attrs['r:id']!) : undefined;
        const link: Run['link'] = { href: rel?.target, anchor: c.attrs['w:anchor'], tooltip: c.attrs['w:tooltip'] };
        parseInline(kids(c), st, { ...inl, link });
        break;
      }
      case 'w:ins': case 'w:moveTo': parseInline(kids(c), st, { ...inl, ins: revision(c) }); break;
      case 'w:del': case 'w:moveFrom': parseInline(kids(c), st, { ...inl, del: revision(c) }); break;
      case 'w:fldSimple': {
        const instr = c.attrs['w:instr'] ?? '';
        const r0 = find(c, 'w:r');
        const props = parseRPr(kid(r0, 'w:rPr'), ctx.theme);
        addAtom(st, { kind: 'field', field: fieldKind(instr), instr: instr.trim(), result: kids(c, 'w:r').map((r) => kids(r, 'w:t').map(textOf).join('')).join('') }, props, inl);
        break;
      }
      case 'w:bookmarkStart': {
        const name = c.attrs['w:name'];
        if (name) {
          const b: Bookmark = { name, start: st.offset, end: st.offset };
          st.openMarks.set(c.attrs['w:id'] ?? name, b);
          st.bookmarks.push(b);
        }
        break;
      }
      case 'w:bookmarkEnd': {
        const b = st.openMarks.get(c.attrs['w:id'] ?? '');
        if (b) { b.end = st.offset; st.openMarks.delete(c.attrs['w:id'] ?? ''); }
        break;
      }
      case 'w:commentRangeStart': ctx.openComments.add(c.attrs['w:id'] ?? ''); break;
      case 'w:commentRangeEnd': ctx.openComments.delete(c.attrs['w:id'] ?? ''); break;
      case 'w:sdt': {
        const check = find(kid(c, 'w:sdtPr'), 'w14:checkbox');
        if (check) {
          addAtom(st, { kind: 'checkbox', checked: kid(check, 'w14:checked')?.attrs['w14:val'] === '1' }, parseRPr(find(c, 'w:rPr'), ctx.theme), inl);
          break;
        }
        const pr = kid(c, 'w:sdtPr');
        const list = kid(pr, 'w:dropDownList') ?? kid(pr, 'w:comboBox');
        const content = textOf(kid(c, 'w:sdtContent'));
        if (list || kid(pr, 'w:date')) {
          addAtom(st, { kind: 'control', control: list ? 'dropdown' : 'date', title: kid(pr, 'w:alias')?.attrs['w:val'], value: content, options: list ? kids(list, 'w:listItem').map((o) => o.attrs['w:displayText'] ?? o.attrs['w:value'] ?? '') : undefined }, parseRPr(find(c, 'w:rPr'), ctx.theme), inl);
          break;
        }
        parseInline(kids(kid(c, 'w:sdtContent')), st, inl);
        break;
      }
      case 'w:smartTag': case 'w:customXml': case 'w:dir': case 'w:bdo': parseInline(kids(c), st, inl); break;
      case 'm:oMath': addAtom(st, { kind: 'equation', source: ommlText(c), omml: serialize(c) }, {}, inl); break;
      case 'm:oMathPara': for (const m of kids(c, 'm:oMath')) addAtom(st, { kind: 'equation', source: ommlText(m), omml: serialize(m), display: true }, {}, inl); break;
      case 'w:proofErr': case 'w:permStart': case 'w:permEnd': case 'w:moveFromRangeStart': case 'w:moveFromRangeEnd': case 'w:moveToRangeStart': case 'w:moveToRangeEnd': break;
      default: break;
    }
  }
};

const parseParagraph = (n: XNode, ds: DocState): Paragraph => {
  const ctx = ds.ctx;
  const pPr = kid(n, 'w:pPr');
  const st: ParaState = { runs: [], offset: 0, bookmarks: [], openMarks: new Map(), fields: [], doc: ds };
  const inToc = ds.toc > 0;
  parseInline(kids(n), st, {});
  // A field left open at the paragraph end still contributes its result text.
  for (const f of st.fields) for (const r of f.result) { st.runs.push(r); st.offset += r.text.length; }
  for (const b of st.openMarks.values()) b.end = st.offset;
  const mark = kid(pPr, 'w:rPr');
  const p: Paragraph = { type: 'p', id: newId(), props: parsePPr(pPr, ctx.theme), runs: normalizeRuns(st.runs) };
  if (mark) {
    const mp = parseRPr(mark, ctx.theme);
    if (Object.keys(mp).length) p.markProps = mp;
    const i = kid(mark, 'w:ins');
    const d = kid(mark, 'w:del');
    if (i) p.markIns = revision(i);
    if (d) p.markDel = revision(d);
  }
  if (st.bookmarks.length) p.bookmarks = st.bookmarks;
  const sect = kid(pPr, 'w:sectPr');
  if (sect) p.section = parseSection(sect, ctx.theme);
  if (inToc || ds.toc > 0) p.tocEntry = true;
  if (ctx.commentId !== undefined) {
    const pid = n.attrs['w14:paraId'];
    if (pid) ctx.paraIds.set(pid, ctx.commentId);
  }
  return p;
};

const tableBorders = (n: XNode | undefined, theme: Theme): TableBorders | undefined => {
  if (!n) return undefined;
  const b: TableBorders = {};
  const pick = (a: string, alt: string) => kid(n, `w:${a}`) ?? kid(n, `w:${alt}`);
  const t = border(kid(n, 'w:top'), theme); if (t) b.top = t;
  const bo = border(kid(n, 'w:bottom'), theme); if (bo) b.bottom = bo;
  const l = border(pick('left', 'start'), theme); if (l) b.left = l;
  const r = border(pick('right', 'end'), theme); if (r) b.right = r;
  const h = border(kid(n, 'w:insideH'), theme); if (h) b.insideH = h;
  const v = border(kid(n, 'w:insideV'), theme); if (v) b.insideV = v;
  return b;
};

const margins = (n: XNode | undefined) => {
  if (!n) return undefined;
  const v = (a: string, alt?: string) => { const x = kid(n, `w:${a}`) ?? (alt ? kid(n, `w:${alt}`) : undefined); return tw(x?.attrs['w:w']); };
  return { top: v('top'), bottom: v('bottom'), left: v('left', 'start'), right: v('right', 'end') };
};

const parseTblPr = (n: XNode | undefined, theme: Theme): TableProps => {
  const p: TableProps = {};
  if (!n) return p;
  const style = kid(n, 'w:tblStyle')?.attrs['w:val'];
  if (style) p.style = style;
  const w = kid(n, 'w:tblW');
  if (w) {
    const t = w.attrs['w:type'];
    const v = num(w.attrs['w:w']) ?? 0;
    p.width = t === 'pct' ? { value: v / 50, unit: 'pct' } : t === 'dxa' ? { value: v / 20, unit: 'pt' } : { value: 0, unit: 'auto' };
  }
  const jc = kid(n, 'w:jc')?.attrs['w:val'];
  if (jc === 'center' || jc === 'right') p.align = jc;
  else if (jc === 'end') p.align = 'right';
  const ind = tw(kid(n, 'w:tblInd')?.attrs['w:w']);
  if (ind) p.indent = ind;
  const b = tableBorders(kid(n, 'w:tblBorders'), theme);
  if (b) p.borders = b;
  const m = margins(kid(n, 'w:tblCellMar'));
  if (m) p.cellMargins = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
  if (kid(n, 'w:tblLayout')?.attrs['w:type'] === 'fixed') p.fixedLayout = true;
  if (on(kid(n, 'w:bidiVisual'))) p.rtl = true;
  const look = kid(n, 'w:tblLook');
  if (look) {
    const a = look.attrs;
    const v = parseInt(a['w:val'] ?? '0', 16) || 0;
    const flag = (k: string, bit: number) => (a[k] !== undefined ? a[k] === '1' : (v & bit) !== 0);
    p.look = { firstRow: flag('w:firstRow', 0x20), lastRow: flag('w:lastRow', 0x40), firstColumn: flag('w:firstColumn', 0x80), lastColumn: flag('w:lastColumn', 0x100), noHBand: flag('w:noHBand', 0x200), noVBand: flag('w:noVBand', 0x400) };
  }
  return p;
};

const parseTcPr = (n: XNode | undefined, theme: Theme): CellProps => {
  const p: CellProps = {};
  if (!n) return p;
  const w = kid(n, 'w:tcW');
  if (w?.attrs['w:type'] === 'dxa') p.width = tw(w.attrs['w:w']);
  const span = num(kid(n, 'w:gridSpan')?.attrs['w:val']);
  if (span && span > 1) p.gridSpan = span;
  const vm = kid(n, 'w:vMerge');
  if (vm) p.vMerge = vm.attrs['w:val'] === 'restart' ? 'restart' : 'continue';
  const b = tableBorders(kid(n, 'w:tcBorders'), theme);
  if (b) p.borders = b;
  const sh = shadeOf(kid(n, 'w:shd'), theme);
  if (sh) p.shading = sh;
  const m = margins(kid(n, 'w:tcMar'));
  if (m) p.margins = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
  const dir = kid(n, 'w:textDirection')?.attrs['w:val'];
  if (dir) p.textDirection = dir;
  const va = kid(n, 'w:vAlign')?.attrs['w:val'];
  if (va === 'center' || va === 'bottom' || va === 'top') p.vAlign = va;
  return p;
};

const parseTable = (n: XNode, ds: DocState): Table => {
  const theme = ds.ctx.theme;
  const rows: TableRow[] = [];
  const addRow = (tr: XNode) => {
    const trPr = kid(tr, 'w:trPr');
    const h = kid(trPr, 'w:trHeight');
    const props: TableRow['props'] = {};
    if (h) { props.height = tw(h.attrs['w:val']); props.heightRule = (h.attrs['w:hRule'] as TableRow['props']['heightRule']) ?? 'atLeast'; }
    if (on(kid(trPr, 'w:tblHeader'))) props.header = true;
    if (on(kid(trPr, 'w:cantSplit'))) props.cantSplit = true;
    const cells: TableCell[] = [];
    const addCell = (tc: XNode) => {
      const blocks = parseBlocks(kids(tc), ds);
      cells.push({ id: newId(), props: parseTcPr(kid(tc, 'w:tcPr'), theme), blocks: blocks.length ? blocks : [{ type: 'p', id: newId(), props: {}, runs: [] }] });
    };
    for (const c of kids(tr)) {
      if (c.name === 'w:tc') addCell(c);
      else if (c.name === 'w:sdt') kids(kid(c, 'w:sdtContent'), 'w:tc').forEach(addCell);
    }
    rows.push({ id: newId(), props, cells });
  };
  for (const c of kids(n)) {
    if (c.name === 'w:tr') addRow(c);
    else if (c.name === 'w:sdt') kids(kid(c, 'w:sdtContent'), 'w:tr').forEach(addRow);
  }
  return { type: 'tbl', id: newId(), props: parseTblPr(kid(n, 'w:tblPr'), theme), grid: kids(kid(n, 'w:tblGrid'), 'w:gridCol').map((g) => tw(g.attrs['w:w']) ?? 0), rows };
};

const parseBlocks = (nodes: XNode[], ds: DocState): Block[] => {
  const out: Block[] = [];
  for (const n of nodes) {
    switch (n.name) {
      case 'w:permStart': ds.perm = true; break;
      case 'w:permEnd': ds.perm = false; break;
      case 'w:p': {
        const starts = !!find(n, 'w:permStart');
        const ends = !!find(n, 'w:permEnd');
        const parsed = parseParagraph(n, ds);
        const p = ds.perm || starts ? { ...parsed, editable: true } : parsed;
        if (starts) ds.perm = true;
        if (ends) ds.perm = false;
        const prev = out[out.length - 1];
        // A large letter is stored as its own framed paragraph; here it joins the text it belongs to.
        if (prev?.type === 'p' && prev.props.dropCap && prev.runs.length === 1 && !p.props.dropCap) {
          const { size: _size, ...letter } = prev.runs[0]!.props;
          out[out.length - 1] = { ...p, props: { ...p.props, dropCap: prev.props.dropCap }, runs: [{ ...prev.runs[0]!, props: { ...letter, size: p.runs[0]?.props.size } }, ...p.runs] };
        } else out.push(p);
        break;
      }
      case 'w:tbl': out.push(parseTable(n, ds)); break;
      case 'w:sdt': out.push(...parseBlocks(kids(kid(n, 'w:sdtContent')), ds)); break;
      case 'w:ins': case 'w:del': case 'w:customXml': case 'w:smartTag': out.push(...parseBlocks(kids(n), ds)); break;
      case 'w:sectPr': case 'w:tcPr': case 'w:bookmarkStart': case 'w:bookmarkEnd': case 'w:proofErr': case 'w:commentRangeStart': case 'w:commentRangeEnd': case 'w:permStart': case 'w:permEnd': break;
      default: {
        const raw: RawBlock = { type: 'raw', id: newId(), xml: serialize(n), label: 'Object' };
        out.push(raw);
      }
    }
  }
  return out;
};

const parseStyles = (x: XNode | undefined, theme: Theme): Styles => {
  if (!x) return defaultStyles();
  const dd = kid(x, 'w:docDefaults');
  const out: Styles = {
    docDefaults: { run: parseRPr(kid(kid(dd, 'w:rPrDefault'), 'w:rPr'), theme), para: parsePPr(kid(kid(dd, 'w:pPrDefault'), 'w:pPr'), theme) },
    styles: {},
  };
  const latent = kid(x, 'w:latentStyles');
  if (latent) out.latent = serialize(latent);
  for (const s of kids(x, 'w:style')) {
    const id = s.attrs['w:styleId'];
    if (!id) continue;
    const kind = (s.attrs['w:type'] ?? 'paragraph') as Style['kind'];
    const st: Style = { id, name: kid(s, 'w:name')?.attrs['w:val'] ?? id, kind };
    if (s.attrs['w:default'] === '1') st.isDefault = true;
    const v = (k: string) => kid(s, k)?.attrs['w:val'];
    if (v('w:basedOn')) st.basedOn = v('w:basedOn');
    if (v('w:next')) st.next = v('w:next');
    if (v('w:link')) st.link = v('w:link');
    if (kid(s, 'w:qFormat')) st.quick = true;
    const pr = num(v('w:uiPriority'));
    if (pr !== undefined) st.uiPriority = pr;
    if (kid(s, 'w:hidden') || kid(s, 'w:semiHidden')) st.hidden = true;
    if (kid(s, 'w:pPr')) st.para = parsePPr(kid(s, 'w:pPr'), theme);
    if (kid(s, 'w:rPr')) st.run = parseRPr(kid(s, 'w:rPr'), theme);
    if (kind === 'table') {
      const conds = kids(s, 'w:tblStylePr');
      st.table = { props: parseTblPr(kid(s, 'w:tblPr'), theme), cell: parseTcPr(kid(s, 'w:tcPr'), theme) };
      if (conds.length) {
        st.table.conditions = Object.fromEntries(conds.map((c) => [c.attrs['w:type'] ?? '', {
          run: kid(c, 'w:rPr') ? parseRPr(kid(c, 'w:rPr'), theme) : undefined,
          para: kid(c, 'w:pPr') ? parsePPr(kid(c, 'w:pPr'), theme) : undefined,
          cell: kid(c, 'w:tcPr') ? parseTcPr(kid(c, 'w:tcPr'), theme) : undefined,
        }]));
      }
    }
    out.styles[id] = st;
  }
  return out;
};

const parseLevel = (l: XNode, theme: Theme): NumberingLevel => {
  const v = (k: string) => kid(l, k)?.attrs['w:val'];
  const jc = v('w:lvlJc');
  return {
    start: num(v('w:start')) ?? 1,
    format: v('w:numFmt') ?? 'decimal',
    text: v('w:lvlText') ?? '',
    align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left',
    suffix: (v('w:suff') as NumberingLevel['suffix']) ?? 'tab',
    paraProps: kid(l, 'w:pPr') ? parsePPr(kid(l, 'w:pPr'), theme) : undefined,
    runProps: kid(l, 'w:rPr') ? parseRPr(kid(l, 'w:rPr'), theme) : undefined,
    restartAfter: num(v('w:lvlRestart')),
    legal: on(kid(l, 'w:isLgl')),
  };
};

const parseNumbering = (x: XNode | undefined, theme: Theme): Doc['numbering'] => {
  const out: Doc['numbering'] = { abstracts: {}, instances: {} };
  if (!x) return out;
  for (const a of kids(x, 'w:abstractNum')) {
    const id = a.attrs['w:abstractNumId'] ?? '';
    const levels: NumberingLevel[] = [];
    for (const l of kids(a, 'w:lvl')) levels[num(l.attrs['w:ilvl']) ?? 0] = parseLevel(l, theme);
    const abs: AbstractNumbering = { id, levels, multiLevelType: kid(a, 'w:multiLevelType')?.attrs['w:val'] };
    out.abstracts[id] = abs;
  }
  for (const n of kids(x, 'w:num')) {
    const id = n.attrs['w:numId'] ?? '';
    const overrides: NonNullable<Doc['numbering']['instances'][string]['overrides']> = {};
    for (const o of kids(n, 'w:lvlOverride')) {
      const lv = num(o.attrs['w:ilvl']) ?? 0;
      const lvl = kid(o, 'w:lvl');
      overrides[lv] = { start: num(kid(o, 'w:startOverride')?.attrs['w:val']), level: lvl ? parseLevel(lvl, theme) : undefined };
    }
    out.instances[id] = { id, abstractId: kid(n, 'w:abstractNumId')?.attrs['w:val'] ?? '', overrides: Object.keys(overrides).length ? overrides : undefined };
  }
  return out;
};

const isDocxBytes = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b;

export const readDocx = (bytes: Uint8Array): Doc => {
  if (!isDocxBytes(bytes)) throw new Error("This file isn't a valid .docx document.");
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_INFLATED) throw new Error('This document is too large to open.');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('too large')) throw e;
    throw new Error("This file isn't a valid .docx document.");
  }
  const rootRels = readRels(files, '');
  const mainRel = rootRels.find((r) => r.type.endsWith('/officeDocument'));
  const mainPath = mainRel ? mainRel.target.replace(/^\//, '') : 'word/document.xml';
  const main = files[mainPath];
  if (!main) throw new Error("This file isn't a valid .docx document.");
  const partDir = mainPath.slice(0, mainPath.lastIndexOf('/'));
  const docRels = readRels(files, mainPath);
  const relPath = (suffix: string) => { const r = relOfType(docRels, suffix); return r ? resolvePath(partDir, r.target) : undefined; };
  const partXml = (p: string | undefined) => (p && files[p] ? parseXml(strFromU8(files[p]!)) : undefined);

  const theme = parseTheme(files, relPath('theme'));
  const media: Record<string, MediaItem> = {};
  const boxes: Record<string, Block[]> = {};
  const ctxFor = (part: string): Ctx => ({ files, theme, media, boxes, diagrams: { next: 0 }, rels: new Map(readRels(files, part).map((r) => [r.id, r])), partDir, openComments: new Set(), paraIds: new Map() });

  const docXml = parseXml(strFromU8(main));
  const body = kid(docXml, 'w:body');
  if (!body) throw new Error("This file isn't a valid .docx document.");
  const ds: DocState = { ctx: ctxFor(mainPath), toc: 0 };
  const blocks = parseBlocks(kids(body), ds);
  if (!blocks.some((b) => b.type === 'p')) blocks.push({ type: 'p', id: newId(), props: {}, runs: [] });
  const section = parseSection(kid(body, 'w:sectPr'), theme);

  const hfMap: Record<string, string> = {};
  const headers: Doc['headers'] = {};
  const footers: Doc['footers'] = {};
  for (const r of docRels) {
    const isH = r.type.endsWith('/header');
    const isF = r.type.endsWith('/footer');
    if (!isH && !isF) continue;
    const path = resolvePath(partDir, r.target);
    const x = partXml(path);
    if (!x) continue;
    const id = path.slice(path.lastIndexOf('/') + 1).replace(/\.xml$/, '');
    hfMap[r.id] = id;
    const part = parseBlocks(kids(x), { ctx: ctxFor(path), toc: 0 });
    (isH ? headers : footers)[id] = part.length ? part : [{ type: 'p', id: newId(), props: {}, runs: [] }];
  }
  const remap = (s: Section): Section => {
    const m = (refs: Section['headers']) => Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, hfMap[v!] ?? v]));
    return { ...s, headers: m(s.headers), footers: m(s.footers) };
  };
  const finalBlocks = blocks.map((b) => (b.type === 'p' && b.section ? { ...b, section: remap(b.section) } : b));

  const parseNotes = (suffix: string, tag: string): Record<string, Note> => {
    const path = relPath(suffix);
    const x = partXml(path);
    const out: Record<string, Note> = {};
    for (const n of kids(x, tag)) {
      const id = n.attrs['w:id'] ?? '';
      const t = n.attrs['w:type'];
      out[id] = { id, kind: t === 'separator' ? 'separator' : t === 'continuationSeparator' ? 'continuationSeparator' : 'normal', blocks: parseBlocks(kids(n), { ctx: ctxFor(path!), toc: 0 }) };
    }
    return out;
  };

  const comments: Record<string, Comment> = {};
  const cPath = relPath('comments');
  const cx = partXml(cPath);
  const paraIds = new Map<string, string>();
  for (const c of kids(cx, 'w:comment')) {
    const id = c.attrs['w:id'] ?? '';
    const ctx = ctxFor(cPath!);
    ctx.commentId = id;
    const bs = parseBlocks(kids(c), { ctx, toc: 0 });
    for (const [k, v] of ctx.paraIds) paraIds.set(k, v);
    comments[id] = { id, author: c.attrs['w:author'] ?? '', initials: c.attrs['w:initials'], date: c.attrs['w:date'] ?? '', blocks: bs };
  }
  const ex = partXml(relPath('commentsExtended'));
  for (const e of kids(ex, 'w15:commentEx')) {
    const id = paraIds.get(e.attrs['w15:paraId'] ?? '');
    const c = id ? comments[id] : undefined;
    if (!c) continue;
    if (e.attrs['w15:done'] === '1') c.resolved = true;
    const parent = paraIds.get(e.attrs['w15:paraIdParent'] ?? '');
    if (parent) c.parent = parent;
  }

  const sx = partXml(relPath('settings'));
  const settings: Doc['settings'] = { defaultTabStop: tw(kid(sx, 'w:defaultTabStop')?.attrs['w:val']) ?? 36 };
  if (on(kid(sx, 'w:trackRevisions'))) settings.trackChanges = true;
  if (on(kid(sx, 'w:evenAndOddHeaders'))) settings.evenAndOddHeaders = true;
  if (on(kid(sx, 'w:autoHyphenation'))) settings.autoHyphenation = true;
  if (on(kid(sx, 'w:mirrorMargins'))) settings.mirrorMargins = true;
  const compat = kids(kid(sx, 'w:compat'), 'w:compatSetting').find((c) => c.attrs['w:name'] === 'compatibilityMode');
  if (compat) settings.compatibilityMode = num(compat.attrs['w:val']);
  const prot = kid(sx, 'w:documentProtection');
  if (prot && on({ name: '', attrs: { 'w:val': prot.attrs['w:enforcement'] ?? '0' }, children: [] })) {
    const e = prot.attrs['w:edit'];
    settings.protection = { kind: e === 'comments' ? 'comments' : e === 'trackedChanges' ? 'trackedChanges' : e === 'forms' ? 'forms' : 'readOnly', hash: prot.attrs['w:hash'], salt: prot.attrs['w:salt'] };
  }
  const bg = kid(docXml, 'w:background');
  if (bg && kid(sx, 'w:displayBackgroundShape')) { const v = hex(bg.attrs['w:color']); if (v) settings.pageColor = v; }

  const core = partXml(rootRels.find((r) => r.type.endsWith('/core-properties'))?.target.replace(/^\//, ''));
  const prop = (k: string) => { const n = kids(core).find((c) => c.name.endsWith(`:${k}`) || c.name === k); return n ? textOf(n) || undefined : undefined; };
  const properties: Doc['properties'] = { title: prop('title'), subject: prop('subject'), creator: prop('creator'), keywords: prop('keywords'), description: prop('description'), lastModifiedBy: prop('lastModifiedBy'), created: prop('created'), modified: prop('modified'), category: prop('category') };

  const customPart = partXml(rootRels.find((r) => r.type.endsWith('/custom-properties'))?.target.replace(/^\//, ''));
  const custom: Record<string, string> = {};
  for (const n of kids(customPart, 'property')) if (n.attrs['name']) custom[n.attrs['name']] = textOf(n);
  const reactions = custom['ClerdoReactions'];
  delete custom['ClerdoReactions'];
  if (Object.keys(custom).length) properties.custom = custom;

  let sources: Source[] | undefined;
  for (const [k, v] of Object.entries(files)) {
    if (!/^customXml\/item\d*[^/]*\.xml$/.test(k)) continue;
    const text = strFromU8(v);
    if (!text.includes('officeDocument/2006/bibliography')) continue;
    try {
      const x = parseXml(text);
      const list = kids(x, 'b:Source').map((n): Source => {
        const v2 = (t: string) => textOf(kid(n, `b:${t}`)) || undefined;
        const people = kids(find(n, 'b:NameList'), 'b:Person').map((a) => [textOf(kid(a, 'b:Last')), textOf(kid(a, 'b:First'))].filter(Boolean).join(', '));
        const corp = textOf(find(n, 'b:Corporate'));
        return { tag: v2('Tag') ?? newId(), type: v2('SourceType') ?? 'Misc', title: v2('Title') ?? '', authors: people.length ? people : corp ? [corp] : [], year: v2('Year'), publisher: v2('Publisher'), city: v2('City'), journal: v2('JournalName'), url: v2('URL') };
      });
      sources = list;
      delete files[k];
    } catch { /* keep the part as it is */ }
  }
  const parts: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) parts[k] = v;
  const docAttrs = Object.entries(docXml.attrs).filter(([k]) => k.startsWith('xmlns')).map(([k, v]) => ` ${k}="${v}"`).join('');

  return {
    blocks: finalBlocks,
    section: remap(section),
    styles: parseStyles(partXml(relPath('styles')), theme),
    numbering: parseNumbering(partXml(relPath('numbering')), theme),
    headers, footers,
    footnotes: parseNotes('footnotes', 'w:footnote'),
    endnotes: parseNotes('endnotes', 'w:endnote'),
    comments: withReactions(comments, reactions), media, theme, settings, properties, sources, boxes: Object.keys(boxes).length ? boxes : undefined,
    preserved: { parts, documentRels: docRels, rootAttrs: docAttrs },
  };
};

const withReactions = (comments: Record<string, Comment>, json?: string): Record<string, Comment> => {
  if (!json) return comments;
  try {
    const map = JSON.parse(json) as Record<string, { author: string; kind: string }[]>;
    const out = { ...comments };
    for (const [id, list] of Object.entries(map)) if (out[id] && Array.isArray(list)) out[id] = { ...out[id]!, reactions: list.filter((r) => typeof r?.author === 'string' && typeof r?.kind === 'string').slice(0, 200) };
    return out;
  } catch { return comments; }
};
