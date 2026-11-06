import { blankDoc } from '../core/defaults';
import { newId, para, type Block, type Doc, type ImageAtom, type Paragraph, type ParaProps, type Run, type RunProps, type Table, type TableCell } from '../core/model';

export interface ImageData { mime: string; data: Uint8Array; width: number; height: number; alt?: string }

const BULLETS = ['•', '◦', '▪'];
const FORMATS = ['decimal', 'lowerLetter', 'lowerRoman'];
const CONTENT_WIDTH = 468;

// Shared by every importer: collects blocks, lists and pictures into a new document.
export class DocBuilder {
  doc: Doc = blankDoc();
  blocks: Block[] = [];
  private lists: Partial<Record<'bullet' | 'number', string>> = {};

  list(kind: 'bullet' | 'number'): string {
    const known = this.lists[kind];
    if (known) return known;
    const id = newId();
    const levels = Array.from({ length: 9 }, (_, i) => ({
      start: 1,
      format: kind === 'bullet' ? 'bullet' : FORMATS[i % 3]!,
      text: kind === 'bullet' ? BULLETS[i % 3]! : `%${i + 1}.`,
      align: 'left' as const,
      suffix: 'tab' as const,
      paraProps: { indentLeft: 36 * (i + 1), firstLine: -18 },
    }));
    this.doc = { ...this.doc, numbering: { abstracts: { ...this.doc.numbering.abstracts, [id]: { id, levels, multiLevelType: 'multilevel' } }, instances: { ...this.doc.numbering.instances, [id]: { id, abstractId: id } } } };
    this.lists[kind] = id;
    return id;
  }

  image(img: ImageData): Run {
    const ext = img.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const key = `media/${newId()}.${ext}`;
    const width = Math.min(img.width || 200, CONTENT_WIDTH);
    const height = img.width ? (img.height / img.width) * width : img.height || 150;
    this.doc = { ...this.doc, media: { ...this.doc.media, [key]: { mime: img.mime, data: img.data, name: key.slice(6) } } };
    const atom: ImageAtom = { kind: 'image', media: key, width, height, wrap: 'inline', alt: img.alt ?? '' };
    return { text: '\ufffc', props: {}, atom };
  }

  add(runs: Run[], props: ParaProps = {}): Paragraph {
    const p = para(runs.length ? merge(runs) : [], props);
    this.blocks.push(p);
    return p;
  }

  finish(): Doc {
    return { ...this.doc, blocks: this.blocks.length ? this.blocks : [para()] };
  }
}

const same = (a: RunProps, b: RunProps): boolean => JSON.stringify(a) === JSON.stringify(b);

const merge = (runs: Run[]): Run[] => {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && !last.atom && !r.atom && !last.link && !r.link && same(last.props, r.props)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push(r);
  }
  return out;
};

export const makeTable = (rows: Block[][][], width = CONTENT_WIDTH): Table => {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const w = width / cols;
  const cell = (blocks: Block[]): TableCell => ({ id: newId(), props: { width: w }, blocks: blocks.length ? blocks : [para()] });
  return {
    type: 'tbl',
    id: newId(),
    props: { style: 'TableGrid', width: { value: 0, unit: 'auto' }, look: { firstRow: true, noVBand: true } },
    grid: Array.from({ length: cols }, () => w),
    rows: rows.map((r) => ({ id: newId(), props: {}, cells: Array.from({ length: cols }, (_, i) => cell(r[i] ?? [])) })),
  };
};
