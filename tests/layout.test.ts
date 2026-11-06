import { describe, expect, it } from 'vitest';
import { blankDoc } from '../src/core/defaults';
import { para, textRun, type Doc } from '../src/core/model';
import { createTable } from '../src/core/ops';
import { layoutDocument } from '../src/layout/paginate';
import type { FontSpec, Measurer } from '../src/layout/types';

const fake: Measurer = {
  width: (t: string, f: FontSpec) => t.length * f.size * 0.5,
  metrics: (f: FontSpec) => ({ ascent: f.size * 0.9, descent: f.size * 0.3 }),
};
const opts = { showDeleted: true, showHidden: false };
const lay = (d: Doc) => layoutDocument(d, fake, opts);

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('layout', () => {
  it('wraps text inside the column', () => {
    const d = { ...blankDoc(), blocks: [para([textRun(words(100))])] };
    const r = lay(d);
    const lines = r.pages[0]!.body.lines;
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) expect(l.textWidth).toBeLessThanOrEqual(468.01);
    expect(lines[0]!.from).toBe(0);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.from).toBe(lines[i - 1]!.to);
    expect(lines[lines.length - 1]!.to).toBe(d.blocks[0]!.type === 'p' ? d.blocks[0].runs[0]!.text.length : 0);
  });

  it('paginates long documents and stays inside margins', () => {
    const d = { ...blankDoc(), blocks: Array.from({ length: 60 }, () => para([textRun(words(40))])) };
    const r = lay(d);
    expect(r.pages.length).toBeGreaterThan(2);
    for (const p of r.pages) for (const l of p.body.lines) expect(l.y + l.height).toBeLessThanOrEqual(720.5);
  });

  it('honours explicit page breaks and section page size', () => {
    const d = { ...blankDoc(), blocks: [para([textRun('a\fb')])] };
    expect(lay(d).pages.length).toBe(2);
  });

  it('keeps a heading with the following paragraph', () => {
    const blocks = [
      ...Array.from({ length: 34 }, () => para([textRun('x')], { spaceAfter: 0 })),
      para([textRun('Heading')], { style: 'Heading1' }),
      para([textRun(words(30))]),
    ];
    const r = lay({ ...blankDoc(), blocks });
    const headingId = blocks[34]!.id;
    const nextId = blocks[35]!.id;
    const pageOf = (id: string) => r.lineIndex.get(id)![0]!.page;
    expect(pageOf(headingId)).toBe(pageOf(nextId));
  });

  it('lays out tables with repeated header rows across pages', () => {
    const t = createTable(80, 2, 468);
    t.rows[0] = { ...t.rows[0]!, props: { header: true } };
    const r = lay({ ...blankDoc(), blocks: [t, para()] });
    expect(r.pages.length).toBeGreaterThan(1);
    const headerPara = t.rows[0]!.cells[0]!.blocks[0]!.id;
    expect(r.lineIndex.get(headerPara)!.length).toBe(r.pages.length);
  });

  it('places footnotes on the page of their reference and reduces the body', () => {
    const base = blankDoc();
    const d: Doc = { ...base, footnotes: { '1': { id: '1', blocks: [para([textRun('note')], { style: 'FootnoteText' })] } }, blocks: [para([textRun('text'), { text: '￼', props: {}, atom: { kind: 'footnote', id: '1' } }])] };
    const r = lay(d);
    expect(r.pages[0]!.notes.length).toBe(1);
    expect(r.pages[0]!.notes[0]!.y).toBeGreaterThan(600);
  });

  it('uses columns', () => {
    const d = blankDoc();
    const r = lay({ ...d, section: { ...d.section, columns: { count: 2, space: 36 } }, blocks: Array.from({ length: 50 }, () => para([textRun(words(30))])) });
    const xs = new Set(r.pages[0]!.body.lines.map((l) => Math.round(l.x)));
    expect(xs.size).toBe(2);
  });

  it('numbers lists and renders the label', () => {
    const d = blankDoc();
    const numbered = { ...d, numbering: { abstracts: { a: { id: 'a', levels: [{ start: 1, format: 'decimal', text: '%1.', paraProps: { indentLeft: 36, firstLine: -18 } }] } }, instances: { n: { id: 'n', abstractId: 'a' } } }, blocks: [para([textRun('one')], { numbering: { numId: 'n', level: 0 } }), para([textRun('two')], { numbering: { numId: 'n', level: 0 } })] };
    const r = lay(numbered);
    expect(r.pages[0]!.body.lines.map((l) => l.label?.text)).toEqual(['1.', '2.']);
  });

  it('justifies all but the last line', () => {
    const d = { ...blankDoc(), blocks: [para([textRun(words(60))], { align: 'justify' })] };
    const ls = lay(d).pages[0]!.body.lines;
    expect(ls[0]!.wordSpacing).toBeGreaterThan(0);
    expect(ls[ls.length - 1]!.wordSpacing).toBe(0);
  });
});
