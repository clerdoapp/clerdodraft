import { ATOM_CHAR, type Align, type Paragraph, type ParaProps, type Run, type RunProps, type TabStop } from '../core/model';
import { computeLabels, effectivePara, effectiveRun, styleChain } from '../core/styles';
import type { Block } from '../core/model';
import type { FontSpec, Frag, Line, LayoutEnv, ParaLayout } from './types';

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;

export const fontOf = (eff: RunProps, text = ''): FontSpec => {
  const cs = eff.rtl || RTL_CHAR.test(text);
  let size = eff.size ?? 11;
  if (eff.vertAlign) size *= 0.65;
  return { family: (cs ? eff.fontCs : undefined) ?? eff.font ?? 'Calibri', size, bold: !!eff.bold, italic: !!eff.italic };
};

interface Token {
  kind: 'text' | 'space' | 'tab' | 'break' | 'atom';
  from: number;
  to: number;
  text: string;
  run: Run;
  eff: RunProps;
  font: FontSpec;
  width: number;
  brk?: 'line' | 'page' | 'column';
}

const displayText = (t: string, eff: RunProps): string => (eff.caps || eff.smallCaps ? t.toLocaleUpperCase() : t);

const measure = (env: LayoutEnv, text: string, eff: RunProps, font: FontSpec): number => {
  if (!text) return 0;
  const f = eff.smallCaps && !eff.caps ? { ...font, size: font.size * 0.8 } : font;
  let w = env.m.width(displayText(text, eff), f);
  if (eff.spacing) w += eff.spacing * text.length;
  if (eff.scale) w *= eff.scale / 100;
  return w;
};

const atomMetrics = (env: LayoutEnv, r: Run, eff: RunProps, font: FontSpec): { width: number; text: string; height?: number } => {
  const a = r.atom!;
  switch (a.kind) {
    case 'image': return a.wrap === 'inline' ? { width: a.width, text: '', height: a.height } : { width: 0, text: '' };
    case 'shape':
    case 'chart': return a.wrap === 'inline' ? { width: a.width, text: '', height: a.height } : { width: 0, text: '' };
    case 'field': {
      const v = a.field === 'page' ? env.field.page ?? a.result : a.field === 'numpages' ? String(env.field.numPages ?? (a.result || '1')) : a.result;
      return { width: measure(env, v, eff, font), text: v };
    }
    case 'footnote':
    case 'endnote': {
      const t = env.noteNumber(a.kind, a.id);
      return { width: measure(env, t, eff, font), text: t };
    }
    case 'equation': return { width: measure(env, a.source, { ...eff, italic: true }, { ...font, italic: true }), text: a.source };
    case 'checkbox': return { width: font.size * 1.05, text: a.checked ? '☒' : '☐' };
    case 'raw': return { width: a.width ?? measure(env, `[${a.label}]`, eff, font), text: a.width ? '' : `[${a.label}]`, height: a.height };
  }
};

const tokenize = (env: LayoutEnv, p: Paragraph, eff: ParaProps, overlay?: RunProps): { tokens: Token[]; volatile: boolean } => {
  const tokens: Token[] = [];
  let pos = 0;
  let volatile = false;
  for (const run of p.runs) {
    const start = pos;
    pos += run.text.length;
    if (run.del && !env.opts.showDeleted) continue;
    if (run.props.hidden && !env.opts.showHidden) continue;
    const re = effectiveRun(env.doc, eff, run.props);
    const merged: RunProps = overlay ? { ...overlay, ...run.props, ...stripUndefined(re, overlay, run.props) } : re;
    if (run.atom) {
      const font = fontOf(merged);
      if (run.atom.kind === 'field' && (run.atom.field === 'page' || run.atom.field === 'numpages')) volatile = true;
      const m = atomMetrics(env, run, merged, font);
      tokens.push({ kind: 'atom', from: start, to: pos, text: m.text, run, eff: merged, font, width: m.width });
      continue;
    }
    const t = run.text;
    let i = 0;
    while (i < t.length) {
      const c = t[i]!;
      if (c === '\t' || c === '\n' || c === '\f' || c === '\v') {
        const font = fontOf(merged);
        const brk = c === '\n' ? 'line' : c === '\f' ? 'page' : c === '\v' ? 'column' : undefined;
        tokens.push({ kind: c === '\t' ? 'tab' : 'break', from: start + i, to: start + i + 1, text: '', run, eff: merged, font, width: 0, brk });
        i++;
        continue;
      }
      let j = i;
      const space = c === ' ' || c === '　';
      if (space) while (j < t.length && (t[j] === ' ' || t[j] === '　')) j++;
      else if (CJK.test(c)) j = i + 1;
      else {
        while (j < t.length && !/[\s\t\n\f\v　]/.test(t[j]!) && !CJK.test(t[j]!) && t[j] !== ATOM_CHAR) {
          const hy = t[j] === '-' || t[j] === '—' || t[j] === '–' || t[j] === '/';
          j++;
          if (hy) break;
        }
        if (j === i) j = i + 1;
      }
      const text = t.slice(i, j);
      const font = fontOf(merged, text);
      tokens.push({ kind: space ? 'space' : 'text', from: start + i, to: start + j, text, run, eff: merged, font, width: measure(env, text, merged, font) });
      i = j;
    }
  }
  return { tokens, volatile };
};

const stripUndefined = (re: RunProps, overlay: RunProps, direct: RunProps): RunProps => {
  const out: RunProps = {};
  for (const k of Object.keys(re) as (keyof RunProps)[]) {
    if (direct[k] !== undefined || overlay[k] === undefined) (out as Record<string, unknown>)[k] = re[k];
  }
  return out;
};

const nextTab = (x: number, tabs: TabStop[], def: number): TabStop => {
  for (const t of tabs) if (t.kind !== 'clear' && t.kind !== 'bar' && t.pos > x + 0.01) return t;
  return { pos: (Math.floor(x / def + 1e-6) + 1) * def, kind: 'left' };
};

const leaderChar: Record<string, string> = { dot: '.', hyphen: '-', underscore: '_', middleDot: '·', heavy: '_' };

const lineMetrics = (env: LayoutEnv, frags: Frag[], fallback: RunProps, eff: ParaProps): { height: number; ascent: number; descent: number } => {
  let asc = 0;
  let desc = 0;
  const consider = (font: FontSpec, extraRaise = 0) => {
    const m = env.m.metrics(font);
    asc = Math.max(asc, m.ascent + extraRaise);
    desc = Math.max(desc, m.descent);
  };
  for (const f of frags) {
    const a = f.atom;
    if (a && (a.kind === 'image' || a.kind === 'shape' || a.kind === 'chart')) {
      if (a.wrap === 'inline') asc = Math.max(asc, a.height);
      continue;
    }
    if (a && a.kind === 'raw' && a.height) { asc = Math.max(asc, a.height); continue; }
    consider(f.eff.vertAlign ? { ...f.font, size: f.font.size / 0.65 } : f.font);
  }
  if (!asc && !desc) consider(fontOf(fallback));
  const natural = asc + desc;
  const ls = eff.lineSpacing ?? { rule: 'auto' as const, value: 1 };
  if (ls.rule === 'exact') return { height: ls.value, ascent: asc, descent: desc };
  if (ls.rule === 'atLeast') return { height: Math.max(ls.value, natural), ascent: asc, descent: desc };
  return { height: natural * ls.value, ascent: asc, descent: desc };
};

export type LineShape = (index: number, y: number, lineHeight: number) => { left: number; right: number; dy: number };

const swapAlign = (a: Align, rtl: boolean): Align => (rtl ? (a === 'left' ? 'right' : a === 'right' ? 'left' : a) : a);

const CACHE_LIMIT = 8;
type Cache = WeakMap<object, WeakMap<Paragraph, Map<string, ParaLayout>>>;
const cache: Cache = new WeakMap();

export const layoutParagraph = (env: LayoutEnv, blocks: Block[], p: Paragraph, width: number, overlay?: RunProps, shape?: LineShape, tablePara?: ParaProps): ParaLayout => {
  const label = computeLabels(env.doc, blocks).get(p.id);
  const key = `${width.toFixed(2)}|${env.opts.showDeleted}|${env.opts.showHidden}|${label?.text ?? ''}|${overlay ? JSON.stringify(overlay) : ''}|${tablePara ? JSON.stringify(tablePara) : ''}`;
  if (!shape) {
    let byPara = cache.get(env.doc.styles);
    if (!byPara) cache.set(env.doc.styles, (byPara = new WeakMap()));
    let byKey = byPara.get(p);
    const hit = byKey?.get(key);
    if (hit) return hit;
    const res = compute(env, p, width, label, overlay, undefined, tablePara);
    if (!res.volatile) {
      if (!byKey) byPara.set(p, (byKey = new Map()));
      if (byKey.size >= CACHE_LIMIT) byKey.clear();
      byKey.set(key, res);
    }
    return res;
  }
  return compute(env, p, width, label, overlay, shape, tablePara);
};

const compute = (env: LayoutEnv, p: Paragraph, width: number, label: ReturnType<typeof computeLabels> extends Map<string, infer L> ? L | undefined : never, overlay?: RunProps, shape?: LineShape, tablePara?: ParaProps): ParaLayout => {
  let eff = effectivePara(env.doc, p.props);
  if (tablePara) {
    // A table style beats document defaults, but not paragraph styles or direct formatting.
    const chain = styleChain(env.doc, eff.style);
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tablePara)) {
      if ((p.props as Record<string, unknown>)[k] === undefined && !chain.some((c) => (c.para as Record<string, unknown> | undefined)?.[k] !== undefined)) set[k] = v;
    }
    eff = { ...eff, ...set };
  }
  const rtl = !!eff.bidi;
  const indentL = eff.indentLeft ?? 0;
  const indentR = eff.indentRight ?? 0;
  const first = eff.firstLine ?? 0;
  const align = swapAlign(eff.align ?? 'left', rtl);
  const { tokens, volatile } = tokenize(env, p, eff, overlay);
  const tabs = [...(eff.tabs ?? [])].sort((a, b) => a.pos - b.pos);
  const def = env.doc.settings.defaultTabStop || 36;
  const markEff = overlay ? { ...overlay, ...effectiveRun(env.doc, eff, p.markProps ?? {}) } : effectiveRun(env.doc, eff, p.markProps ?? {});

  const lines: Line[] = [];
  let i = 0;
  let y = 0;
  let isFirst = true;
  const n = tokens.length;
  let labelInfo: Line['label'];
  if (label && label.text) {
    const lvlEff = { ...effectiveRun(env.doc, eff, p.markProps ?? {}), ...label.level.runProps, ...stripColorUnderline() };
    const font = fontOf(lvlEff, label.text);
    const w = env.m.width(label.text, font);
    labelInfo = { text: label.text, x: 0, width: w, eff: lvlEff, font };
  }

  do {
    const lineStart = isFirst ? indentL + first : indentL;
    const est = lines.length ? lines[lines.length - 1]!.height : (markEff.size ?? 11) * 1.25;
    const s = shape ? shape(lines.length, y, est) : { left: 0, right: 0, dy: 0 };
    y += s.dy;
    const startX = lineStart + s.left;
    const avail = width - startX - indentR - s.right;
    let x = 0;
    let lineLabel: Line['label'];
    if (isFirst && labelInfo) {
      const suffix = label!.level.suffix ?? 'tab';
      const lblAlign = label!.level.align ?? 'left';
      const lblX = lblAlign === 'right' ? -labelInfo.width : lblAlign === 'center' ? -labelInfo.width / 2 : 0;
      lineLabel = { ...labelInfo, x: lblX };
      let end = lblX + labelInfo.width;
      if (suffix === 'space') end += labelInfo.font.size * 0.28;
      if (suffix === 'tab') {
        const hanging = first < 0 ? -first : 0;
        const stops = tabs.filter((t) => t.pos > startX + end);
        end = end < hanging ? hanging : (stops[0]?.pos ?? (Math.floor((startX + end) / def + 1) * def)) - startX;
      }
      x = Math.max(end, 0);
      lineLabel = { ...lineLabel, advance: x };
    }
    const frags: Frag[] = [];
    let brk: Token['brk'];
    const startI = i;
    let lastBreakFrag = -1;
    let lastBreakI = -1;
    let lastBreakX = 0;
    let pendingTab: { frag: Frag; stop: TabStop; startX: number } | null = null;
    const pushText = (t: Token) => {
      const last = frags[frags.length - 1];
      if (last && last.kind === 'text' && last.run === t.run && last.to === t.from && sameFont(last.font, t.font)) {
        last.text += t.text;
        last.to = t.to;
        last.width += t.width;
      } else frags.push({ kind: 'text', from: t.from, to: t.to, text: t.text, width: t.width, run: t.run, eff: t.eff, font: t.font });
    };
    const resolveTab = () => {
      if (!pendingTab) return;
      const { frag, stop, startX: sx } = pendingTab;
      const used = x - sx;
      if (stop.kind === 'center') { frag.width = Math.max(0, stop.pos - startX - sx - used / 2); x = sx + frag.width + used; }
      else if (stop.kind === 'right') { frag.width = Math.max(0, stop.pos - startX - sx - used); x = sx + frag.width + used; }
      pendingTab = null;
    };
    while (i < n) {
      const t = tokens[i]!;
      if (t.kind === 'break') {
        resolveTab();
        frags.push({ kind: 'mark', from: t.from, to: t.to, text: '', width: 0, run: t.run, eff: t.eff, font: t.font });
        brk = t.brk;
        i++;
        break;
      }
      if (t.kind === 'tab') {
        resolveTab();
        const stop = nextTab(x + startX, tabs, def);
        const w = stop.pos - startX - x;
        if (w + x > avail + 0.01 && frags.length && x > 0) { /* tab past the margin wraps to a minimal default */ }
        const frag: Frag = { kind: 'tab', from: t.from, to: t.to, text: '', width: stop.kind === 'left' || stop.kind === 'decimal' ? w : 0, run: t.run, eff: t.eff, font: t.font, leader: stop.leader && stop.leader !== 'none' ? leaderChar[stop.leader] : undefined };
        frags.push(frag);
        if (stop.kind === 'center' || stop.kind === 'right') pendingTab = { frag, stop, startX: x };
        else x += w;
        i++;
        lastBreakFrag = frags.length;
        lastBreakI = i;
        lastBreakX = x;
        continue;
      }
      if (t.kind === 'space') {
        pushText(t);
        x += t.width;
        i++;
        lastBreakFrag = frags.length;
        lastBreakI = i;
        lastBreakX = x;
        continue;
      }
      if (x + t.width > avail + 0.01 && frags.length) {
        if (lastBreakI > startI) {
          i = lastBreakI;
          frags.length = lastBreakFrag;
          truncateLast(frags, tokens, startI, i);
          x = lastBreakX;
          break;
        }
        if (t.kind === 'text' && t.text.length > 1 && !pendingTab) {
          // A single word wider than the line: break it at a grapheme.
          const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t.text)];
          let w = 0;
          let k = 0;
          for (const s of seg) {
            const cw = measure(env, s.segment, t.eff, t.font);
            if (x + w + cw > avail) break;
            w += cw;
            k += s.segment.length;
          }
          if (k > 0) {
            const a: Token = { ...t, to: t.from + k, text: t.text.slice(0, k), width: w };
            const b: Token = { ...t, from: t.from + k, text: t.text.slice(k), width: measure(env, t.text.slice(k), t.eff, t.font) };
            tokens.splice(i, 1, a, b);
            pushText(a);
            x += w;
            i++;
          }
        }
        break;
      }
      if (t.kind === 'atom') {
        const a = t.run.atom!;
        frags.push({ kind: 'atom', from: t.from, to: t.to, text: t.text, width: t.width, run: t.run, eff: t.eff, font: t.font, atom: a });
      } else if (t.kind === 'text' && !frags.length && x === 0 && t.width > avail && t.text.length > 1) {
        const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t.text)];
        let w = 0;
        let k = 0;
        for (const s of seg) {
          const cw = measure(env, s.segment, t.eff, t.font);
          if (k > 0 && w + cw > avail) break;
          w += cw;
          k += s.segment.length;
        }
        if (k < t.text.length) {
          const a: Token = { ...t, to: t.from + k, text: t.text.slice(0, k), width: w };
          const b: Token = { ...t, from: t.from + k, text: t.text.slice(k), width: measure(env, t.text.slice(k), t.eff, t.font) };
          tokens.splice(i, 1, a, b);
          pushText(a);
          x += w;
          i++;
          break;
        }
        pushText(t);
      } else pushText(t);
      x += t.width;
      i++;
    }
    resolveTab();
    let trailing = 0;
    for (let k = frags.length - 1; k >= 0; k--) {
      const f = frags[k]!;
      if (f.kind === 'mark') continue;
      if (f.kind !== 'text') break;
      const m = /[ 　]+$/.exec(f.text);
      if (!m) break;
      const part = f.text === m[0] ? f.width : measure(env, m[0], f.eff, f.font);
      trailing += part;
      if (f.text !== m[0]) break;
    }
    const textWidth = Math.max(0, x - trailing);
    const metrics = lineMetrics(env, frags, markEff, eff);
    const ended = i >= n;
    let wordSpacing = 0;
    const justify = align === 'justify' || align === 'distribute';
    if (justify && !ended && !brk) {
      const joined = frags.map((f) => (f.kind === 'text' ? f.text : 'x')).join('').trimEnd();
      const spaces = joined.match(/ /g)?.length ?? 0;
      if (spaces > 0 && !frags.some((f) => f.kind === 'tab')) wordSpacing = (avail - textWidth) / spaces;
    }
    const floats = frags.flatMap((f) => (f.atom && (f.atom.kind === 'image' || f.atom.kind === 'shape' || f.atom.kind === 'chart') && f.atom.wrap !== 'inline' ? [f.atom] : []));
    const noteRefs = frags.flatMap((f) => (f.atom && (f.atom.kind === 'footnote' || f.atom.kind === 'endnote') ? [{ kind: f.atom.kind, id: f.atom.id }] : []));
    const line: Line = {
      para: p.id,
      from: frags[0]?.from ?? tokens[startI]?.from ?? (lines.length ? lines[lines.length - 1]!.to : 0),
      to: frags[frags.length - 1]?.to ?? (lines.length ? lines[lines.length - 1]!.to : 0),
      frags,
      indent: startX,
      textWidth,
      avail,
      ...metrics,
      wordSpacing,
      align,
      rtl,
      label: lineLabel,
      breakAfter: brk === 'page' ? 'page' : brk === 'column' ? 'column' : undefined,
      noteRefs: noteRefs.length ? noteRefs : undefined,
      floats: floats.length ? floats : undefined,
      isLast: ended,
      dy: s.dy || undefined,
    };
    if (brk && i >= n) {
      // A trailing break leaves an empty line for the caret to sit on.
      lines.push({ ...line, isLast: false });
      y += metrics.height;
      lines.push({ ...line, from: line.to, frags: [], textWidth: 0, label: undefined, breakAfter: undefined, noteRefs: undefined, floats: undefined, isLast: true, wordSpacing: 0, dy: undefined });
      isFirst = false;
      break;
    }
    lines.push(line);
    y += metrics.height;
    isFirst = false;
    if (i === startI) i++; // always advance
  } while (i < n);

  const to = p.runs.reduce((s, r) => s + r.text.length, 0);
  if (lines.length) lines[lines.length - 1]!.to = to;
  return {
    para: p,
    lines,
    spaceBefore: eff.spaceBefore ?? 0,
    spaceAfter: eff.spaceAfter ?? 0,
    keepNext: !!eff.keepNext,
    keepLines: !!eff.keepLines,
    pageBreakBefore: !!eff.pageBreakBefore,
    widowControl: eff.widowControl !== false,
    contextual: !!eff.contextualSpacing,
    style: eff.style,
    shading: eff.shading,
    borders: eff.borders,
    indentL,
    indentR,
    volatile,
  };
};

const stripColorUnderline = (): RunProps => ({ underline: 'none', strike: false });

const sameFont = (a: FontSpec, b: FontSpec): boolean => a.family === b.family && a.size === b.size && a.bold === b.bold && a.italic === b.italic;

// After rewinding to a break point, the last frag may hold text past that point.
const truncateLast = (frags: Frag[], tokens: Token[], startI: number, endI: number): void => {
  const last = frags[frags.length - 1];
  if (!last || last.kind !== 'text') return;
  const tokensUsed = tokens.slice(startI, endI).filter((t) => t.from >= last.from && t.run === last.run && t.kind !== 'tab');
  if (!tokensUsed.length) return;
  last.text = tokensUsed.map((t) => t.text).join('');
  last.to = tokensUsed[tokensUsed.length - 1]!.to;
  last.width = tokensUsed.reduce((s, t) => s + t.width, 0);
};
