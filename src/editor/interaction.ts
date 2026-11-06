import type { ClipboardEvent, CSSProperties, KeyboardEvent } from 'react';
import { ATOM_CHAR, para, type Block, type Doc, type Paragraph, type Pos, type RunProps, type Selection, type StoryId } from '../core/model';
import { paraRaw, wordBoundary } from '../core/ops';
import { collapsed, docEnd, docStart, findPara, flatten, isCollapsed, orderedSel, paraLength, selectedParas, selectedText, sliceRuns, storyBlocks } from '../core/tree';
import { cssFamily } from '../layout/measure';
import type { Frag, PlacedLine } from '../layout/types';
import { runCommandForKey } from './commands';
import type { EditorStore } from './store';

const urls = new WeakMap<object, Map<string, string>>();

export const mediaUrl = (store: EditorStore, key: string): string => {
  const item = store.doc.media[key];
  if (!item) return '';
  let m = urls.get(store.doc.media);
  if (!m) urls.set(store.doc.media, (m = new Map()));
  let u = m.get(key);
  if (!u) {
    u = URL.createObjectURL(new Blob([item.data as BlobPart], { type: item.mime }));
    m.set(key, u);
  }
  return u;
};

const authorColor = (name: string): string => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 38%)`;
};

const UNDERLINE: Record<string, string> = { single: 'solid', words: 'solid', double: 'double', thick: 'solid', dotted: 'dotted', dashed: 'dashed', wave: 'wavy' };

export const fragStyle = (store: EditorStore, f: Frag): CSSProperties => {
  const e = f.eff;
  const decor: string[] = [];
  const s: CSSProperties = {
    fontFamily: cssFamily(f.font.family),
    fontSize: f.font.size,
    fontWeight: f.font.bold ? 700 : 400,
    fontStyle: f.font.italic ? 'italic' : undefined,
    color: e.color,
    backgroundColor: e.highlight ?? e.shading,
    letterSpacing: e.spacing || undefined,
  };
  if (e.underline && e.underline !== 'none') {
    decor.push('underline');
    s.textDecorationStyle = UNDERLINE[e.underline] as CSSProperties['textDecorationStyle'];
    if (e.underline === 'thick') s.textDecorationThickness = 2;
    if (e.underlineColor) s.textDecorationColor = e.underlineColor;
  }
  if (e.strike || e.doubleStrike) decor.push('line-through');
  if (e.doubleStrike) s.textDecorationStyle = 'double';
  if (e.caps) s.textTransform = 'uppercase';
  if (e.smallCaps && !e.caps) s.fontVariant = 'small-caps';
  if (e.vertAlign === 'super') s.verticalAlign = '0.45em';
  if (e.vertAlign === 'sub') s.verticalAlign = '-0.2em';
  if (e.position) { s.position = 'relative'; s.top = -e.position; }
  if (e.hidden) { decor.push('underline'); s.textDecorationStyle = 'dotted'; }
  if (e.shadow) s.textShadow = '1px 1px 1px rgba(0,0,0,.35)';
  if (e.emboss) { s.textShadow = '-1px -1px 0 rgba(255,255,255,.9), 1px 1px 1px rgba(0,0,0,.45)'; s.color = s.color ?? '#c8c8c8'; }
  if (e.imprint) { s.textShadow = '1px 1px 0 rgba(255,255,255,.9), -1px -1px 1px rgba(0,0,0,.45)'; s.color = s.color ?? '#c8c8c8'; }
  if (e.outline) { s.color = 'transparent'; s.WebkitTextStroke = `0.6px ${e.color ?? '#000'}`; }
  const r = f.run;
  if (r) {
    const markup = store.view.markup;
    if (markup === 'all') {
      if (r.ins) { s.color = authorColor(r.ins.author); decor.push('underline'); }
      if (r.del) { s.color = authorColor(r.del.author); decor.push('line-through'); }
    }
    if (markup === 'original' && r.ins) s.display = 'none';
    if (r.comments?.length && markup !== 'none' && markup !== 'original') s.backgroundColor = s.backgroundColor ?? '#fdf0c2';
  }
  if (decor.length) s.textDecorationLine = decor.join(' ');
  return s;
};

// Spans of this line only; a text box inside the line has its own lines.
export const ownSpans = (ln: HTMLElement): HTMLElement[] => [...ln.querySelectorAll<HTMLElement>('[data-f]')].filter((s) => s.closest('.ln') === ln);

export const textNodeOf = (el: Element): Node | null => {
  const a = el.querySelector('a');
  return (a ?? el).firstChild;
};

const lineFromPoint = (root: HTMLElement, x: number, y: number, story: StoryId): HTMLElement | null => {
  const pages = root.querySelectorAll<HTMLElement>('.page');
  let page: HTMLElement | null = null;
  let best = Infinity;
  pages.forEach((p) => {
    if (!p.querySelector('.ln')) return;
    const r = p.getBoundingClientRect();
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < best) { best = d; page = p; }
  });
  if (!page) return null;
  const lines = (page as HTMLElement).querySelectorAll<HTMLElement>(`.ln[data-story="${story}"]`);
  let hit: HTMLElement | null = null;
  let score = Infinity;
  lines.forEach((l) => {
    const r = l.getBoundingClientRect();
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const v = dy * 1000 + dx;
    if (v < score) { score = v; hit = l; }
  });
  return hit;
};

const offsetInLine = (ln: HTMLElement, x: number, y: number): number => {
  const from = Number(ln.dataset.from);
  const to = Number(ln.dataset.to);
  const box = ln.getBoundingClientRect();
  const rtl = ln.dir === 'rtl';
  const cy = Math.max(box.top + 1, Math.min(box.bottom - 1, y));
  const spans = ownSpans(ln);
  // Each span is scanned with a range so bidi and shaping match what is on screen.
  let nearest = rtl ? (x < box.left ? to : from) : x < box.left ? from : to;
  let bestD = Infinity;
  const rng = document.createRange();
  for (const s of spans) {
    const f = Number(s.dataset.f);
    const r = s.getBoundingClientRect();
    const atom = s.dataset.atom !== undefined || s.dataset.tab !== undefined;
    if (atom) {
      const mid = (r.left + r.right) / 2;
      const end = f + 1;
      for (const [px, off] of [[r.left, rtl ? end : f], [r.right, rtl ? f : end]] as [number, number][]) {
        const d = Math.abs(px - x);
        if (d < bestD) { bestD = d; nearest = off; }
      }
      if (x >= r.left && x <= r.right) { nearest = (x < mid) !== rtl ? f : end; bestD = 0; }
      continue;
    }
    const t = textNodeOf(s);
    if (!t || t.nodeType !== 3) continue;
    const text = t.textContent ?? '';
    if (x < r.left - 400 || x > r.right + 400) continue;
    // Binary search does not hold across bidi runs, so step by grapheme.
    let i = 0;
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const stops = [0, ...[...seg.segment(text)].map((g) => g.index + g.segment.length)];
    for (i = 0; i < stops.length; i++) {
      const off = stops[i]!;
      rng.setStart(t, off);
      rng.setEnd(t, off);
      const c = rng.getClientRects()[0] ?? (off > 0 ? (rng.setStart(t, stops[i - 1]!), rng.getBoundingClientRect()) : r);
      const px = off > 0 && !rng.getClientRects().length ? c.right : c.left;
      const d = Math.abs(px - x) + Math.abs((c.top + c.bottom) / 2 - cy) * 0.01;
      if (d < bestD) { bestD = d; nearest = f + off; }
    }
  }
  return Math.max(from, Math.min(to, nearest));
};

export const posFromDom = (root: HTMLElement, x: number, y: number, story: StoryId): Pos | null => {
  const ln = lineFromPoint(root, x, y, story);
  if (!ln) return null;
  return { story, para: ln.dataset.para!, offset: offsetInLine(ln, x, y) };
};

export const rectOfPos = (root: HTMLElement, pos: Pos): DOMRect | null => {
  const lines = root.querySelectorAll<HTMLElement>(`.ln[data-para="${pos.para}"]`);
  let ln: HTMLElement | null = null;
  for (const l of lines) {
    if (l.dataset.story !== pos.story) continue;
    const from = Number(l.dataset.from);
    const to = Number(l.dataset.to);
    if (pos.offset >= from && pos.offset <= to) {
      ln = l;
      if (pos.offset < to || !l.nextElementSibling) break;
    }
  }
  if (!ln) return null;
  const spans = ownSpans(ln);
  const box = ln.getBoundingClientRect();
  let height = box.height;
  const rng = document.createRange();
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i]!;
    const f = Number(s.dataset.f);
    if (f > pos.offset) continue;
    const atom = s.dataset.atom !== undefined || s.dataset.tab !== undefined;
    const r = s.getBoundingClientRect();
    if (r.height) height = r.height;
    if (s.classList.contains('empty')) return new DOMRect(ln.dir === 'rtl' ? box.right - 1 : r.left, r.top, 0, r.height);
    if (atom) return new DOMRect(pos.offset === f ? r.left : r.right, r.top, 0, r.height);
    const t = textNodeOf(s);
    if (!t) continue;
    const len = t.textContent?.length ?? 0;
    const off = Math.min(pos.offset - f, len);
    if (off === 0) {
      rng.setStart(t, 0); rng.setEnd(t, Math.min(1, len));
      const c = rng.getClientRects()[0];
      if (c) return new DOMRect(ln.dir === 'rtl' ? c.right : c.left, c.top, 0, c.height);
      return r;
    }
    rng.setStart(t, off - 1 > 0 ? off - 1 : 0); rng.setEnd(t, off);
    const rects = rng.getClientRects();
    const c = rects[rects.length - 1];
    if (c) {
      const rtlChar = /[֐-ࣿיִ-﷿ﹰ-﻿]/.test((t.textContent ?? '').charAt(off - 1));
      return new DOMRect(rtlChar ? c.left : c.right, c.top, 0, c.height);
    }
  }
  return new DOMRect(box.left, box.top, 0, height);
};

export const wordAt = (doc: Doc, pos: Pos): [number, number] => {
  const p = findPara(doc, pos)!;
  const text = paraRaw(p);
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
  for (const s of seg.segment(text)) {
    const end = s.index + s.segment.length;
    if (pos.offset >= s.index && pos.offset <= end && (s.isWordLike || pos.offset < end)) return [s.index, end];
  }
  return [pos.offset, pos.offset];
};

const moveChar = (doc: Doc, pos: Pos, dir: 1 | -1): Pos => {
  const p = findPara(doc, pos)!;
  const f = flatten(storyBlocks(doc, pos.story));
  const i = f.index.get(pos.para)!;
  const text = paraRaw(p);
  if (dir < 0) {
    if (pos.offset > 0) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      let last = 0;
      for (const s of seg.segment(text.slice(0, pos.offset))) last = s.index;
      return { ...pos, offset: last };
    }
    const prev = f.paras[i - 1];
    return prev ? { ...pos, para: prev.id, offset: paraLength(prev) } : pos;
  }
  if (pos.offset < text.length) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const s of seg.segment(text.slice(pos.offset))) return { ...pos, offset: pos.offset + s.segment.length };
  }
  const next = f.paras[i + 1];
  return next ? { ...pos, para: next.id, offset: 0 } : pos;
};

const moveWord = (doc: Doc, pos: Pos, dir: 1 | -1): Pos => {
  const p = findPara(doc, pos)!;
  const len = paraLength(p);
  if ((dir < 0 && pos.offset === 0) || (dir > 0 && pos.offset === len)) return moveChar(doc, pos, dir);
  return { ...pos, offset: wordBoundary(paraRaw(p), pos.offset, dir) };
};

const linesOf = (store: EditorStore, id: string): PlacedLine[] => (store.layout.lineIndex.get(id) ?? []).map((e) => e.line);

const lineOfPos = (store: EditorStore, pos: Pos): PlacedLine | undefined => {
  const ls = linesOf(store, pos.para);
  return ls.find((l) => pos.offset >= l.from && (pos.offset < l.to || l.isLast)) ?? ls[ls.length - 1];
};

const moveLine = (store: EditorStore, root: HTMLElement, pos: Pos, dir: 1 | -1, goalX: number | null): Pos => {
  const doc = store.doc;
  const cur = lineOfPos(store, pos);
  if (!cur) return pos;
  const ls = linesOf(store, pos.para);
  const i = ls.indexOf(cur);
  let target = ls[i + dir];
  if (!target) {
    const f = flatten(storyBlocks(doc, pos.story));
    const k = f.index.get(pos.para)! + dir;
    const q = f.paras[k];
    if (!q) return dir < 0 ? { ...pos, offset: 0 } : { ...pos, offset: paraLength(f.paras[f.index.get(pos.para)!]!) };
    const qs = linesOf(store, q.id);
    target = dir > 0 ? qs[0] : qs[qs.length - 1];
    if (!target) return { ...pos, para: q.id, offset: 0 };
  }
  const el = [...root.querySelectorAll<HTMLElement>(`.ln[data-para="${target.para}"]`)].find((e) => Number(e.dataset.from) === target!.from);
  if (el && goalX !== null) {
    const r = el.getBoundingClientRect();
    return { ...pos, para: target.para, offset: offsetInLine(el, goalX, (r.top + r.bottom) / 2) };
  }
  return { ...pos, para: target.para, offset: target.from };
};

let goalX: number | null = null;

const extendOrMove = (store: EditorStore, shift: boolean, pos: Pos, keepGoal = false): void => {
  if (!keepGoal) goalX = null;
  store.setSel(shift ? { anchor: store.sel.anchor, focus: pos } : collapsed(pos));
};

const nextCell = (store: EditorStore, dir: 1 | -1): boolean => {
  const { doc, sel } = store;
  const f = flatten(storyBlocks(doc, sel.focus.story));
  const home = cellOf(store);
  if (!home) return false;
  const { table, r, c } = home;
  let row = r;
  let col = c + dir;
  if (col >= table.rows[row]!.cells.length) { row++; col = 0; }
  if (col < 0) { row--; col = (table.rows[row]?.cells.length ?? 1) - 1; }
  const cell = table.rows[row]?.cells[col];
  if (!cell) return false;
  const first = cell.blocks.find((b) => b.type === 'p') as Paragraph | undefined;
  if (!first) return false;
  void f;
  store.setSel({ anchor: { ...sel.focus, para: first.id, offset: 0 }, focus: { ...sel.focus, para: first.id, offset: paraLength(first) } });
  return true;
};

import { locate } from '../core/tree';

export const cellOf = (store: EditorStore) => {
  const h = locate(storyBlocks(store.doc, store.sel.focus.story), store.sel.focus.para);
  return h?.table ? { table: h.table, r: h.rowIndex!, c: h.cellIndex! } : null;
};

export const handleKey = (store: EditorStore, e: KeyboardEvent, root: HTMLElement): void => {
  const mod = e.ctrlKey || e.metaKey;
  const { sel, doc } = store;
  const pos = sel.focus;
  const k = e.key;
  if (runCommandForKey(store, e)) { e.preventDefault(); return; }
  if (k === 'Enter') { e.preventDefault(); if (e.shiftKey) store.typeText('\n'); else if (mod) store.typeText('\f'); else store.enter(); return; }
  if (k === 'Backspace') { e.preventDefault(); store.backspace(mod || e.altKey); return; }
  if (k === 'Delete') { e.preventDefault(); store.deleteForward(mod || e.altKey); return; }
  if (k === 'Tab') {
    e.preventDefault();
    if (nextCell(store, e.shiftKey ? -1 : 1)) return;
    store.typeText('\t');
    return;
  }
  if (k === 'Escape') { store.setSel(collapsed(pos)); if (pos.story !== 'body') store.enterStory('body'); return; }
  const rtl = lineOfPos(store, pos)?.rtl ?? false;
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    const forward = (k === 'ArrowRight') !== rtl ? 1 : -1;
    if (!e.shiftKey && !isCollapsed(sel)) { const [a, b] = orderedSel(doc, sel); extendOrMove(store, false, forward > 0 ? b : a); return; }
    extendOrMove(store, e.shiftKey, mod || e.altKey ? moveWord(doc, pos, forward as 1 | -1) : moveChar(doc, pos, forward as 1 | -1));
    return;
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
    const dir = k === 'ArrowDown' ? 1 : -1;
    if (mod) {
      const p = findPara(doc, pos)!;
      const f = flatten(storyBlocks(doc, pos.story));
      const i = f.index.get(p.id)!;
      if (dir < 0) extendOrMove(store, e.shiftKey, pos.offset > 0 ? { ...pos, offset: 0 } : f.paras[i - 1] ? { ...pos, para: f.paras[i - 1]!.id, offset: 0 } : pos);
      else extendOrMove(store, e.shiftKey, f.paras[i + 1] ? { ...pos, para: f.paras[i + 1]!.id, offset: 0 } : { ...pos, offset: paraLength(p) });
      return;
    }
    if (goalX === null) goalX = rectOfPos(root, pos)?.left ?? null;
    extendOrMove(store, e.shiftKey, moveLine(store, root, pos, dir, goalX), true);
    return;
  }
  if (k === 'Home' || k === 'End') {
    e.preventDefault();
    if (mod) { extendOrMove(store, e.shiftKey, k === 'Home' ? docStart(doc, pos.story) : docEnd(doc, pos.story)); return; }
    const l = lineOfPos(store, pos);
    if (l) extendOrMove(store, e.shiftKey, { ...pos, offset: k === 'Home' ? l.from : (l.isLast ? l.to : Math.max(l.from, l.to - (l.frags.some((f) => f.kind === 'mark') ? 1 : 0))) });
    return;
  }
  if (k === 'PageUp' || k === 'PageDown') {
    e.preventDefault();
    const dir = k === 'PageDown' ? 1 : -1;
    let p = pos;
    for (let i = 0; i < 30; i++) p = moveLine(store, root, p, dir as 1 | -1, null);
    extendOrMove(store, e.shiftKey, p);
  }
};

const MIME = 'application/x-clerdodraft';

export const copyBlocks = (store: EditorStore): Block[] => {
  const { doc, sel } = store;
  const [a, b] = orderedSel(doc, sel);
  return selectedParas(doc, sel).map((p) => {
    const from = p.id === a.para ? a.offset : 0;
    const to = p.id === b.para ? b.offset : paraLength(p);
    return { ...p, runs: sliceRuns(p.runs, from, to), section: undefined, bookmarks: undefined };
  });
};

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const runToHtml = (text: string, p: RunProps): string => {
  let h = escapeHtml(text.replaceAll(ATOM_CHAR, ''));
  if (p.bold) h = `<b>${h}</b>`;
  if (p.italic) h = `<i>${h}</i>`;
  if (p.underline && p.underline !== 'none') h = `<u>${h}</u>`;
  if (p.strike) h = `<s>${h}</s>`;
  return h;
};

export const handleCopy = (store: EditorStore, e: ClipboardEvent): void => {
  e.preventDefault();
  if (isCollapsed(store.sel)) return;
  const blocks = copyBlocks(store);
  e.clipboardData.setData('text/plain', selectedText(store.doc, store.sel));
  e.clipboardData.setData('text/html', blocks.map((b) => (b.type === 'p' ? `<p>${b.runs.map((r) => runToHtml(r.text, r.props)).join('')}</p>` : '')).join(''));
  e.clipboardData.setData(MIME, JSON.stringify(blocks));
};

const safeHref = (h: string | null): string | undefined => (h && /^(https?:|mailto:|#)/i.test(h) ? h : undefined);

// Parses clipboard HTML with an inert document, so nothing from it can run.
export const blocksFromHtml = (html: string): Block[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Block[] = [];
  const walk = (n: Node, props: RunProps, runs: Paragraph['runs'], link?: { href: string }) => {
    if (n.nodeType === 3) {
      const t = (n.textContent ?? '').replace(/\s+/g, ' ');
      if (t) runs.push({ text: t, props, ...(link ? { link } : {}) });
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    if (tag === 'BR') { runs.push({ text: '\n', props }); return; }
    const p = { ...props };
    if (tag === 'B' || tag === 'STRONG' || Number(el.style.fontWeight) >= 600 || el.style.fontWeight === 'bold') p.bold = true;
    if (tag === 'I' || tag === 'EM' || el.style.fontStyle === 'italic') p.italic = true;
    if (tag === 'U') p.underline = 'single';
    if (tag === 'S' || tag === 'STRIKE') p.strike = true;
    const href = tag === 'A' ? safeHref(el.getAttribute('href')) : undefined;
    el.childNodes.forEach((c) => walk(c, p, runs, href ? { href } : link));
  };
  const blockTags = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TR)$/;
  const flush = (el: Element) => {
    const runs: Paragraph['runs'] = [];
    walk(el, {}, runs);
    if (!runs.length) return;
    const h = /^H([1-6])$/.exec(el.tagName);
    out.push(para(runs, h ? { style: `Heading${h[1]}` } : {}));
  };
  const visit = (el: Element) => {
    const hasBlock = [...el.children].some((c) => blockTags.test(c.tagName) || c.tagName === 'UL' || c.tagName === 'OL' || c.tagName === 'TABLE' || c.tagName === 'TBODY');
    if (blockTags.test(el.tagName) && !hasBlock) flush(el);
    else if (hasBlock) [...el.children].forEach(visit);
    else if (el.textContent?.trim()) flush(el);
  };
  [...doc.body.children].forEach(visit);
  return out;
};

export const handlePaste = (store: EditorStore, e: ClipboardEvent): void => {
  e.preventDefault();
  const cd = e.clipboardData;
  const image = [...cd.items].find((i) => i.type.startsWith('image/'));
  const custom = cd.getData(MIME);
  if (custom) {
    try {
      const blocks = JSON.parse(custom) as Block[];
      if (Array.isArray(blocks)) { store.insertContent(blocks); return; }
    } catch { /* fall through to the plain formats */ }
  }
  const html = cd.getData('text/html');
  if (html) {
    const blocks = blocksFromHtml(html);
    if (blocks.length) { store.insertContent(blocks); return; }
  }
  const text = cd.getData('text/plain');
  if (text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    store.insertContent(lines.map((l) => para(l ? [{ text: l, props: {} }] : [])));
    return;
  }
  if (image) {
    const file = image.getAsFile();
    if (file) void import('../features/images').then((m) => m.insertImageFile(store, file));
  }
};

export type { Selection };
