import type { Block, Doc, Id, NumberingLevel, Paragraph, ParaProps, Run, RunProps, Section, StoryId, Style } from './model';
import { walkParagraphs } from './tree';

const clean = <T extends object>(o: T | undefined): Partial<T> => {
  const r: Partial<T> = {};
  if (o) for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) r[k] = o[k];
  return r;
};

const merge = <T extends object>(...layers: (T | undefined)[]): T => Object.assign({}, ...layers.map(clean)) as T;

export const styleChain = (doc: Doc, id: string | undefined): Style[] => {
  const chain: Style[] = [];
  const seen = new Set<string>();
  let cur = id ? doc.styles.styles[id] : undefined;
  while (cur && !seen.has(cur.id)) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.basedOn ? doc.styles.styles[cur.basedOn] : undefined;
  }
  return chain;
};

export const defaultParaStyle = (doc: Doc): string | undefined =>
  Object.values(doc.styles.styles).find((s) => s.kind === 'paragraph' && s.isDefault)?.id;

const numLevel = (doc: Doc, n: ParaProps['numbering']): NumberingLevel | undefined => {
  if (!n || n.numId === '0') return undefined;
  const inst = doc.numbering.instances[n.numId];
  if (!inst) return undefined;
  const over = inst.overrides?.[n.level];
  const base = doc.numbering.abstracts[inst.abstractId]?.levels[n.level];
  const lvl = over?.level ?? base;
  return lvl && over?.start !== undefined ? { ...lvl, start: over.start } : lvl;
};

const paraCache = new WeakMap<Doc['styles'], WeakMap<ParaProps, ParaProps>>();

export const effectivePara = (doc: Doc, props: ParaProps): ParaProps => {
  let byProps = paraCache.get(doc.styles);
  if (!byProps) paraCache.set(doc.styles, (byProps = new WeakMap()));
  const hit = byProps.get(props);
  if (hit) return hit;
  const styleId = props.style ?? defaultParaStyle(doc);
  const chain = styleChain(doc, styleId).map((s) => s.para);
  const fromStyle = merge<ParaProps>(doc.styles.docDefaults.para, ...chain);
  const numbering = props.numbering ?? fromStyle.numbering;
  const fromNum = numLevel(doc, numbering)?.paraProps;
  const out = merge<ParaProps>(fromStyle, fromNum, props);
  out.style = styleId;
  out.numbering = numbering;
  byProps.set(props, out);
  return out;
};

export const effectiveRun = (doc: Doc, para: ParaProps, run: RunProps): RunProps => {
  const styleId = para.style ?? defaultParaStyle(doc);
  const paraChain = styleChain(doc, styleId).map((s) => s.run);
  const charChain = run.charStyle ? styleChain(doc, run.charStyle).map((s) => s.run) : [];
  return merge<RunProps>(doc.styles.docDefaults.run, ...paraChain, ...charChain, run);
};

// Sections as ranges of top-level blocks. A paragraph carrying `section` ends its section.
export const sectionsOf = (doc: Doc): { section: Section; from: number; to: number }[] => {
  const out: { section: Section; from: number; to: number }[] = [];
  let from = 0;
  doc.blocks.forEach((b, i) => {
    if (b.type === 'p' && b.section) {
      out.push({ section: b.section, from, to: i + 1 });
      from = i + 1;
    }
  });
  out.push({ section: doc.section, from, to: doc.blocks.length });
  return out;
};

export const sectionAt = (doc: Doc, blockIndex: number): Section =>
  sectionsOf(doc).find((s) => blockIndex >= s.from && blockIndex < s.to)?.section ?? doc.section;

const roman = (n: number): string => {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let r = '';
  for (const [v, s] of t) while (n >= v) { r += s; n -= v; }
  return r;
};

const letters = (n: number): string => {
  const ch = String.fromCharCode(97 + ((n - 1) % 26));
  return ch.repeat(Math.floor((n - 1) / 26) + 1);
};

const ABJAD = 'أبجدهوزحطيكلمنسعفصقرشتثخذضظغ';
const HINDI = '٠١٢٣٤٥٦٧٨٩';

export const formatNumber = (n: number, format: string): string => {
  switch (format) {
    case 'lowerLetter': return letters(n);
    case 'upperLetter': return letters(n).toUpperCase();
    case 'lowerRoman': return roman(n);
    case 'upperRoman': return roman(n).toUpperCase();
    case 'decimalZero': return n < 10 ? `0${n}` : String(n);
    case 'ordinal': { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!); }
    case 'arabicAbjad': return ABJAD[(n - 1) % ABJAD.length] ?? String(n);
    case 'arabicAlpha': return 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي'[(n - 1) % 28] ?? String(n);
    case 'hindiNumbers': return String(n).replace(/\d/g, (d) => HINDI[Number(d)]!);
    case 'none': return '';
    default: return String(n);
  }
};

const BULLET_MAP: Record<string, string> = { '\uF0B7': '\u2022', '\uF0A7': '\u25AA', '\uF0D8': '\u27A2', '\uF0FC': '\u2713', '\uF06F': '\u25E6', '\uF0A8': '\u25A1' };

export interface ListLabel {
  text: string;
  level: NumberingLevel;
}

const labelCache = new WeakMap<Block[], Map<Id, ListLabel>>();

export const computeLabels = (doc: Doc, blocks: Block[]): Map<Id, ListLabel> => {
  const hit = labelCache.get(blocks);
  if (hit) return hit;
  const out = new Map<Id, ListLabel>();
  const counters = new Map<string, number[]>();
  for (const p of walkParagraphs(blocks)) {
    const eff = effectivePara(doc, p.props);
    const num = eff.numbering;
    if (!num || num.numId === '0') continue;
    const lvl = numLevel(doc, num);
    const inst = doc.numbering.instances[num.numId];
    if (!lvl || !inst) continue;
    const key = inst.abstractId;
    const levels = doc.numbering.abstracts[inst.abstractId]?.levels ?? [];
    let c = counters.get(key);
    if (!c) counters.set(key, (c = []));
    for (let i = 0; i < num.level; i++) if (c[i] === undefined) c[i] = (levels[i]?.start ?? 1);
    c[num.level] = c[num.level] === undefined ? lvl.start : c[num.level]! + 1;
    c.length = num.level + 1;
    const text = lvl.format === 'bullet' ? (BULLET_MAP[lvl.text] ?? lvl.text) : lvl.text.replace(/%(\d)/g, (_, d: string) => {
      const i = Number(d) - 1;
      const f = lvl.legal ? 'decimal' : (levels[i]?.format ?? 'decimal');
      return formatNumber(c![i] ?? 1, f);
    });
    out.set(p.id, { text, level: lvl });
  }
  labelCache.set(blocks, out);
  return out;
};

export const headingLevel = (doc: Doc, p: Paragraph): number | undefined => {
  const l = effectivePara(doc, p.props).outlineLevel;
  return l !== undefined && l < 9 ? l + 1 : undefined;
};

export const visibleRuns = (runs: Run[], showDeleted: boolean): Run[] => (showDeleted ? runs : runs.filter((r) => !r.del));

export type { StoryId };
