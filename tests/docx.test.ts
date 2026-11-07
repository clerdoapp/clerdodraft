import { office, officeWorks } from './office';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankDoc } from '../src/core/defaults';
import { ATOM_CHAR, para, textRun, type Block, type Doc, type Paragraph } from '../src/core/model';
import { createTable } from '../src/core/ops';
import { readDocx, writeDocx } from '../src/docx';
import { parseDiagram } from '../src/docx/charts';
import { NS, parseXml } from '../src/docx/xml';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const rev = { id: '7', author: 'Sara', date: '2026-01-02T03:04:05Z' };

const kitchenSink = (): Doc => {
  const d = blankDoc();
  const t = createTable(3, 3, 468);
  t.rows[0] = { ...t.rows[0]!, props: { header: true, cantSplit: true }, cells: [{ ...t.rows[0]!.cells[0]!, props: { ...t.rows[0]!.cells[0]!.props, gridSpan: 2, shading: '#ffee00' }, blocks: [para([textRun('merged')])] }, t.rows[0]!.cells[2]!] };
  t.rows[1]!.cells[0]!.blocks = [createTable(1, 1, 100), para()];
  t.rows[1]!.cells[1]!.props = { vMerge: 'restart', width: 156 };
  t.rows[2]!.cells[1]!.props = { vMerge: 'continue', width: 156 };
  const secPara = para([textRun('end of section one')]);
  secPara.section = { ...d.section, columns: { count: 2, space: 24 }, headers: { default: 'header1', first: 'header2' }, footers: { default: 'footer1' }, titlePage: true, pageNumbers: { start: 5, format: 'lowerRoman' } };
  const link = para([{ text: 'site', props: { bold: true }, link: { href: 'https://example.com/a?b=1&c=2' } }, { text: 'jump', props: {}, link: { anchor: 'mark1' } }]);
  link.bookmarks = [{ name: 'mark1', start: 1, end: 3 }];
  return {
    ...d,
    blocks: [
      para([textRun('Heading')], { style: 'Heading1' }),
      para([textRun('bold', { bold: true }), textRun(' italic', { italic: true, size: 14, color: '#336699' }), textRun(' under', { underline: 'double', highlight: '#ffff00' }), textRun('\ttab\nbreak'), textRun(' sup', { vertAlign: 'super' }), textRun('caps', { smallCaps: true, spacing: 1 })], { align: 'justify', spaceBefore: 6, spaceAfter: 3, indentLeft: 18, firstLine: -9, lineSpacing: { rule: 'exact', value: 14 }, tabs: [{ pos: 100, kind: 'right', leader: 'dot' }] }),
      para([textRun('kept'), { text: 'added', props: {}, ins: rev }, { text: 'gone', props: {}, del: rev }]),
      para([{ text: 'commented', props: {}, comments: ['1'] }, textRun(' plain')]),
      para([textRun('note'), { text: ATOM_CHAR, props: {}, atom: { kind: 'footnote', id: '1' } }, { text: ATOM_CHAR, props: {}, atom: { kind: 'endnote', id: '1' } }]),
      para([textRun('page '), { text: ATOM_CHAR, props: {}, atom: { kind: 'field', field: 'page', instr: 'PAGE', result: '1' } }]),
      para([{ text: ATOM_CHAR, props: {}, atom: { kind: 'image', media: 'word/media/a.png', width: 100, height: 50, wrap: 'inline', alt: 'dot' } }]),
      para([{ text: ATOM_CHAR, props: {}, atom: { kind: 'image', media: 'word/media/a.png', width: 60, height: 40, wrap: 'square', float: { relH: 'margin', relV: 'paragraph', x: 10, y: 20 } } }, textRun('wrapped')]),
      para([textRun('مرحبا بالعالم', { rtl: true })], { bidi: true }),
      para([textRun('item')], { numbering: { numId: '1', level: 0 } }),
      link,
      secPara,
      t,
      para([textRun('last')]),
    ],
    numbering: { abstracts: { '0': { id: '0', levels: [{ start: 1, format: 'decimal', text: '%1.', align: 'left', suffix: 'tab', paraProps: { indentLeft: 36, firstLine: -18 } }] } }, instances: { '1': { id: '1', abstractId: '0' } } },
    headers: { header1: [para([textRun('head')], { style: 'Header' })], header2: [para([textRun('first head')], { style: 'Header' })] },
    footers: { footer1: [para([textRun('foot'), { text: ATOM_CHAR, props: {}, atom: { kind: 'field', field: 'numpages', instr: 'NUMPAGES', result: '3' } }], { style: 'Footer' })] },
    footnotes: { '1': { id: '1', blocks: [para([textRun('the note')], { style: 'FootnoteText' })] } },
    endnotes: { '1': { id: '1', blocks: [para([textRun('the endnote')], { style: 'EndnoteText' })] } },
    comments: { '1': { id: '1', author: 'Sara', initials: 'S', date: rev.date, blocks: [para([textRun('please check')])] }, '2': { id: '2', author: 'Ali', date: rev.date, parent: '1', resolved: true, blocks: [para([textRun('done')])] } },
    media: { 'word/media/a.png': { mime: 'image/png', data: PNG } },
    settings: { defaultTabStop: 36, trackChanges: true, evenAndOddHeaders: true },
    properties: { title: 'Sink & co', creator: 'Sara' },
  };
};

const strip = (b: Block[]): unknown =>
  b.map((x) =>
    x.type === 'p'
      ? { t: 'p', props: x.props, section: x.section ?? null, marks: x.bookmarks ?? null, runs: x.runs.map((r) => ({ text: r.text, props: r.props, atom: r.atom ?? null, link: r.link ? { href: r.link.href, anchor: r.link.anchor } : null, ins: r.ins?.author ?? null, del: r.del?.author ?? null, c: r.comments ?? null })) }
      : x.type === 'tbl'
        ? { t: 'tbl', grid: x.grid, props: x.props, rows: x.rows.map((r) => ({ props: r.props, cells: r.cells.map((c) => ({ props: c.props, blocks: strip(c.blocks) })) })) }
        : x);

const round = (d: Doc) => readDocx(writeDocx(d));

describe('.docx round trip', () => {
  it('keeps body content exactly through two passes', () => {
    const once = round(kitchenSink());
    const twice = round(once);
    expect(strip(twice.blocks)).toEqual(strip(once.blocks));
    expect(twice.section).toEqual(once.section);
  });

  it('keeps every kind of content', () => {
    const d = round(kitchenSink());
    const ps = d.blocks.filter((b): b is Paragraph => b.type === 'p');
    expect(ps[0]!.props.style).toBe('Heading1');
    const fmt = ps[1]!;
    expect(fmt.runs[0]).toMatchObject({ text: 'bold', props: { bold: true } });
    expect(fmt.runs[1]!.props).toMatchObject({ italic: true, size: 14, color: '#336699' });
    expect(fmt.runs[2]!.props).toMatchObject({ underline: 'double', highlight: '#ffff00' });
    expect(fmt.props).toMatchObject({ align: 'justify', spaceBefore: 6, spaceAfter: 3, indentLeft: 18, firstLine: -9, lineSpacing: { rule: 'exact', value: 14 } });
    expect(fmt.props.tabs).toEqual([{ pos: 100, kind: 'right', leader: 'dot' }]);
    expect(fmt.runs.map((r) => r.text).join('')).toContain('\ttab\nbreak');
    expect(ps[2]!.runs.map((r) => [r.text, r.ins?.author, r.del?.author])).toEqual([['kept', undefined, undefined], ['added', 'Sara', undefined], ['gone', undefined, 'Sara']]);
    expect(ps[3]!.runs[0]!.comments).toEqual(['1']);
    expect(d.comments['1']!.author).toBe('Sara');
    expect(d.comments['2']!.parent).toBe('1');
    expect(d.comments['2']!.resolved).toBe(true);
    expect(ps[4]!.runs.filter((r) => r.atom).map((r) => r.atom!.kind)).toEqual(['footnote', 'endnote']);
    expect(d.footnotes['1']!.blocks[0]!.type).toBe('p');
    const fn = d.footnotes['1']!.blocks[0] as Paragraph;
    expect(fn.runs.map((r) => r.text).join('')).toBe('the note');
    expect(ps[5]!.runs[1]!.atom).toMatchObject({ kind: 'field', field: 'page', instr: 'PAGE' });
    const img = ps[6]!.runs[0]!.atom!;
    expect(img).toMatchObject({ kind: 'image', wrap: 'inline', alt: 'dot' });
    expect(ps[7]!.runs[0]!.atom).toMatchObject({ kind: 'image', wrap: 'square', float: { relH: 'margin', x: 10, y: 20 } });
    expect(ps[8]!.props.bidi).toBe(true);
    expect(ps[8]!.runs[0]!.text).toBe('مرحبا بالعالم');
    expect(ps[9]!.props.numbering).toEqual({ numId: '1', level: 0 });
    expect(ps[10]!.runs[0]!.link?.href).toBe('https://example.com/a?b=1&c=2');
    expect(ps[10]!.runs[1]!.link?.anchor).toBe('mark1');
    expect(ps[10]!.bookmarks).toEqual([{ name: 'mark1', start: 1, end: 3 }]);
    expect(ps[11]!.section).toMatchObject({ titlePage: true, columns: { count: 2, space: 24 }, pageNumbers: { start: 5, format: 'lowerRoman' } });
    expect(Object.keys(d.headers)).toHaveLength(2);
    expect(d.settings).toMatchObject({ trackChanges: true, evenAndOddHeaders: true });
    expect(d.properties.title).toBe('Sink & co');
    const tbl = d.blocks.find((b) => b.type === 'tbl')!;
    if (tbl.type === 'tbl') {
      expect(tbl.rows[0]!.props).toMatchObject({ header: true, cantSplit: true });
      expect(tbl.rows[0]!.cells[0]!.props).toMatchObject({ gridSpan: 2, shading: '#ffee00' });
      expect(tbl.rows[1]!.cells[0]!.blocks[0]!.type).toBe('tbl');
      expect(tbl.rows[1]!.cells[1]!.props.vMerge).toBe('restart');
      expect(tbl.rows[2]!.cells[1]!.props.vMerge).toBe('continue');
    }
  });

  it('keeps sources in the standard bibliography part', () => {
    const d = { ...blankDoc(), sources: [{ tag: 'Smi24', type: 'Book', title: 'A & B', authors: ['Smith, Sara'], year: '2024', publisher: 'Press' }] };
    expect(round(round(d)).sources).toEqual([{ tag: 'Smi24', type: 'Book', title: 'A & B', authors: ['Smith, Sara'], year: '2024', publisher: 'Press', city: undefined, journal: undefined, url: undefined }]);
  });

  it('saves charts with their data and reads them back', () => {
    const d = blankDoc();
    const chart = { kind: 'chart' as const, chart: 'column' as const, title: 'Sales & costs', categories: ['Q1', 'Q2'], series: [{ name: 'Sales', values: [3, 4.5], color: '#2347ff' }, { name: 'Costs', values: [1, 2] }], width: 300, height: 200, wrap: 'inline' as const };
    const back = round({ ...d, blocks: [para([{ text: ATOM_CHAR, props: {}, atom: chart }])] });
    const a = (back.blocks[0] as Paragraph).runs[0]!.atom!;
    expect(a).toMatchObject({ kind: 'chart', chart: 'column', title: 'Sales & costs', categories: ['Q1', 'Q2'], width: 300, height: 200 });
    if (a.kind === 'chart') expect(a.series[0]).toMatchObject({ name: 'Sales', values: [3, 4.5], color: '#2347ff' });
    const twice = round(back);
    expect((twice.blocks[0] as Paragraph).runs[0]!.atom).toMatchObject({ kind: 'chart', title: 'Sales & costs' });
    expect(Object.keys(twice.preserved!.parts).some((k) => k.endsWith('.xlsx'))).toBe(true);
  });

  it('keeps text box text and follows edits made in the app', () => {
    const d = blankDoc();
    const inner = para([textRun('inside the box', { bold: true })]);
    const box = { kind: 'shape' as const, shape: 'roundRect', width: 200, height: 90, fill: '#ffeeaa', stroke: '#112233', textId: 'b1', wrap: 'square' as const, float: { relH: 'page' as const, relV: 'page' as const, x: 100, y: 120 } };
    const back = round({ ...d, boxes: { b1: [inner] }, blocks: [para([{ text: ATOM_CHAR, props: {}, atom: box }, textRun('wrapped')])] });
    const a = (back.blocks[0] as Paragraph).runs[0]!.atom!;
    if (a.kind !== 'shape' || !a.textId) throw new Error('shape lost');
    expect(a).toMatchObject({ shape: 'roundRect', fill: '#ffeeaa', stroke: '#112233', wrap: 'square' });
    expect((back.boxes![a.textId]![0] as Paragraph).runs[0]).toMatchObject({ text: 'inside the box', props: { bold: true } });
    const edited: Doc = { ...back, boxes: { [a.textId]: [para([textRun('changed text')])] }, blocks: [para([{ text: ATOM_CHAR, props: {}, atom: { ...a, width: 250, float: { ...a.float!, x: 30 } } }])] };
    const again = round(edited);
    const b = (again.blocks[0] as Paragraph).runs[0]!.atom!;
    if (b.kind !== 'shape') throw new Error('shape lost');
    expect(b.width).toBe(250);
    expect(b.float?.x).toBe(30);
    expect((again.boxes![b.textId!]![0] as Paragraph).runs[0]!.text).toBe('changed text');
  });

  it('draws diagrams from their saved drawing part', () => {
    const x = parseXml(`<dsp:drawing xmlns:dsp="${NS['dsp']}" xmlns:a="${NS['a']}"><dsp:spTree><dsp:sp><dsp:spPr><a:xfrm><a:off x="12700" y="25400"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:prstGeom prst="roundRect"/><a:solidFill><a:srgbClr val="2347FF"/></a:solidFill></dsp:spPr><dsp:txBody><a:p><a:r><a:rPr sz="1200"/><a:t>Step one</a:t></a:r></a:p></dsp:txBody></dsp:sp></dsp:spTree></dsp:drawing>`);
    expect(parseDiagram(x, {})).toEqual([expect.objectContaining({ x: 1, y: 2, w: 10, h: 5, prst: 'roundRect', fill: '#2347ff', text: 'Step one', size: 12 })]);
  });

  it('rejects files that are not documents', () => {
    expect(() => readDocx(new TextEncoder().encode('hello'))).toThrow(/valid \.docx/);
  });

  it('writes no other product name into the file', () => {
    const files = new TextDecoder('latin1').decode(writeDocx(blankDoc()));
    expect(files).not.toMatch(/Microsoft Office/);
  });

  it('is accepted by independent readers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-'));
    const f = join(dir, 'sink.docx');
    writeFileSync(f, writeDocx(kitchenSink()));
    const blank = join(dir, 'blank.docx');
    writeFileSync(blank, writeDocx(blankDoc()));
    const py = execFileSync('python3', ['-c', `import docx,sys\nd=docx.Document(sys.argv[1]);print(len(d.paragraphs),len(d.tables))\ndocx.Document(sys.argv[2])`, f, blank]).toString();
    expect(py.trim()).toMatch(/^\d+ 1$/);
    if (!officeWorks) return;
    office(['--headless', '--convert-to', 'pdf', '--outdir', dir, f]);
    expect(readFileSync(join(dir, 'sink.pdf')).length).toBeGreaterThan(1000);
  }, 180000);

  it('reads a document produced by another writer and keeps unknown parts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-'));
    const f = join(dir, 'py.docx');
    execFileSync('python3', ['-c', `import docx,sys\nd=docx.Document();d.add_heading('Hello',1);d.add_paragraph('World');t=d.add_table(2,2);t.cell(0,0).text='x';d.save(sys.argv[1])`, f]);
    const doc = readDocx(new Uint8Array(readFileSync(f)));
    expect(doc.blocks.some((b) => b.type === 'tbl')).toBe(true);
    const again = readDocx(writeDocx(doc));
    expect(strip(again.blocks)).toEqual(strip(doc.blocks));
    expect(Object.keys(again.styles.styles).length).toBeGreaterThan(5);
    const p = join(dir, 'out.docx');
    writeFileSync(p, writeDocx(doc));
    execFileSync('python3', ['-c', `import docx,sys\nd=docx.Document(sys.argv[1]);assert d.paragraphs[0].text=='Hello'`, p]);
  });
});
