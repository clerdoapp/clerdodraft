import { strFromU8, strToU8, zipSync } from 'fflate';
import type {
  Block, BorderLine, CellProps, ChartAtom, Comment, Doc, FloatPlacement, ImageAtom, NumberingLevel, Paragraph, ParaBorders, ParaProps, Revision, Run, RunProps, Section, ShapeAtom, DrawingAtom, Style, Table, TableBorders, TableProps,
} from '../core/model';
import { ATOM_CHAR } from '../core/model';
import { splitRuns } from '../core/tree';
import { chartPart, chartWorkbook } from './charts';
import { escapeAttr, escapeText, kid, kids, NS, parseXml, serialize, type XNode } from './xml';

const TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const nsDecl = Object.entries(NS).map(([p, u]) => ` xmlns:${p}="${u}"`).join('');
const ROOT = `${nsDecl} mc:Ignorable="w14 w15 wp14"`;

const HIGHLIGHT: Record<string, string> = { '#ffff00': 'yellow', '#00ff00': 'green', '#00ffff': 'cyan', '#ff00ff': 'magenta', '#0000ff': 'blue', '#ff0000': 'red', '#000080': 'darkBlue', '#008080': 'darkCyan', '#008000': 'darkGreen', '#800080': 'darkMagenta', '#800000': 'darkRed', '#808000': 'darkYellow', '#808080': 'darkGray', '#c0c0c0': 'lightGray', '#000000': 'black', '#ffffff': 'white' };

const twips = (v: number): number => Math.round(v * 20);
const a = (v: string | number): string => escapeAttr(String(v));
const hexOut = (c: string): string => c.replace('#', '').toUpperCase();
const flag = (name: string, v: boolean | undefined): string => (v === undefined ? '' : v ? `<w:${name}/>` : `<w:${name} w:val="0"/>`);

const borderXml = (name: string, b: BorderLine | undefined): string =>
  b ? `<w:${name} w:val="${a(b.style)}" w:sz="${Math.round(b.width * 8)}" w:space="${Math.round(b.space ?? 0)}" w:color="${b.color ? hexOut(b.color) : 'auto'}"/>` : '';

export const rPrInner = (p: RunProps): string => {
  let s = '';
  if (p.charStyle) s += `<w:rStyle w:val="${a(p.charStyle)}"/>`;
  if (p.font || p.fontCs) {
    s += `<w:rFonts${p.font ? ` w:ascii="${a(p.font)}" w:hAnsi="${a(p.font)}"` : ''}${p.fontCs ? ` w:cs="${a(p.fontCs)}"` : ''}/>`;
  }
  s += flag('b', p.bold) + flag('i', p.italic) + flag('caps', p.caps) + flag('smallCaps', p.smallCaps) + flag('strike', p.strike) + flag('dstrike', p.doubleStrike) + flag('outline', p.outline) + flag('shadow', p.shadow) + flag('emboss', p.emboss) + flag('imprint', p.imprint) + flag('vanish', p.hidden);
  if (p.color) s += `<w:color w:val="${hexOut(p.color)}"/>`;
  if (p.spacing !== undefined) s += `<w:spacing w:val="${twips(p.spacing)}"/>`;
  if (p.scale !== undefined) s += `<w:w w:val="${Math.round(p.scale)}"/>`;
  if (p.position !== undefined) s += `<w:position w:val="${Math.round(p.position * 2)}"/>`;
  if (p.size !== undefined) s += `<w:sz w:val="${Math.round(p.size * 2)}"/><w:szCs w:val="${Math.round(p.size * 2)}"/>`;
  if (p.highlight && HIGHLIGHT[p.highlight]) s += `<w:highlight w:val="${HIGHLIGHT[p.highlight]}"/>`;
  if (p.underline) {
    const map: Record<string, string> = { dashed: 'dash' };
    s += `<w:u w:val="${map[p.underline] ?? p.underline}"${p.underlineColor ? ` w:color="${hexOut(p.underlineColor)}"` : ''}/>`;
  }
  if (p.border) s += borderXml('bdr', p.border);
  const shade = p.shading ?? (p.highlight && !HIGHLIGHT[p.highlight] ? p.highlight : undefined);
  if (shade) s += `<w:shd w:val="clear" w:color="auto" w:fill="${hexOut(shade)}"/>`;
  if (p.vertAlign) s += `<w:vertAlign w:val="${p.vertAlign === 'super' ? 'superscript' : 'subscript'}"/>`;
  s += flag('rtl', p.rtl);
  if (p.lang) s += `<w:lang w:val="${a(p.lang)}"/>`;
  return s;
};

const rPr = (p: RunProps): string => { const s = rPrInner(p); return s ? `<w:rPr>${s}</w:rPr>` : ''; };

const pBorders = (b: ParaBorders | undefined): string => {
  if (!b) return '';
  const s = borderXml('top', b.top) + borderXml('left', b.left) + borderXml('bottom', b.bottom) + borderXml('right', b.right) + borderXml('between', b.between);
  return s ? `<w:pBdr>${s}</w:pBdr>` : '';
};

const pPrInner = (p: ParaProps): string => {
  let s = '';
  if (p.style) s += `<w:pStyle w:val="${a(p.style)}"/>`;
  s += flag('keepNext', p.keepNext) + flag('keepLines', p.keepLines) + flag('pageBreakBefore', p.pageBreakBefore) + flag('widowControl', p.widowControl);
  if (p.numbering) s += `<w:numPr><w:ilvl w:val="${p.numbering.level}"/><w:numId w:val="${a(p.numbering.numId)}"/></w:numPr>`;
  s += flag('suppressLineNumbers', p.suppressLineNumbers) + pBorders(p.borders);
  if (p.shading) s += `<w:shd w:val="clear" w:color="auto" w:fill="${hexOut(p.shading)}"/>`;
  if (p.tabs?.length) s += `<w:tabs>${[...p.tabs].sort((x, y) => x.pos - y.pos).map((t) => `<w:tab w:val="${t.kind}"${t.leader && t.leader !== 'none' ? ` w:leader="${t.leader}"` : ''} w:pos="${twips(t.pos)}"/>`).join('')}</w:tabs>`;
  s += flag('suppressAutoHyphens', p.suppressHyphenation) + flag('bidi', p.bidi);
  if (p.spaceBefore !== undefined || p.spaceAfter !== undefined || p.lineSpacing) {
    const ls = p.lineSpacing;
    s += `<w:spacing${p.spaceBefore !== undefined ? ` w:before="${twips(p.spaceBefore)}"` : ''}${p.spaceAfter !== undefined ? ` w:after="${twips(p.spaceAfter)}"` : ''}${ls ? ` w:line="${ls.rule === 'auto' ? Math.round(ls.value * 240) : twips(ls.value)}" w:lineRule="${ls.rule}"` : ''}/>`;
  }
  if (p.indentLeft !== undefined || p.indentRight !== undefined || p.firstLine !== undefined) {
    const f = p.firstLine;
    s += `<w:ind${p.indentLeft !== undefined ? ` w:left="${twips(p.indentLeft)}"` : ''}${p.indentRight !== undefined ? ` w:right="${twips(p.indentRight)}"` : ''}${f !== undefined ? (f < 0 ? ` w:hanging="${twips(-f)}"` : ` w:firstLine="${twips(f)}"`) : ''}/>`;
  }
  s += flag('contextualSpacing', p.contextualSpacing);
  if (p.align) s += `<w:jc w:val="${p.align === 'justify' ? 'both' : p.align}"/>`;
  if (p.outlineLevel !== undefined) s += `<w:outlineLvl w:val="${p.outlineLevel}"/>`;
  return s;
};

class PartRels {
  list: { id: string; type: string; target: string; external?: boolean }[] = [];
  private n = 0;
  private byKey = new Map<string, string>();

  add(type: string, target: string, external = false): string {
    const key = `${type}|${target}`;
    const hit = this.byKey.get(key);
    if (hit) return hit;
    let id = `rIdCd${++this.n}`;
    while (this.list.some((r) => r.id === id)) id = `rIdCd${++this.n}`;
    this.list.push({ id, type, target, external });
    this.byKey.set(key, id);
    return id;
  }

  xml(): string {
    return `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.list.map((r) => `<Relationship Id="${a(r.id)}" Type="${a(r.type)}" Target="${a(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
  }
}

interface ChartPart {
  name: string;
  atom: ChartAtom;
}

interface WriteState {
  charts: ChartPart[];
  doc: Doc;
  rels: PartRels;
  ids: { next: number };
  usedMedia: Set<string>;
  open: Set<string>; // comment ranges open across paragraphs
}

const mediaPath = (key: string): string => (key.startsWith('word/') ? key : `word/${key}`);

const nextId = (st: WriteState): number => ++st.ids.next;

const floatXml = (body: string, atom: DrawingAtom, st: WriteState): string => {
  const f: FloatPlacement = atom.float ?? { relH: 'column', relV: 'paragraph', x: 0, y: 0 };
  const emu = (v: number | undefined) => Math.round((v ?? 0) * 12700);
  const wrap = atom.wrap === 'square' ? '<wp:wrapSquare wrapText="bothSides"/>' : atom.wrap === 'tight' ? '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="0" y="21600"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrapTight>' : atom.wrap === 'through' ? '<wp:wrapThrough wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="0" y="21600"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrapThrough>' : atom.wrap === 'topBottom' ? '<wp:wrapTopAndBottom/>' : '<wp:wrapNone/>';
  const posH = f.alignH ? `<wp:align>${f.alignH}</wp:align>` : `<wp:posOffset>${emu(f.x)}</wp:posOffset>`;
  const posV = f.alignV ? `<wp:align>${f.alignV}</wp:align>` : `<wp:posOffset>${emu(f.y)}</wp:posOffset>`;
  const id = nextId(st);
  return `<wp:anchor distT="${emu(f.distT)}" distB="${emu(f.distB)}" distL="${emu(f.distL ?? 9)}" distR="${emu(f.distR ?? 9)}" simplePos="0" relativeHeight="${id + 1000}" behindDoc="${atom.wrap === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${f.relH}">${posH}</wp:positionH><wp:positionV relativeFrom="${f.relV}">${posV}</wp:positionV><wp:extent cx="${emu(atom.width)}" cy="${emu(atom.height)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wrap}${body}</wp:anchor>`;
};

const imageXml = (atom: ImageAtom, st: WriteState): string => {
  const item = st.doc.media[atom.media];
  if (!item) return '';
  st.usedMedia.add(atom.media);
  const target = mediaPath(atom.media).replace(/^word\//, '');
  const rid = st.rels.add(`${TYPE}/image`, target);
  const id = nextId(st);
  const cx = Math.round(atom.width * 12700);
  const cy = Math.round(atom.height * 12700);
  const rot = atom.rotation ? ` rot="${Math.round(atom.rotation * 60000)}"` : '';
  const inner = `<wp:docPr id="${id}" name="Picture ${id}"${atom.alt ? ` descr="${a(atom.alt)}"` : ''}/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="${NS['pic']}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${rot}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  if (atom.wrap === 'inline') return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>${inner}</wp:inline></w:drawing>`;
  return `<w:drawing>${floatXml(inner, atom, st)}</w:drawing>`;
};

const emuOf = (v: number | undefined): number => Math.round((v ?? 0) * 12700);

// Saved drawings keep their styling; size and position follow what was changed in the app.
const patchDrawing = (xml: string, atom: DrawingAtom): string => {
  const cx = emuOf(atom.width);
  const cy = emuOf(atom.height);
  let out = xml.replace(/<wp:extent\b[^>]*\/>/g, `<wp:extent cx="${cx}" cy="${cy}"/>`).replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
  const f = atom.float;
  if (f && atom.wrap !== 'inline') {
    const h = f.alignH ? `<wp:align>${f.alignH}</wp:align>` : `<wp:posOffset>${emuOf(f.x)}</wp:posOffset>`;
    const v = f.alignV ? `<wp:align>${f.alignV}</wp:align>` : `<wp:posOffset>${emuOf(f.y)}</wp:posOffset>`;
    out = out.replace(/<wp:positionH\b[\s\S]*?<\/wp:positionH>/g, `<wp:positionH relativeFrom="${f.relH}">${h}</wp:positionH>`).replace(/<wp:positionV\b[\s\S]*?<\/wp:positionV>/g, `<wp:positionV relativeFrom="${f.relV}">${v}</wp:positionV>`);
  }
  return out;
};

const chartXml = (atom: ChartAtom, st: WriteState): string => {
  if (atom.xml) return patchDrawing(atom.xml, atom);
  const name = `chartCd${st.charts.length + 1}`;
  st.charts.push({ name, atom });
  const rid = st.rels.add(`${TYPE}/chart`, `charts/${name}.xml`);
  const id = nextId(st);
  const cx = emuOf(atom.width);
  const cy = emuOf(atom.height);
  const inner = `<wp:docPr id="${id}" name="Chart ${id}"${atom.alt ? ` descr="${a(atom.alt)}"` : ''}/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="${NS['c']}"><c:chart r:id="${rid}"/></a:graphicData></a:graphic>`;
  if (atom.wrap === 'inline') return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>${inner}</wp:inline></w:drawing>`;
  return `<w:drawing>${floatXml(inner, atom, st)}</w:drawing>`;
};

const shapeXml = (atom: ShapeAtom, st: WriteState): string => {
  const text = atom.textId ? blocksXml(st.doc.boxes?.[atom.textId] ?? [], st) || '<w:p/>' : '';
  if (atom.xml) {
    const out = patchDrawing(atom.xml, atom);
    return text ? out.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, () => `<w:txbxContent>${text}</w:txbxContent>`) : out;
  }
  const id = nextId(st);
  const cx = Math.round(atom.width * 12700);
  const cy = Math.round(atom.height * 12700);
  const inner = `<wp:docPr id="${id}" name="Shape ${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="${NS['wps']}"><wps:wsp><wps:cNvSpPr${text ? ' txBox="1"' : ''}/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${a(atom.shape)}"><a:avLst/></a:prstGeom>${atom.fill ? `<a:solidFill><a:srgbClr val="${hexOut(atom.fill)}"/></a:solidFill>` : '<a:noFill/>'}<a:ln w="${Math.round((atom.strokeWidth ?? 1) * 12700)}">${atom.stroke ? `<a:solidFill><a:srgbClr val="${hexOut(atom.stroke)}"/></a:solidFill>` : '<a:noFill/>'}</a:ln></wps:spPr>${text ? `<wps:txbx><w:txbxContent>${text}</w:txbxContent></wps:txbx>` : ''}<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic>`;
  const drawing = atom.wrap === 'inline' ? `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>${inner}</wp:inline></w:drawing>` : `<w:drawing>${floatXml(inner, atom, st)}</w:drawing>`;
  return `<mc:AlternateContent><mc:Choice Requires="wps">${drawing}</mc:Choice></mc:AlternateContent>`;
};

const textRuns = (r: Run, del: boolean): string => {
  const pr = rPr(r.props);
  let out = '';
  let buf = '';
  const tag = del ? 'w:delText' : 'w:t';
  const flush = () => {
    if (buf) out += `<w:r>${pr}<${tag} xml:space="preserve">${escapeText(buf)}</${tag}></w:r>`;
    buf = '';
  };
  for (const ch of r.text) {
    const special = ch === '\t' ? '<w:tab/>' : ch === '\n' ? '<w:br/>' : ch === '\f' ? '<w:br w:type="page"/>' : ch === '\v' ? '<w:br w:type="column"/>' : ch === '\u2011' ? '<w:noBreakHyphen/>' : ch === '\u00AD' ? '<w:softHyphen/>' : null;
    if (special) { flush(); out += `<w:r>${pr}${special}</w:r>`; }
    else if (ch !== ATOM_CHAR) buf += ch;
  }
  flush();
  return out;
};

const atomXml = (r: Run, st: WriteState): string => {
  const a0 = r.atom!;
  const pr = rPr(r.props);
  switch (a0.kind) {
    case 'image': return `<w:r>${pr}${imageXml(a0, st)}</w:r>`;
    case 'shape': return `<w:r>${pr}${shapeXml(a0, st)}</w:r>`;
    case 'chart': return `<w:r>${pr}${chartXml(a0, st)}</w:r>`;
    case 'field':
      return `<w:r>${pr}<w:fldChar w:fldCharType="begin"${a0.locked ? ' w:fldLock="1"' : ''}/></w:r><w:r>${pr}<w:instrText xml:space="preserve"> ${escapeText(a0.instr)} </w:instrText></w:r><w:r>${pr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${pr}<w:t xml:space="preserve">${escapeText(a0.result)}</w:t></w:r><w:r>${pr}<w:fldChar w:fldCharType="end"/></w:r>`;
    case 'footnote': return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${a(a0.id)}"/></w:r>`;
    case 'endnote': return `<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="${a(a0.id)}"/></w:r>`;
    case 'equation': return a0.omml ?? `<m:oMath><m:r><m:t>${escapeText(a0.source)}</m:t></m:r></m:oMath>`;
    case 'checkbox': return `<w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="${a0.checked ? 1 : 0}"/><w14:checkedState w14:val="2612" w14:font="MS Gothic"/><w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r>${pr}<w:t>${a0.checked ? '\u2612' : '\u2610'}</w:t></w:r></w:sdtContent></w:sdt>`;
    case 'raw': return a0.xml.startsWith('<w:r>') || a0.xml.startsWith('<w:r ') ? a0.xml : `<w:r>${pr}${a0.xml}</w:r>`;
    default: return '';
  }
};

const revAttrs = (rev: Revision, st: WriteState): string => ` w:id="${nextId(st)}" w:author="${a(rev.author)}" w:date="${a(rev.date)}"`;

const runXml = (r: Run, st: WriteState): string => {
  const body = r.atom ? atomXml(r, st) : textRuns(r, !!r.del);
  if (r.ins) return `<w:ins${revAttrs(r.ins, st)}>${body}</w:ins>`;
  if (r.del) return `<w:del${revAttrs(r.del, st)}>${body}</w:del>`;
  return body;
};

const linkOpen = (l: NonNullable<Run['link']>, st: WriteState): string => {
  const attrs: string[] = [];
  if (l.href) attrs.push(`r:id="${a(st.rels.add(`${TYPE}/hyperlink`, l.href, true))}"`);
  if (l.anchor) attrs.push(`w:anchor="${a(l.anchor)}"`);
  if (l.tooltip) attrs.push(`w:tooltip="${a(l.tooltip)}"`);
  return `<w:hyperlink ${attrs.join(' ')} w:history="1">`;
};

const sameLink = (x?: Run['link'], y?: Run['link']): boolean => x?.href === y?.href && x?.anchor === y?.anchor;

const commentNum = (id: string): string => (/^\d+$/.test(id) ? id : String(parseInt(id.replace(/\D/g, '').slice(-6) || '0', 10) + 100000));

const inlineXml = (p: Paragraph, st: WriteState): string => {
  let runs = p.runs;
  const marks = p.bookmarks ?? [];
  const cuts = [...new Set(marks.flatMap((m) => [m.start, m.end]))].sort((x, y) => x - y);
  if (cuts.length) {
    const pieces: Run[] = [];
    let rest = runs;
    let at = 0;
    for (const c of cuts) {
      const [x, y] = splitRuns(rest, c - at);
      pieces.push(...x);
      rest = y;
      at = c;
    }
    runs = [...pieces, ...rest];
  }
  let out = '';
  let pos = 0;
  let link: Run['link'] | undefined;
  const ids = marks.map(() => nextId(st));
  const edge = (off: number) => {
    let s = '';
    marks.forEach((m, i) => { if (m.start === off) s += `<w:bookmarkStart w:id="${ids[i]}" w:name="${a(m.name)}"/>`; });
    marks.forEach((m, i) => { if (m.end === off) s += `<w:bookmarkEnd w:id="${ids[i]}"/>`; });
    return s;
  };
  const closeLink = () => { if (link) { out += '</w:hyperlink>'; link = undefined; } };
  const closeComments = (keep: Set<string>) => {
    for (const id of [...st.open]) {
      if (keep.has(id)) continue;
      closeLink();
      out += `<w:commentRangeEnd w:id="${commentNum(id)}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentNum(id)}"/></w:r>`;
      st.open.delete(id);
    }
  };
  for (const r of runs) {
    const here = edge(pos);
    if (here) { closeLink(); out += here; }
    const cs = new Set(r.comments ?? []);
    closeComments(cs);
    for (const id of cs) {
      if (!st.open.has(id)) {
        closeLink();
        out += `<w:commentRangeStart w:id="${commentNum(id)}"/>`;
        st.open.add(id);
      }
    }
    if (!sameLink(link, r.link)) {
      closeLink();
      if (r.link) { out += linkOpen(r.link, st); link = r.link; }
    }
    out += runXml(r, st);
    pos += r.text.length;
  }
  closeLink();
  closeComments(new Set(st.open.size ? [] : []));
  if (runs.length || marks.length) {
    const end = edge(pos);
    if (end && (pos > 0 || !runs.length)) out += end;
  }
  return out;
};

const hfRefs = (s: Section, st: WriteState): string => {
  const one = (tag: string, kind: string, id: string | undefined, rel: string, folder: string) =>
    id ? `<w:${tag}Reference w:type="${kind}" r:id="${st.rels.add(`${TYPE}/${rel}`, `${id}.xml`)}"/>` : (void folder, '');
  return (['default', 'first', 'even'] as const).map((k) => one('header', k, s.headers[k], 'header', '') + one('footer', k, s.footers[k], 'footer', '')).join('');
};

const sectPr = (s: Section, st: WriteState): string => {
  let x = hfRefs(s, st);
  if (s.breakType) x += `<w:type w:val="${s.breakType}"/>`;
  x += `<w:pgSz w:w="${twips(s.pageWidth)}" w:h="${twips(s.pageHeight)}"${s.landscape ? ' w:orient="landscape"' : ''}/>`;
  x += `<w:pgMar w:top="${twips(s.marginTop)}" w:right="${twips(s.marginRight)}" w:bottom="${twips(s.marginBottom)}" w:left="${twips(s.marginLeft)}" w:header="${twips(s.headerDistance)}" w:footer="${twips(s.footerDistance)}" w:gutter="${twips(s.gutter ?? 0)}"/>`;
  if (s.pageBorders) {
    const b = s.pageBorders;
    x += `<w:pgBorders w:offsetFrom="page">${borderXml('top', b.top)}${borderXml('left', b.left)}${borderXml('bottom', b.bottom)}${borderXml('right', b.right)}</w:pgBorders>`;
  }
  if (s.lineNumbers) x += `<w:lnNumType w:countBy="${s.lineNumbers.countBy}"${s.lineNumbers.start !== undefined ? ` w:start="${s.lineNumbers.start}"` : ''}${s.lineNumbers.distance !== undefined ? ` w:distance="${twips(s.lineNumbers.distance)}"` : ''}${s.lineNumbers.restart ? ` w:restart="${a(s.lineNumbers.restart)}"` : ''}/>`;
  if (s.pageNumbers) x += `<w:pgNumType${s.pageNumbers.format ? ` w:fmt="${a(s.pageNumbers.format)}"` : ''}${s.pageNumbers.start !== undefined ? ` w:start="${s.pageNumbers.start}"` : ''}/>`;
  const c = s.columns;
  x += `<w:cols${c.count > 1 ? ` w:num="${c.count}"` : ''} w:space="${twips(c.space)}"${c.separator ? ' w:sep="1"' : ''}${c.widths ? ' w:equalWidth="0"' : ''}>${c.widths?.map((k) => `<w:col w:w="${twips(k.w)}" w:space="${twips(k.space)}"/>`).join('') ?? ''}</w:cols>`.replace('></w:cols>', '/>');
  if (s.vAlign) x += `<w:vAlign w:val="${s.vAlign}"/>`;
  if (s.titlePage) x += '<w:titlePg/>';
  if (s.bidi) x += '<w:bidi/>';
  return `<w:sectPr>${x}</w:sectPr>`;
};

const paraXml = (p: Paragraph, st: WriteState): string => {
  let mark = rPrInner(p.markProps ?? {});
  if (p.markIns) mark = `<w:ins${revAttrs(p.markIns, st)}/>${mark}`;
  if (p.markDel) mark = `<w:del${revAttrs(p.markDel, st)}/>${mark}`;
  const pr = pPrInner(p.props) + (mark ? `<w:rPr>${mark}</w:rPr>` : '') + (p.section ? sectPr(p.section, st) : '');
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${inlineXml(p, st)}</w:p>`;
};

const tblBorders = (tag: string, b: TableBorders | undefined): string => {
  if (!b) return '';
  const s = borderXml('top', b.top) + borderXml('left', b.left) + borderXml('bottom', b.bottom) + borderXml('right', b.right) + borderXml('insideH', b.insideH) + borderXml('insideV', b.insideV);
  return s ? `<w:${tag}>${s}</w:${tag}>` : '';
};

const marginsXml = (tag: string, m: CellProps['margins']): string => {
  if (!m) return '';
  const one = (k: 'top' | 'left' | 'bottom' | 'right') => (m[k] !== undefined ? `<w:${k} w:w="${twips(m[k]!)}" w:type="dxa"/>` : '');
  const s = one('top') + one('left') + one('bottom') + one('right');
  return s ? `<w:${tag}>${s}</w:${tag}>` : '';
};

const tblPrInner = (p: TableProps): string => {
  let s = '';
  if (p.style) s += `<w:tblStyle w:val="${a(p.style)}"/>`;
  if (p.rtl) s += '<w:bidiVisual/>';
  if (p.width) s += p.width.unit === 'pct' ? `<w:tblW w:w="${Math.round(p.width.value * 50)}" w:type="pct"/>` : p.width.unit === 'pt' ? `<w:tblW w:w="${twips(p.width.value)}" w:type="dxa"/>` : '<w:tblW w:w="0" w:type="auto"/>';
  if (p.align) s += `<w:jc w:val="${p.align}"/>`;
  if (p.indent) s += `<w:tblInd w:w="${twips(p.indent)}" w:type="dxa"/>`;
  s += tblBorders('tblBorders', p.borders);
  if (p.fixedLayout) s += '<w:tblLayout w:type="fixed"/>';
  s += marginsXml('tblCellMar', p.cellMargins);
  const l = p.look;
  if (l) {
    const bit = (b: boolean | undefined) => (b ? 1 : 0);
    const v = (l.firstRow ? 0x20 : 0) | (l.lastRow ? 0x40 : 0) | (l.firstColumn ? 0x80 : 0) | (l.lastColumn ? 0x100 : 0) | (l.noHBand ? 0x200 : 0) | (l.noVBand ? 0x400 : 0);
    s += `<w:tblLook w:val="${v.toString(16).padStart(4, '0').toUpperCase()}" w:firstRow="${bit(l.firstRow)}" w:lastRow="${bit(l.lastRow)}" w:firstColumn="${bit(l.firstColumn)}" w:lastColumn="${bit(l.lastColumn)}" w:noHBand="${bit(l.noHBand)}" w:noVBand="${bit(l.noVBand)}"/>`;
  }
  return s;
};

const tcPrInner = (p: CellProps): string => {
  let s = '';
  if (p.width !== undefined) s += `<w:tcW w:w="${twips(p.width)}" w:type="dxa"/>`;
  if (p.gridSpan && p.gridSpan > 1) s += `<w:gridSpan w:val="${p.gridSpan}"/>`;
  if (p.vMerge) s += p.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
  s += tblBorders('tcBorders', p.borders);
  if (p.shading) s += `<w:shd w:val="clear" w:color="auto" w:fill="${hexOut(p.shading)}"/>`;
  s += marginsXml('tcMar', p.margins);
  if (p.textDirection) s += `<w:textDirection w:val="${a(p.textDirection)}"/>`;
  if (p.vAlign) s += `<w:vAlign w:val="${p.vAlign}"/>`;
  return s;
};

const tableXml = (t: Table, st: WriteState): string => {
  const rows = t.rows.map((r) => {
    const h = r.props;
    let trPr = '';
    if (h.cantSplit) trPr += '<w:cantSplit/>';
    if (h.height !== undefined) trPr += `<w:trHeight w:val="${twips(h.height)}"${h.heightRule && h.heightRule !== 'auto' ? ` w:hRule="${h.heightRule}"` : ''}/>`;
    if (h.header) trPr += '<w:tblHeader/>';
    const cells = r.cells.map((c) => {
      const pr = tcPrInner(c.props);
      const body = blocksXml(c.blocks, st);
      const last = c.blocks[c.blocks.length - 1];
      return `<w:tc>${pr ? `<w:tcPr>${pr}</w:tcPr>` : ''}${body}${last?.type === 'p' ? '' : '<w:p/>'}</w:tc>`;
    }).join('');
    return `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}${cells}</w:tr>`;
  }).join('');
  const pr = tblPrInner(t.props);
  return `<w:tbl><w:tblPr>${pr || '<w:tblW w:w="0" w:type="auto"/>'}</w:tblPr><w:tblGrid>${t.grid.map((g) => `<w:gridCol w:w="${twips(g)}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
};

const tocOpen = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
const tocClose = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

const blocksXml = (blocks: Block[], st: WriteState): string => {
  let out = '';
  blocks.forEach((b, i) => {
    if (b.type === 'p') {
      let x = paraXml(b, st);
      if (b.tocEntry) {
        const prev = blocks[i - 1];
        const next = blocks[i + 1];
        if (!(prev?.type === 'p' && prev.tocEntry)) x = x.replace(/^(<w:p>(?:<w:pPr>.*?<\/w:pPr>)?)/, `$1${tocOpen}`);
        if (!(next?.type === 'p' && next.tocEntry)) x = x.replace(/<\/w:p>$/, `${tocClose}</w:p>`);
      }
      out += x;
    } else if (b.type === 'tbl') out += tableXml(b, st);
    else out += b.xml;
  });
  return out;
};

const styleXml = (s: Style): string => {
  let x = `<w:name w:val="${a(s.name)}"/>`;
  if (s.basedOn) x += `<w:basedOn w:val="${a(s.basedOn)}"/>`;
  if (s.next) x += `<w:next w:val="${a(s.next)}"/>`;
  if (s.link) x += `<w:link w:val="${a(s.link)}"/>`;
  if (s.uiPriority !== undefined) x += `<w:uiPriority w:val="${s.uiPriority}"/>`;
  if (s.hidden) x += '<w:semiHidden/><w:unhideWhenUsed/>';
  if (s.quick) x += '<w:qFormat/>';
  if (s.para) { const p = pPrInner(s.para); if (p) x += `<w:pPr>${p}</w:pPr>`; }
  if (s.run) { const r = rPrInner(s.run); if (r) x += `<w:rPr>${r}</w:rPr>`; }
  if (s.table) {
    if (s.table.props) { const p = tblPrInner(s.table.props); if (p) x += `<w:tblPr>${p}</w:tblPr>`; }
    if (s.table.cell) { const p = tcPrInner(s.table.cell); if (p) x += `<w:tcPr>${p}</w:tcPr>`; }
    for (const [type, c] of Object.entries(s.table.conditions ?? {})) {
      x += `<w:tblStylePr w:type="${a(type)}">${c.para ? `<w:pPr>${pPrInner(c.para)}</w:pPr>` : ''}${c.run ? `<w:rPr>${rPrInner(c.run)}</w:rPr>` : ''}${c.cell ? `<w:tcPr>${tcPrInner(c.cell)}</w:tcPr>` : ''}</w:tblStylePr>`;
    }
  }
  return `<w:style w:type="${s.kind}"${s.isDefault ? ' w:default="1"' : ''} w:styleId="${a(s.id)}">${x}</w:style>`;
};

const stylesXml = (doc: Doc): string => {
  const d = doc.styles.docDefaults;
  const list = { ...doc.styles.styles };
  const hasNotes = Object.keys(doc.comments).length;
  if (hasNotes && !list['CommentReference']) list['CommentReference'] = { id: 'CommentReference', name: 'annotation reference', kind: 'character', hidden: true, run: { size: 8 } };
  return `${HEAD}<w:styles${ROOT}><w:docDefaults><w:rPrDefault><w:rPr>${rPrInner(d.run)}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${pPrInner(d.para)}</w:pPr></w:pPrDefault></w:docDefaults>${doc.styles.latent ?? ''}${Object.values(list).map(styleXml).join('')}</w:styles>`;
};

const levelXml = (l: NumberingLevel | undefined, i: number): string => {
  if (!l) return '';
  return `<w:lvl w:ilvl="${i}"><w:start w:val="${l.start}"/><w:numFmt w:val="${a(l.format)}"/>${l.restartAfter !== undefined ? `<w:lvlRestart w:val="${l.restartAfter}"/>` : ''}${l.legal ? '<w:isLgl/>' : ''}${l.suffix && l.suffix !== 'tab' ? `<w:suff w:val="${l.suffix}"/>` : ''}<w:lvlText w:val="${a(l.text)}"/><w:lvlJc w:val="${l.align ?? 'left'}"/>${l.paraProps ? `<w:pPr>${pPrInner(l.paraProps)}</w:pPr>` : ''}${l.runProps ? `<w:rPr>${rPrInner(l.runProps)}</w:rPr>` : ''}</w:lvl>`;
};

const numberingXml = (doc: Doc): string => {
  const n = doc.numbering;
  const abs = Object.values(n.abstracts).map((x) => `<w:abstractNum w:abstractNumId="${a(x.id)}"><w:multiLevelType w:val="${a(x.multiLevelType ?? 'hybridMultilevel')}"/>${x.levels.map(levelXml).join('')}</w:abstractNum>`).join('');
  const inst = Object.values(n.instances).map((x) => {
    const ov = Object.entries(x.overrides ?? {}).map(([k, v]) => `<w:lvlOverride w:ilvl="${k}">${v.start !== undefined ? `<w:startOverride w:val="${v.start}"/>` : ''}${v.level ? levelXml(v.level, Number(k)) : ''}</w:lvlOverride>`).join('');
    return `<w:num w:numId="${a(x.id)}"><w:abstractNumId w:val="${a(x.abstractId)}"/>${ov}</w:num>`;
  }).join('');
  return `${HEAD}<w:numbering${ROOT}>${abs}${inst}</w:numbering>`;
};

const SETTINGS_ORDER = ['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries', 'displayBackgroundShape', 'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts', 'saveFormsData', 'mirrorMargins', 'alignBordersAndEdges', 'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter', 'gutterAtTop', 'hideSpellingErrors', 'hideGrammaticalErrors', 'activeWritingStyle', 'proofState', 'formsDesign', 'attachedTemplate', 'linkStyles', 'stylePaneFormatFilter', 'stylePaneSortMethod', 'documentType', 'mailMerge', 'revisionView', 'trackRevisions', 'doNotTrackMoves', 'doNotTrackFormatting', 'documentProtection', 'autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop', 'autoHyphenation', 'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle', 'evenAndOddHeaders', 'bookFoldRevPrinting', 'bookFoldPrinting', 'bookFoldPrintingSheets', 'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing', 'displayHorizontalDrawingGridEvery', 'displayVerticalDrawingGridEvery', 'doNotUseMarginsForDrawingGridOrigin', 'drawingGridHorizontalOrigin', 'drawingGridVerticalOrigin', 'doNotShadeFormData', 'noPunctuationKerning', 'characterSpacingControl', 'printTwoOnOne', 'strictFirstAndLastChars', 'noLineBreaksAfter', 'noLineBreaksBefore', 'savePreviewPicture', 'doNotValidateAgainstSchema', 'saveInvalidXml', 'ignoreMixedContent', 'alwaysShowPlaceholderText', 'doNotDemarcateInvalidXml', 'saveXmlDataOnly', 'useXSLTWhenSaving', 'saveThroughXslt', 'showXMLTags', 'alwaysMergeEmptyNamespace', 'updateFields', 'hdrShapeDefaults', 'footnotePr', 'endnotePr', 'compat'];

const settingsXml = (doc: Doc): string => {
  const s = doc.settings;
  const original = doc.preserved?.parts['word/settings.xml'];
  const controlled = new Set(['w:trackRevisions', 'w:evenAndOddHeaders', 'w:defaultTabStop', 'w:autoHyphenation', 'w:documentProtection', 'w:displayBackgroundShape']);
  let kept: XNode[] = [];
  if (original) {
    try { kept = kids(parseXml(strFromU8(original))).filter((c) => !controlled.has(c.name)); } catch { kept = []; }
  }
  const add: XNode[] = [{ name: 'w:defaultTabStop', attrs: { 'w:val': String(twips(s.defaultTabStop)) }, children: [] }];
  if (s.trackChanges) add.push({ name: 'w:trackRevisions', attrs: {}, children: [] });
  if (s.evenAndOddHeaders) add.push({ name: 'w:evenAndOddHeaders', attrs: {}, children: [] });
  if (s.autoHyphenation) add.push({ name: 'w:autoHyphenation', attrs: {}, children: [] });
  if (s.pageColor) add.push({ name: 'w:displayBackgroundShape', attrs: {}, children: [] });
  if (s.protection) {
    const edit = s.protection.kind;
    add.push({ name: 'w:documentProtection', attrs: { 'w:edit': edit, 'w:enforcement': '1', ...(s.protection.hash ? { 'w:hash': s.protection.hash, 'w:salt': s.protection.salt ?? '' } : {}) }, children: [] });
  }
  const hasFn = Object.keys(doc.footnotes).length > 0;
  const hasEn = Object.keys(doc.endnotes).length > 0;
  if (!original) {
    if (hasFn) add.push({ name: 'w:footnotePr', attrs: {}, children: [{ name: 'w:footnote', attrs: { 'w:id': '-1' }, children: [] }, { name: 'w:footnote', attrs: { 'w:id': '0' }, children: [] }] });
    if (hasEn) add.push({ name: 'w:endnotePr', attrs: {}, children: [{ name: 'w:endnote', attrs: { 'w:id': '-1' }, children: [] }, { name: 'w:endnote', attrs: { 'w:id': '0' }, children: [] }] });
    add.push({ name: 'w:compat', attrs: {}, children: [{ name: 'w:compatSetting', attrs: { 'w:name': 'compatibilityMode', 'w:uri': 'http://schemas.microsoft.com/office/word', 'w:val': '15' }, children: [] }] });
  }
  const rank = (n: string) => { const i = SETTINGS_ORDER.indexOf(n.replace(/^w:/, '')); return i < 0 ? 999 : i; };
  const all = [...kept, ...add].map((n, i) => ({ n, i })).sort((x, y) => rank(x.n.name) - rank(y.n.name) || x.i - y.i).map((x) => x.n);
  return `${HEAD}<w:settings${ROOT}>${all.map(serialize).join('')}</w:settings>`;
};

const noteXml = (tag: 'footnote' | 'endnote', id: string, blocks: Block[], kind: string | undefined, st: WriteState): string => {
  if (kind === 'separator' || kind === 'continuationSeparator') {
    const mark = kind === 'separator' ? '<w:separator/>' : '<w:continuationSeparator/>';
    return `<w:${tag} w:type="${kind}" w:id="${a(id)}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r>${mark}</w:r></w:p></w:${tag}>`;
  }
  const ref = `<w:r><w:rPr><w:rStyle w:val="${tag === 'footnote' ? 'FootnoteReference' : 'EndnoteReference'}"/></w:rPr><w:${tag}Ref/></w:r>`;
  const x = blocksXml(blocks, st).replace(/^(<w:p>(?:<w:pPr>.*?<\/w:pPr>)?)/, `$1${ref}`);
  return `<w:${tag} w:id="${a(id)}">${x}</w:${tag}>`;
};

const notesPart = (tag: 'footnote' | 'endnote', notes: Doc['footnotes'], st: WriteState): string => {
  const list = Object.values(notes);
  const seps = list.some((n) => n.kind === 'separator') ? '' : `${noteXml(tag, '-1', [], 'separator', st)}${noteXml(tag, '0', [], 'continuationSeparator', st)}`;
  return `${HEAD}<w:${tag}s${ROOT}>${seps}${list.map((n) => noteXml(tag, n.id, n.blocks, n.kind, st)).join('')}</w:${tag}s>`;
};

const paraIdOf = (i: number): string => (0x10000000 + i).toString(16).toUpperCase();

const commentsParts = (doc: Doc, st: WriteState): { comments: string; extended: string } => {
  const list = Object.values(doc.comments);
  const ids = new Map(list.map((c, i) => [c.id, paraIdOf(i)]));
  const one = (c: Comment) => {
    const x = blocksXml(c.blocks.length ? c.blocks : [{ type: 'p', id: c.id, props: {}, runs: [] }], st);
    const idx = x.lastIndexOf('<w:p>');
    const marked = idx >= 0 ? `${x.slice(0, idx)}<w:p w14:paraId="${ids.get(c.id)}">${x.slice(idx + 5)}` : x;
    return `<w:comment w:id="${commentNum(c.id)}" w:author="${a(c.author)}" w:date="${a(c.date)}"${c.initials ? ` w:initials="${a(c.initials)}"` : ''}>${marked}</w:comment>`;
  };
  return {
    comments: `${HEAD}<w:comments${ROOT}>${list.map(one).join('')}</w:comments>`,
    extended: `${HEAD}<w15:commentsEx${ROOT}>${list.map((c) => `<w15:commentEx w15:paraId="${ids.get(c.id)}"${c.parent && ids.get(c.parent) ? ` w15:paraIdParent="${ids.get(c.parent)}"` : ''} w15:done="${c.resolved ? 1 : 0}"/>`).join('')}</w15:commentsEx>`,
  };
};

const THEME = `${HEAD}<a:theme xmlns:a="${NS['a']}" name="Clerdo"><a:themeElements><a:clrScheme name="Clerdo"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2A44"/></a:dk2><a:lt2><a:srgbClr val="EEF1F8"/></a:lt2><a:accent1><a:srgbClr val="2347FF"/></a:accent1><a:accent2><a:srgbClr val="12797B"/></a:accent2><a:accent3><a:srgbClr val="B7791F"/></a:accent3><a:accent4><a:srgbClr val="9B2C6F"/></a:accent4><a:accent5><a:srgbClr val="3F8F4F"/></a:accent5><a:accent6><a:srgbClr val="C2410C"/></a:accent6><a:hlink><a:srgbClr val="2347FF"/></a:hlink><a:folHlink><a:srgbClr val="6B46C1"/></a:folHlink></a:clrScheme><a:fontScheme name="Clerdo"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Clerdo"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const REGENERATED = /^(\[Content_Types\]\.xml|_rels\/\.rels|word\/document\.xml|word\/_rels\/document\.xml\.rels|word\/styles\.xml|word\/numbering\.xml|word\/settings\.xml|word\/comments\.xml|word\/commentsExtended\.xml|word\/footnotes\.xml|word\/endnotes\.xml|word\/media\/.*|docProps\/core\.xml|docProps\/app\.xml)$/;

const OWN_REL = /\/(styles|numbering|settings|comments|commentsExtended|footnotes|endnotes|header|footer)$/;

const isoNow = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export const writeDocx = (doc: Doc): Uint8Array => {
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, xml: string) => { files[path] = strToU8(xml); };
  const preserved = doc.preserved;
  const ids = { next: 1 };
  const usedMedia = new Set<string>();
  const seeded = (part: string): PartRels => {
    const r = new PartRels();
    const data = preserved?.parts[part];
    if (data) {
      for (const n of kids(parseXml(strFromU8(data)))) {
        r.list.push({ id: n.attrs['Id'] ?? '', type: n.attrs['Type'] ?? '', target: n.attrs['Target'] ?? '', external: n.attrs['TargetMode'] === 'External' });
      }
    }
    return r;
  };

  const docRels = new PartRels();
  const sourcesPart = doc.sources ? (r: { target: string }) => /customXml\/item/.test(r.target) && !preserved?.parts[r.target.replace(/^\.\.\//, '')] : () => false;
  for (const r of preserved?.documentRels ?? []) if (!OWN_REL.test(r.type) && !sourcesPart(r)) docRels.list.push(r);
  const charts: ChartPart[] = [];
  const st: WriteState = { charts, doc, rels: docRels, ids, usedMedia, open: new Set() };

  const body = blocksXml(doc.blocks, st);
  const bg = doc.settings.pageColor ? `<w:background w:color="${hexOut(doc.settings.pageColor)}"/>` : '';
  const finalSect = sectPr(doc.section, st);
  const extra = (preserved?.rootAttrs ?? '').replace(/ xmlns="[^"]*"/, '');
  put('word/document.xml', `${HEAD}<w:document${ROOT}${extra}>${bg}<w:body>${body}${finalSect}</w:body></w:document>`);

  const hfPart = (kind: 'hdr' | 'ftr', id: string, blocks: Block[]) => {
    const rels = seeded(`word/_rels/${id}.xml.rels`);
    const s: WriteState = { charts, doc, rels, ids, usedMedia, open: new Set() };
    put(`word/${id}.xml`, `${HEAD}<w:${kind}${ROOT}${extra}>${blocksXml(blocks, s)}</w:${kind}>`);
    if (rels.list.length) put(`word/_rels/${id}.xml.rels`, rels.xml());
  };
  const overrides: [string, string][] = [
    ['/word/document.xml', `${CT}.document.main+xml`],
    ['/word/styles.xml', `${CT}.styles+xml`],
    ['/word/settings.xml', `${CT}.settings+xml`],
    ['/word/numbering.xml', `${CT}.numbering+xml`],
    ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
    ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml'],
  ];
  for (const [id, b] of Object.entries(doc.headers)) { hfPart('hdr', id, b); overrides.push([`/word/${id}.xml`, `${CT}.header+xml`]); docRels.add(`${TYPE}/header`, `${id}.xml`); }
  for (const [id, b] of Object.entries(doc.footers)) { hfPart('ftr', id, b); overrides.push([`/word/${id}.xml`, `${CT}.footer+xml`]); docRels.add(`${TYPE}/footer`, `${id}.xml`); }

  const part = (name: string, rel: string, type: string, xml: string) => {
    put(`word/${name}`, xml);
    docRels.add(`${TYPE}/${rel}`, name);
    overrides.push([`/word/${name}`, type]);
  };
  docRels.add(`${TYPE}/styles`, 'styles.xml');
  docRels.add(`${TYPE}/settings`, 'settings.xml');
  docRels.add(`${TYPE}/numbering`, 'numbering.xml');
  put('word/styles.xml', stylesXml(doc));
  put('word/settings.xml', settingsXml(doc));
  put('word/numbering.xml', numberingXml(doc));

  const noteState: WriteState = { ...st, rels: seeded('word/_rels/footnotes.xml.rels'), open: new Set() };
  if (Object.keys(doc.footnotes).length) {
    part('footnotes.xml', 'footnotes', `${CT}.footnotes+xml`, notesPart('footnote', doc.footnotes, noteState));
    if (noteState.rels.list.length) put('word/_rels/footnotes.xml.rels', noteState.rels.xml());
  }
  const endState: WriteState = { ...st, rels: seeded('word/_rels/endnotes.xml.rels'), open: new Set() };
  if (Object.keys(doc.endnotes).length) {
    part('endnotes.xml', 'endnotes', `${CT}.endnotes+xml`, notesPart('endnote', doc.endnotes, endState));
    if (endState.rels.list.length) put('word/_rels/endnotes.xml.rels', endState.rels.xml());
  }
  if (Object.keys(doc.comments).length) {
    const cs: WriteState = { ...st, rels: seeded('word/_rels/comments.xml.rels'), open: new Set() };
    const { comments, extended } = commentsParts(doc, cs);
    part('comments.xml', 'comments', `${CT}.comments+xml`, comments);
    if (cs.rels.list.length) put('word/_rels/comments.xml.rels', cs.rels.xml());
    put('word/commentsExtended.xml', extended);
    docRels.add('http://schemas.microsoft.com/office/2011/relationships/commentsExtended', 'commentsExtended.xml');
    overrides.push(['/word/commentsExtended.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml']);
  }

  if (!docRels.list.some((r) => r.type.endsWith('/theme'))) {
    put('word/theme/theme1.xml', THEME);
    docRels.add(`${TYPE}/theme`, 'theme/theme1.xml');
    overrides.push(['/word/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml']);
  }

  const defaults = new Map<string, string>([['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml']]);
  charts.forEach((c, i) => {
    const book = `Workbook${i + 1}.xlsx`;
    const rels = new PartRels();
    const rid = rels.add(`${TYPE}/package`, `../embeddings/${book}`);
    put(`word/charts/${c.name}.xml`, chartPart(c.atom, rid));
    put(`word/charts/_rels/${c.name}.xml.rels`, rels.xml());
    files[`word/embeddings/${book}`] = chartWorkbook(c.atom);
    overrides.push([`/word/charts/${c.name}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml']);
    defaults.set('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
  for (const [key, item] of Object.entries(doc.media)) {
    const path = mediaPath(key);
    files[path] = item.data;
    defaults.set(path.split('.').pop()!.toLowerCase(), item.mime);
  }

  if (preserved) {
    const ctData = preserved.parts['[Content_Types].xml'];
    const known = new Set(overrides.map((o) => o[0]));
    for (const [k, v] of Object.entries(preserved.parts)) {
      if (REGENERATED.test(k)) continue;
      if (/^word\/_rels\/(header|footer)\d*\.xml\.rels$/.test(k) && files[k]) continue;
      if (/^word\/(header|footer)\d*\.xml$/.test(k)) continue;
      if (/^word\/_rels\/(footnotes|endnotes|comments)\.xml\.rels$/.test(k)) continue;
      if (!files[k]) files[k] = v;
    }
    if (ctData) {
      for (const n of kids(parseXml(strFromU8(ctData)))) {
        if (n.name.endsWith('Default')) {
          const ext = (n.attrs['Extension'] ?? '').toLowerCase();
          if (ext && !defaults.has(ext)) defaults.set(ext, n.attrs['ContentType'] ?? '');
        } else if (n.name.endsWith('Override')) {
          const pn = n.attrs['PartName'] ?? '';
          if (!known.has(pn) && files[pn.slice(1)]) overrides.push([pn, n.attrs['ContentType'] ?? '']);
        }
      }
    }
  }

  if (doc.sources?.length) {
    const esc = (v?: string) => escapeText(v ?? '');
    const person = (a: string) => { const [last, first] = a.split(',').map((x) => x.trim()); return `<b:Person><b:Last>${esc(last)}</b:Last>${first ? `<b:First>${esc(first)}</b:First>` : ''}</b:Person>`; };
    const opt = (t: string, v?: string) => (v ? `<b:${t}>${esc(v)}</b:${t}>` : '');
    const items = doc.sources.map((s) => `<b:Source><b:Tag>${esc(s.tag)}</b:Tag><b:SourceType>${esc(s.type)}</b:SourceType><b:Author><b:Author><b:NameList>${s.authors.map(person).join('')}</b:NameList></b:Author></b:Author>${opt('Title', s.title)}${opt('Year', s.year)}${opt('Publisher', s.publisher)}${opt('City', s.city)}${opt('JournalName', s.journal)}${opt('URL', s.url)}</b:Source>`).join('');
    put('customXml/itemSources.xml', `${HEAD}<b:Sources xmlns:b="${NS['b']}" SelectedStyle="" StyleName="">${items}</b:Sources>`);
    docRels.add(`${TYPE}/customXml`, '../customXml/itemSources.xml');
  }
  put('word/_rels/document.xml.rels', docRels.xml());
  put('[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...defaults].map(([e, t]) => `<Default Extension="${a(e)}" ContentType="${a(t)}"/>`).join('')}${overrides.map(([p, t]) => `<Override PartName="${a(p)}" ContentType="${a(t)}"/>`).join('')}</Types>`);

  const rootRels = [
    `<Relationship Id="rId1" Type="${TYPE}/officeDocument" Target="word/document.xml"/>`,
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    `<Relationship Id="rId3" Type="${TYPE}/extended-properties" Target="docProps/app.xml"/>`,
  ];
  put('_rels/.rels', `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rootRels.join('')}</Relationships>`);

  const pr = doc.properties;
  const el = (tag: string, v?: string) => (v ? `<${tag}>${escapeText(v)}</${tag}>` : '');
  const now = isoNow();
  put('docProps/core.xml', `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${el('dc:title', pr.title)}${el('dc:subject', pr.subject)}${el('dc:creator', pr.creator)}${el('cp:keywords', pr.keywords)}${el('dc:description', pr.description)}${el('cp:lastModifiedBy', pr.lastModifiedBy)}${el('cp:category', pr.category)}<dcterms:created xsi:type="dcterms:W3CDTF">${escapeText(pr.created ?? now)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  put('docProps/app.xml', `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ClerdoDraft</Application></Properties>`);

  return zipSync(files, { level: 6 });
};

void kid;
