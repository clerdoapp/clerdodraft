import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Block, Doc, Paragraph, ParaProps, Run, RunProps } from '../core/model';
import { para } from '../core/model';
import { headingLevel } from '../core/styles';
import { escapeAttr, escapeText, kid, kids, parseXml, textOf, type XNode } from '../docx/xml';
import { DocBuilder, makeTable } from './build';

interface Named { run: RunProps; para: ParaProps; parent?: string }

const length = (v?: string): number | undefined => {
  const m = /^(-?[\d.]+)(pt|in|cm|mm|px)?$/.exec(v ?? '');
  if (!m) return undefined;
  const n = Number(m[1]);
  return { pt: n, in: n * 72, cm: (n * 72) / 2.54, mm: (n * 72) / 25.4, px: n * 0.75 }[m[2] ?? 'pt'];
};

const readStyles = (root: XNode | undefined, out: Map<string, Named>): void => {
  for (const s of kids(root, 'style:style')) {
    const t = kid(s, 'style:text-properties')?.attrs ?? {};
    const p = kid(s, 'style:paragraph-properties')?.attrs ?? {};
    const run: RunProps = {};
    if (t['fo:font-weight'] === 'bold') run.bold = true;
    if (t['fo:font-style'] === 'italic') run.italic = true;
    if (t['style:text-underline-style'] && t['style:text-underline-style'] !== 'none') run.underline = 'single';
    if (t['style:text-line-through-style'] && t['style:text-line-through-style'] !== 'none') run.strike = true;
    if (/^#[0-9a-f]{6}$/i.test(t['fo:color'] ?? '')) run.color = t['fo:color']!;
    if (/^#[0-9a-f]{6}$/i.test(t['fo:background-color'] ?? '')) run.highlight = t['fo:background-color']!;
    const size = length(t['fo:font-size']);
    if (size) run.size = size;
    const font = t['style:font-name'] ?? t['fo:font-family'];
    if (font) run.font = font.replace(/['"]/g, '');
    if (t['style:text-position']?.startsWith('super')) run.vertAlign = 'super';
    if (t['style:text-position']?.startsWith('sub')) run.vertAlign = 'sub';
    const pp: ParaProps = {};
    const align = p['fo:text-align'];
    if (align === 'center') pp.align = 'center';
    if (align === 'end' || align === 'right') pp.align = 'right';
    if (align === 'justify') pp.align = 'justify';
    const left = length(p['fo:margin-left']);
    if (left) pp.indentLeft = left;
    const right = length(p['fo:margin-right']);
    if (right) pp.indentRight = right;
    const first = length(p['fo:text-indent']);
    if (first) pp.firstLine = first;
    const before = length(p['fo:margin-top']);
    if (before !== undefined) pp.spaceBefore = before;
    const after = length(p['fo:margin-bottom']);
    if (after !== undefined) pp.spaceAfter = after;
    if (p['style:writing-mode'] === 'rl-tb') pp.bidi = true;
    if (p['fo:break-before'] === 'page') pp.pageBreakBefore = true;
    if (s.attrs['style:name']) out.set(s.attrs['style:name'], { run, para: pp, parent: s.attrs['style:parent-style-name'] });
  }
};

export const readOdt = (bytes: Uint8Array): Doc => {
  const files = unzipSync(bytes);
  const content = files['content.xml'];
  if (!content) throw new Error('This file is not a valid text document.');
  const root = parseXml(strFromU8(content));
  const docNode = kid(root, 'office:document-content') ?? root;
  const styles = new Map<string, Named>();
  if (files['styles.xml']) {
    const sr = parseXml(strFromU8(files['styles.xml']));
    readStyles(kid(sr, 'office:styles'), styles);
    readStyles(kid(sr, 'office:automatic-styles'), styles);
  }
  readStyles(kid(docNode, 'office:automatic-styles'), styles);
  const listKinds = new Map<string, 'bullet' | 'number'>();
  for (const l of kids(kid(docNode, 'office:automatic-styles'), 'text:list-style')) listKinds.set(l.attrs['style:name'] ?? '', kid(l, 'text:list-level-style-number') ? 'number' : 'bullet');

  const resolve = (name?: string, seen = 0): Named => {
    const s = name ? styles.get(name) : undefined;
    if (!s || seen > 8) return { run: {}, para: {} };
    const up = resolve(s.parent, seen + 1);
    return { run: { ...up.run, ...s.run }, para: { ...up.para, ...s.para } };
  };

  const b = new DocBuilder();

  const inline = (n: XNode, props: RunProps, href?: string): Run[] =>
    n.children.flatMap((c): Run[] => {
      if (typeof c === 'string') return c ? [{ text: c.replace(/\s+/g, ' '), props, ...(href ? { link: { href } } : {}) }] : [];
      switch (c.name) {
        case 'text:span': return inline(c, { ...props, ...resolve(c.attrs['text:style-name']).run }, href);
        case 'text:a': {
          const h = c.attrs['xlink:href'] ?? '';
          return inline(c, /^(https?:|mailto:|#)/i.test(h) ? { ...props, color: '#2347ff', underline: 'single' } : props, /^(https?:|mailto:|#)/i.test(h) ? h : href);
        }
        case 'text:s': return [{ text: ' '.repeat(Number(c.attrs['text:c'] ?? 1)), props }];
        case 'text:tab': return [{ text: '\t', props }];
        case 'text:line-break': return [{ text: '\n', props }];
        case 'draw:frame': {
          const img = kid(c, 'draw:image');
          const path = img?.attrs['xlink:href'];
          const data = path ? files[path.replace(/^\.\//, '')] : undefined;
          if (!data) return [];
          return [b.image({ mime: /\.jpe?g$/i.test(path!) ? 'image/jpeg' : /\.gif$/i.test(path!) ? 'image/gif' : 'image/png', data, width: length(c.attrs['svg:width']) ?? 300, height: length(c.attrs['svg:height']) ?? 200 })];
        }
        case 'text:note': case 'office:annotation': case 'text:bookmark': case 'text:bookmark-start': case 'text:bookmark-end': case 'text:soft-page-break': return [];
        default: return c.children.length ? inline(c, props, href) : textOf(c) ? [{ text: textOf(c), props }] : [];
      }
    });

  const paragraphOf = (n: XNode, extra: ParaProps = {}): Paragraph => {
    const s = resolve(n.attrs['text:style-name']);
    const level = n.name === 'text:h' ? Math.min(6, Number(n.attrs['text:outline-level'] ?? 1)) : 0;
    const runs = inline(n, level ? {} : s.run).filter((r) => r.text);
    return para(runs, { ...s.para, ...extra, ...(level ? { style: `Heading${level}` } : {}) });
  };

  const listItems = (n: XNode, kind: 'bullet' | 'number', level: number, into: Block[]): void => {
    const numId = b.list(kind);
    for (const li of kids(n, 'text:list-item')) {
      for (const c of li.children) {
        if (typeof c === 'string') continue;
        if (c.name === 'text:p' || c.name === 'text:h') into.push(paragraphOf(c, { numbering: { numId, level: Math.min(8, level) } }));
        if (c.name === 'text:list') listItems(c, kind, level + 1, into);
      }
    }
  };

  const blocksOf = (n: XNode): Block[] => {
    const out: Block[] = [];
    for (const c of n.children) {
      if (typeof c === 'string') continue;
      if (c.name === 'text:p' || c.name === 'text:h') out.push(paragraphOf(c));
      else if (c.name === 'text:list') listItems(c, listKinds.get(c.attrs['text:style-name'] ?? '') ?? 'bullet', 0, out);
      else if (c.name === 'table:table') {
        const rows: Block[][][] = kids(c, 'table:table-row').map((r) => kids(r, 'table:table-cell').map(blocksOf));
        if (rows.length) out.push(makeTable(rows));
      } else if (c.name === 'text:section') out.push(...blocksOf(c));
    }
    return out;
  };

  const text = kid(kid(docNode, 'office:body'), 'office:text');
  if (!text) throw new Error('This file is not a valid text document.');
  b.blocks = blocksOf(text);
  return b.finish();
};

const OFFICE_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"';

export const writeOdt = (doc: Doc): Uint8Array => {
  const auto: string[] = [];
  const known = new Map<string, string>();
  const styleFor = (family: 'text' | 'paragraph', props: string): string => {
    const key = `${family}|${props}`;
    let name = known.get(key);
    if (!name) {
      name = `${family === 'text' ? 'T' : 'P'}${known.size + 1}`;
      known.set(key, name);
      auto.push(`<style:style style:name="${name}" style:family="${family}">${props}</style:style>`);
    }
    return name;
  };
  const media: Record<string, Uint8Array> = {};

  const runXml = (r: Run): string => {
    const a = r.atom;
    if (a?.kind === 'image') {
      const m = doc.media[a.media];
      if (!m) return '';
      const path = `Pictures/${a.media.split('/').pop()}`;
      media[path] = m.data;
      return `<draw:frame text:anchor-type="as-char" svg:width="${a.width}pt" svg:height="${a.height}pt"><draw:image xlink:href="${escapeAttr(path)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    }
    const raw = a ? (a.kind === 'field' ? a.result : '') : r.text;
    const body = escapeText(raw).replace(/\n/g, '<text:line-break/>').replace(/\t/g, '<text:tab/>').replace(/[\f\v]/g, '').replace(/ {2,}/g, (s) => ` <text:s text:c="${s.length - 1}"/>`);
    const q = r.props;
    let t = '';
    if (q.bold) t += ' fo:font-weight="bold"';
    if (q.italic) t += ' fo:font-style="italic"';
    if (q.underline && q.underline !== 'none') t += ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"';
    if (q.strike) t += ' style:text-line-through-style="solid"';
    if (q.color) t += ` fo:color="${escapeAttr(q.color)}"`;
    if (q.highlight) t += ` fo:background-color="${escapeAttr(q.highlight)}"`;
    if (q.size) t += ` fo:font-size="${q.size}pt"`;
    if (q.font) t += ` fo:font-family="${escapeAttr(q.font)}"`;
    if (q.vertAlign) t += ` style:text-position="${q.vertAlign} 58%"`;
    const inner = t ? `<text:span text:style-name="${styleFor('text', `<style:text-properties${t}/>`)}">${body}</text:span>` : body;
    return r.link?.href ? `<text:a xlink:type="simple" xlink:href="${escapeAttr(r.link.href)}">${inner}</text:a>` : inner;
  };

  const paraXml = (p: Paragraph): string => {
    const q = p.props;
    let a = '';
    if (q.align) a += ` fo:text-align="${q.align === 'right' ? 'end' : q.align === 'left' ? 'start' : q.align}"`;
    if (q.indentLeft) a += ` fo:margin-left="${q.indentLeft}pt"`;
    if (q.indentRight) a += ` fo:margin-right="${q.indentRight}pt"`;
    if (q.firstLine) a += ` fo:text-indent="${q.firstLine}pt"`;
    if (q.spaceBefore !== undefined) a += ` fo:margin-top="${q.spaceBefore}pt"`;
    if (q.spaceAfter !== undefined) a += ` fo:margin-bottom="${q.spaceAfter}pt"`;
    if (q.bidi) a += ' style:writing-mode="rl-tb"';
    const style = a ? ` text:style-name="${styleFor('paragraph', `<style:paragraph-properties${a}/>`)}"` : '';
    const body = p.runs.filter((r) => !r.del).map(runXml).join('');
    const level = headingLevel(doc, p);
    return level ? `<text:h text:outline-level="${level}"${style}>${body}</text:h>` : `<text:p${style}>${body}</text:p>`;
  };

  const blockXml = (b: Block): string => {
    if (b.type === 'p') return paraXml(b);
    if (b.type !== 'tbl') return '';
    const cols = b.grid.map(() => '<table:table-column/>').join('');
    return `<table:table>${cols}${b.rows.map((r) => `<table:table-row>${r.cells.map((c) => `<table:table-cell office:value-type="string">${c.blocks.map(blockXml).join('')}</table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table>`;
  };

  const body = doc.blocks.map(blockXml).join('');
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${OFFICE_NS} office:version="1.3"><office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const entries = Object.keys(media).map((p) => `<manifest:file-entry manifest:full-path="${escapeAttr(p)}" manifest:media-type="image/${/jpe?g$/i.test(p) ? 'jpeg' : 'png'}"/>`).join('');
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>${entries}</manifest:manifest>`;
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
    'content.xml': strToU8(content),
    'META-INF/manifest.xml': strToU8(manifest),
  };
  for (const [p, d] of Object.entries(media)) files[p] = [d, { level: 0 }];
  return zipSync(files);
};
