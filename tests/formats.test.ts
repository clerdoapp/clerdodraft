import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankDoc } from '../src/core/defaults';
import { para, textRun, type Doc, type Paragraph } from '../src/core/model';
import { createTable } from '../src/core/ops';
import { applyThemeToDoc, THEMES } from '../src/features/themes';
import { readMarkdown } from '../src/formats/markdown';
import { readOdt, writeOdt } from '../src/formats/odt';
import { readRtf, writeRtf } from '../src/formats/rtf';
import { decodeText, readText } from '../src/formats/text';
import { layoutDocument } from '../src/layout/paginate';
import type { FontSpec, Measurer } from '../src/layout/types';
import { readDoc } from '../src/formats/doc';

const fake: Measurer = { width: (t, f: FontSpec) => t.replaceAll('­', '').length * f.size * 0.5, metrics: (f) => ({ ascent: f.size * 0.9, descent: f.size * 0.3 }) };
const opts = { showDeleted: true, showHidden: false };
const textOf = (d: Doc): string[] => d.blocks.flatMap((b) => (b.type === 'p' ? [b.runs.map((r) => r.text).join('')] : []));
const has = (cmd: string): boolean => { try { execFileSync('which', [cmd]); return true; } catch { return false; } };

const sample = (): Doc => {
  const t = createTable(2, 2, 400);
  t.rows[0]!.cells[0]!.blocks = [para([textRun('cell one')])];
  return { ...blankDoc(), blocks: [
    para([textRun('Heading text')], { style: 'Heading1' }),
    para([textRun('Plain '), textRun('bold', { bold: true }), textRun(' and '), textRun('أهلا', { italic: true, color: '#c00000' })], { align: 'center' }),
    t,
    para([textRun('after the table')]),
  ] };
};

describe('hyphenation', () => {
  const long = 'international organization representative responsibilities extraordinary characteristics '.repeat(8);
  const doc = (auto: boolean): Doc => ({ ...blankDoc(), settings: { defaultTabStop: 36, autoHyphenation: auto || undefined }, blocks: [para([textRun(long)])] });

  it('breaks words at the line end when turned on', () => {
    const on = layoutDocument(doc(true), fake, opts).pages[0]!.body.lines;
    const off = layoutDocument(doc(false), fake, opts).pages[0]!.body.lines;
    expect(off.some((l) => l.frags.some((f) => f.kind === 'hyphen'))).toBe(false);
    expect(on.some((l) => l.frags.some((f) => f.kind === 'hyphen'))).toBe(true);
    expect(on.length).toBeLessThanOrEqual(off.length);
    for (let i = 1; i < on.length; i++) expect(on[i]!.from).toBe(on[i - 1]!.to);
    expect(on[on.length - 1]!.to).toBe(long.length);
    for (const l of on) expect(l.frags.reduce((s, f) => s + f.width, 0) - 12).toBeLessThanOrEqual(468.01 + 12);
  });

  it('uses optional hyphens even when automatic hyphens are off', () => {
    const word = 'x'.repeat(40);
    const d: Doc = { ...blankDoc(), blocks: [para([textRun(`${'a '.repeat(70)}${word}­${word}`)])] };
    const lines = layoutDocument(d, fake, opts).pages[0]!.body.lines;
    expect(lines.length).toBeGreaterThan(1);
  });

  it('keeps every word after a long word is split', () => {
    const d: Doc = { ...blankDoc(), blocks: [para([textRun(`${'y'.repeat(300)} end`)])] };
    const lines = layoutDocument(d, fake, opts).pages[0]!.body.lines;
    expect(lines[lines.length - 1]!.frags.map((f) => f.text).join('')).toContain('end');
  });
});

describe('rich text', () => {
  it('reads formatting, unicode, tables and colors', () => {
    const d = readRtf("{\\rtf1\\ansi\\ansicpg1256{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red255\\green0\\blue0;}\\pard\\qc\\b Bold\\b0  \\cf1 red\\cf0  caf\\'e9 \\u1571?\\par\\trowd\\cellx1000\\cellx2000\\intbl A\\cell B\\cell\\row\\pard tail\\par}");
    const p = d.blocks[0] as Paragraph;
    expect(p.props.align).toBe('center');
    expect(p.runs[0]).toMatchObject({ text: 'Bold', props: { bold: true } });
    expect(p.runs.some((r) => r.props.color === '#ff0000')).toBe(true);
    expect(textOf(d)[0]).toContain('أ');
    expect(d.blocks[1]!.type).toBe('tbl');
    expect(textOf(d)[1]).toBe('tail');
  });

  it('survives a save and reopen', () => {
    const d = readRtf(writeRtf(sample()));
    expect(textOf(d)).toEqual(['Heading text', 'Plain bold and أهلا', 'after the table']);
    expect(d.blocks.some((b) => b.type === 'tbl')).toBe(true);
  });
});

describe('open document', () => {
  it('survives a save and reopen', () => {
    const d = readOdt(writeOdt(sample()));
    expect(textOf(d)).toEqual(['Heading text', 'Plain bold and أهلا', 'after the table']);
    expect((d.blocks[0] as Paragraph).props.style).toBe('Heading1');
    expect((d.blocks[1] as Paragraph).runs.some((r) => r.props.bold)).toBe(true);
    expect((d.blocks[1] as Paragraph).props.align).toBe('center');
    const t = d.blocks.find((b) => b.type === 'tbl');
    expect(t?.type === 'tbl' && t.rows.length).toBe(2);
  });

  it.runIf(has('soffice'))('opens in another word processor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'odt-'));
    writeFileSync(join(dir, 'a.odt'), writeOdt(sample()));
    execFileSync('soffice', ['--headless', '--convert-to', 'txt:Text', '--outdir', dir, join(dir, 'a.odt')], { stdio: 'ignore', timeout: 60000 });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toContain('after the table');
  }, 70000);

  it.runIf(has('soffice'))('reads files saved elsewhere, including the older binary format', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conv-'));
    writeFileSync(join(dir, 'a.rtf'), writeRtf(sample()));
    execFileSync('soffice', ['--headless', '--convert-to', 'doc', '--outdir', dir, join(dir, 'a.rtf')], { stdio: 'ignore', timeout: 60000 });
    execFileSync('soffice', ['--headless', '--convert-to', 'odt', '--outdir', dir, join(dir, 'a.rtf')], { stdio: 'ignore', timeout: 60000 });
    const fromOdt = readOdt(new Uint8Array(readFileSync(join(dir, 'a.odt'))));
    expect(textOf(fromOdt)).toContain('after the table');
    expect(fromOdt.blocks.some((b) => b.type === 'tbl')).toBe(true);
    const fromDoc = readDoc(new Uint8Array(readFileSync(join(dir, 'a.doc'))));
    expect(textOf(fromDoc).join('\n')).toContain('after the table');
    expect(fromDoc.blocks.some((b) => b.type === 'tbl')).toBe(true);
  }, 120000);
});

describe('text and markdown', () => {
  it('reads plain text in any common encoding', () => {
    expect(textOf(readText('a\r\nb'))).toEqual(['a', 'b']);
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0]))).toBe('A');
  });

  it('reads headings, lists, tables and inline marks', () => {
    const d = readMarkdown('# Title\n\nSome **bold** [link](https://a.b) and [bad](javascript:x)\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect((d.blocks[0] as Paragraph).props.style).toBe('Heading1');
    const runs = (d.blocks[1] as Paragraph).runs;
    expect(runs.some((r) => r.props.bold)).toBe(true);
    expect(runs.find((r) => r.link)?.link?.href).toBe('https://a.b');
    expect(runs.filter((r) => r.link).length).toBe(1);
    expect((d.blocks[2] as Paragraph).props.numbering).toBeTruthy();
    expect(d.blocks[4]!.type).toBe('tbl');
  });
});

describe('themes', () => {
  it('changes fonts and heading color', () => {
    const d = applyThemeToDoc(blankDoc(), THEMES.find((t) => t.id === 'forest')!);
    expect(d.styles.docDefaults.run.font).toBe('Calibri');
    expect(d.styles.styles['Heading1']!.run?.color).toBe('#1b5e3b');
    expect(d.styles.styles['Heading1']!.run?.font).toBe('Arial');
  });
});

describe('new layout and document features', () => {
  it('keeps a large first letter through save and reopen', async () => {
    const { readDocx, writeDocx } = await import('../src/docx');
    const d: Doc = { ...blankDoc(), blocks: [para([textRun('Once upon a time')], { dropCap: { kind: 'drop', lines: 3 } })] };
    const back = readDocx(writeDocx(d));
    const p = back.blocks[0] as Paragraph;
    expect(p.props.dropCap).toEqual({ kind: 'drop', lines: 3 });
    expect(p.runs.map((r) => r.text).join('')).toBe('Once upon a time');
    expect(back.blocks.length).toBe(1);
    const line = layoutDocument(d, fake, opts).pages[0]!.body.lines[0]!;
    expect(line.frags[0]!.drop).toBeTruthy();
    expect(line.indent).toBeGreaterThan(0);
  });

  it('mirrors margins on even pages and centers text on the page', () => {
    const base = blankDoc();
    const sec = { ...base.section, marginLeft: 100, marginRight: 40 };
    const d: Doc = { ...base, section: sec, settings: { ...base.settings, mirrorMargins: true }, blocks: [para([textRun('one\ftwo')])] };
    const pages = layoutDocument(d, fake, opts).pages;
    expect(pages[0]!.body.lines[0]!.x).toBe(100);
    expect(pages[1]!.body.lines[0]!.x).toBe(40);
    const c: Doc = { ...base, section: { ...base.section, vAlign: 'center' }, blocks: [para([textRun('hello')])] };
    expect(layoutDocument(c, fake, opts).pages[0]!.body.lines[0]!.y).toBeGreaterThan(300);
  });

  it('restarts a numbered list from a chosen number', async () => {
    const { computeLabels } = await import('../src/core/styles');
    const levels = [{ start: 1, format: 'decimal', text: '%1.' }];
    const base = blankDoc();
    const a = para([textRun('a')], { numbering: { numId: 'x', level: 0 } });
    const b = para([textRun('b')], { numbering: { numId: 'x', level: 0 } });
    const c = para([textRun('c')], { numbering: { numId: 'y', level: 0 } });
    const e = para([textRun('e')], { numbering: { numId: 'y', level: 0 } });
    const d: Doc = { ...base, blocks: [a, b, c, e], numbering: { abstracts: { A: { id: 'A', levels } }, instances: { x: { id: 'x', abstractId: 'A' }, y: { id: 'y', abstractId: 'A', overrides: { 0: { start: 5 } } } } } };
    const l = computeLabels(d, d.blocks);
    expect([a, b, c, e].map((p) => l.get(p.id)?.text)).toEqual(['1.', '2.', '5.', '6.']);
  });

  it('works out table formulas without running code', async () => {
    const { formulaResult } = await import('../src/features/tableFormula');
    const t = createTable(3, 2, 200);
    t.rows[0]!.cells[0]!.blocks = [para([textRun('10')])];
    t.rows[1]!.cells[0]!.blocks = [para([textRun('2,500.50')])];
    t.rows[0]!.cells[1]!.blocks = [para([textRun('3')])];
    expect(formulaResult('=SUM(ABOVE)', t, 2, 0)).toBe('2510.5');
    expect(formulaResult('=A1*B1+2', t, 2, 1)).toBe('32');
    expect(formulaResult('=AVERAGE(A1:A2)', t, 2, 0)).toBe('1255.25');
    expect(formulaResult('=alert(1)', t, 2, 0)).toBe('!Error');
  });

  it('writes citations in each style', async () => {
    const { citeText, bibliographyEntry } = await import('../src/features/references');
    const s = { tag: 'a', type: 'Book', title: 'Title', authors: ['Smith, Jo'], year: '2020', publisher: 'Press' };
    expect(citeText(s, 'APA')).toBe('(Smith, 2020)');
    expect(citeText(s, 'MLA')).toBe('(Smith)');
    expect(citeText(s, 'IEEE', [s])).toBe('[1]');
    expect(bibliographyEntry(s, 'IEEE', 0)).toContain('[1]');
    expect(bibliographyEntry(s, 'MLA')).toContain('Press, 2020.');
  });
});

describe('password protection', () => {
  it('saves and reopens, and refuses a wrong password', async () => {
    const { encryptPackage, decryptPackage } = await import('../src/formats/crypt');
    const { isCompound } = await import('../src/formats/cfb');
    const { readDocx, writeDocx } = await import('../src/docx');
    const plain = writeDocx(sample());
    const locked = await encryptPackage(plain, 'كلمة-secret');
    expect(isCompound(locked)).toBe(true);
    const back = await decryptPackage(locked, 'كلمة-secret');
    expect(textOf(readDocx(back))).toContain('after the table');
    await expect(decryptPackage(locked, 'nope')).rejects.toThrow('not correct');
  }, 30000);

  const canCheck = (() => { try { execFileSync('python3', ['-c', 'import msoffcrypto'], { stdio: 'ignore' }); return true; } catch { return false; } })();

  it.runIf(canCheck)('opens with an independent tool', async () => {
    const { encryptPackage } = await import('../src/formats/crypt');
    const { writeDocx } = await import('../src/docx');
    const plain = writeDocx(sample());
    const locked = await encryptPackage(plain, 'كلمة-secret');
    const dir = mkdtempSync(join(tmpdir(), 'enc-'));
    writeFileSync(join(dir, 'locked.docx'), locked);
    try {
      execFileSync('python3', ['-c', `import msoffcrypto,io
f=msoffcrypto.OfficeFile(open(${JSON.stringify(join(dir, 'locked.docx'))},'rb'))
f.load_key(password='كلمة-secret')
o=io.BytesIO(); f.decrypt(o, verify_integrity=True); open(${JSON.stringify(join(dir, 'open.docx'))},'wb').write(o.getvalue())`], { stdio: 'pipe' });
    } catch (e) { throw new Error(String((e as { stderr?: Buffer }).stderr)); }
    expect(readFileSync(join(dir, 'open.docx')).length).toBe(plain.length);
  }, 30000);
});
