import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { blankDoc } from '../src/core/defaults';
import { ATOM_CHAR, para, textRun, type Atom, type ChartAtom, type ChartKind, type Doc, type Paragraph } from '../src/core/model';
import { SHAPE_COUNT, SHAPE_GROUPS, shapePath } from '../src/core/shapes';
import { readDocx, writeDocx } from '../src/docx';
import { DIAGRAM_KINDS, buildDiagram } from '../src/features/diagrams';
import { readMailSource } from '../src/features/mailSources';
import { pack, unpack } from '../src/features/share';
import { TEMPLATES, buildTemplate } from '../src/features/templateLibrary';
import { arabicVariants } from '../src/features/proof/arabic';
import { makeCertificate, signPackage, verifyPackage } from '../src/formats/sign';

const withBlocks = (blocks: Paragraph[], extra: Partial<Doc> = {}): Doc => ({ ...blankDoc(), blocks, ...extra });
const atomPara = (atom: Atom): Paragraph => para([{ text: ATOM_CHAR, props: {}, atom }]);
const roundTrip = (d: Doc): Doc => readDocx(writeDocx(d));
const atomsOf = (d: Doc): Atom[] => d.blocks.flatMap((b) => (b.type === 'p' ? b.runs.flatMap((r) => (r.atom ? [r.atom] : [])) : []));

describe('shapes', () => {
  it('draws every preset as a closed, finite path', () => {
    expect(SHAPE_COUNT).toBeGreaterThan(140);
    for (const [, list] of SHAPE_GROUPS) for (const [id] of list) {
      const d = shapePath(id, 120, 80);
      expect(d.length, id).toBeGreaterThan(4);
      expect(d, id).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('charts', () => {
  const kinds: ChartKind[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar', 'radarFilled', 'stock', 'surface', 'treemap', 'sunburst', 'histogram', 'boxWhisker', 'waterfall', 'funnel', 'combo'];
  for (const kind of kinds) {
    it(`keeps a ${kind} chart through saving`, () => {
      const cats = kind === 'scatter' || kind === 'bubble' ? ['1', '2', '3'] : ['a', 'b', 'c'];
      const atom: ChartAtom = { kind: 'chart', chart: kind, title: `T ${kind}`, categories: cats, series: [{ name: 'One', values: [1, 2, 3] }, { name: 'Two', values: [3, 1, 2] }, { name: 'Three', values: [2, 2, 1] }], width: 300, height: 200, wrap: 'inline', markers: true, noGrid: true, legend: 'r' };
      const back = atomsOf(roundTrip(withBlocks([atomPara(atom)]))).find((a): a is ChartAtom => a.kind === 'chart');
      expect(back?.chart).toBe(kind);
      expect(back?.title).toBe(`T ${kind}`);
      expect(back?.series[0]?.values).toEqual([1, 2, 3]);
      expect(back?.categories).toEqual(cats);
    });
  }
});

describe('diagrams', () => {
  it('builds every layout from a short list', () => {
    expect(DIAGRAM_KINDS.length).toBeGreaterThanOrEqual(50);
    for (const [kind] of DIAGRAM_KINDS) {
      const d = buildDiagram(kind, 'One\nTwo\n  Two a\nThree\nFour', '#2f6fd1');
      expect(d.shapes.length, kind).toBeGreaterThan(0);
      expect(Number.isFinite(d.width) && Number.isFinite(d.height), kind).toBe(true);
    }
  });
});

describe('text effects', () => {
  it('keeps glow, reflection, gradient and outline color', () => {
    const d = roundTrip(withBlocks([para([textRun('Shiny', { glow: { color: '#ff0000', size: 6 }, reflect: true, gradient: ['#112233', '#445566'], lineColor: '#00ff00' })])]));
    const p = d.blocks[0] as Paragraph;
    const props = p.runs[0]!.props;
    expect(props.glow?.color).toBe('#ff0000');
    expect(props.reflect).toBe(true);
    expect(props.gradient).toEqual(['#112233', '#445566']);
    expect(props.lineColor).toBe('#00ff00');
  });
});

describe('restricted editing and reactions', () => {
  it('keeps editable paragraphs in a read-only document', () => {
    const open = para([textRun('fill me')]);
    open.editable = true;
    const d = roundTrip(withBlocks([para([textRun('locked')]), open], { settings: { ...blankDoc().settings, protection: { kind: 'readOnly' } } }));
    const ps = d.blocks.filter((b): b is Paragraph => b.type === 'p');
    expect(ps.find((p) => p.runs.map((r) => r.text).join('') === 'fill me')?.editable).toBe(true);
    expect(ps.find((p) => p.runs.map((r) => r.text).join('') === 'locked')?.editable).toBeFalsy();
  });

  it('keeps comment reactions', () => {
    const d = withBlocks([para([{ text: 'hello', props: {}, comments: ['1'] }])]);
    d.comments = { '1': { id: '1', author: 'Sara', date: '2026-01-01T00:00:00Z', blocks: [para([textRun('nice')])], reactions: [{ author: 'Omar', kind: 'like' }] } };
    expect(roundTrip(d).comments['1']?.reactions).toEqual([{ author: 'Omar', kind: 'like' }]);
  });
});

describe('mail merge sources', () => {
  it('reads contacts, json, semicolon lists and spreadsheets', () => {
    const vcf = readMailSource(strToU8('BEGIN:VCARD\nFN:Sara Ali\nEMAIL:sara@example.com\nEND:VCARD\nBEGIN:VCARD\nFN:Omar\nEND:VCARD\n'), 'c.vcf');
    expect(vcf.rows.length).toBe(2);
    expect(Object.values(vcf.rows[0]!)).toContain('Sara Ali');

    const json = readMailSource(strToU8(JSON.stringify([{ name: 'A', city: 'X' }, { name: 'B', city: 'Y' }])), 'p.json');
    expect(json.columns).toEqual(['name', 'city']);
    expect(json.rows[1]!['city']).toBe('Y');

    const semi = readMailSource(strToU8('name;city\nA;X\nB;Y\n'), 'p.csv');
    expect(semi.columns).toEqual(['name', 'city']);

    const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>city</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>`;
    const shared = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>name</t></si><si><t>Sara</t></si></sst>`;
    const wb = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
    const xlsx = zipSync({ 'xl/workbook.xml': strToU8(wb), 'xl/_rels/workbook.xml.rels': strToU8(rels), 'xl/worksheets/sheet1.xml': strToU8(sheet), 'xl/sharedStrings.xml': strToU8(shared) });
    const x = readMailSource(xlsx, 'list.xlsx');
    expect(x.columns).toEqual(['name', 'city']);
    expect(x.rows[0]).toEqual({ name: 'Sara', city: '42' });
  });
});

describe('sharing', () => {
  it('packs and unpacks', () => {
    const o = { a: 'مرحبا', b: [1, 2, 3] };
    expect(unpack(pack(o))).toEqual(o);
  });
});

describe('templates', () => {
  it('builds every template into a document that saves', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(40);
    for (const t of TEMPLATES) {
      const d = buildTemplate(t.id);
      expect(d, t.id).not.toBeNull();
      expect(d!.blocks.length, t.id).toBeGreaterThan(0);
      expect(() => readDocx(writeDocx(d!)), t.id).not.toThrow();
    }
  });
});

describe('arabic spelling', () => {
  it('offers stems without common prefixes and suffixes', () => {
    const v = arabicVariants('والكتاب');
    expect(v).toContain('كتاب');
  });
});

describe('signatures', () => {
  const { signer } = makeCertificate('سارة علي', 'sara@example.com');
  const bytes = writeDocx(withBlocks([para([textRun('signed text')])]));

  it('signs, verifies and still opens', () => {
    const signed = signPackage(bytes, signer, 'Approval');
    const info = verifyPackage(signed);
    expect(info.length).toBe(1);
    expect(info[0]!.valid).toBe(true);
    expect(info[0]!.intact).toBe(true);
    expect(info[0]!.signer).toContain('سارة');
    expect(info[0]!.purpose).toBe('Approval');
    expect(() => readDocx(signed)).not.toThrow();
  });

  it('notices a changed document', async () => {
    const { unzipSync } = await import('fflate');
    const files = unzipSync(signPackage(bytes, signer, 'Approval'));
    const body = new TextDecoder().decode(files['word/document.xml']);
    files['word/document.xml'] = strToU8(body.replace('signed text', 'changed text'));
    const info = verifyPackage(zipSync(files));
    expect(info[0]!.intact).toBe(false);
  });
});
