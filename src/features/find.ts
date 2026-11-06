import type { Pos } from '../core/model';
import { insertText } from '../core/ops';
import { flatten, paraLength, rawParaText, storyBlocks } from '../core/tree';
import type { EditorStore } from '../editor/store';

export interface FindOptions {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface Match {
  para: string;
  from: number;
  to: number;
}

const toRegex = (o: FindOptions): RegExp | null => {
  if (!o.query) return null;
  let src = o.regex ? o.query : o.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(src, `gu${o.matchCase ? '' : 'i'}`);
  } catch {
    return null;
  }
};

export const findAll = (store: EditorStore, o: FindOptions): Match[] => {
  const re = toRegex(o);
  if (!re) return [];
  const out: Match[] = [];
  for (const p of flatten(storyBlocks(store.doc, 'body')).paras) {
    const t = rawParaText(p);
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (!m[0].length) continue;
      out.push({ para: p.id, from: m.index, to: m.index + m[0].length });
      if (out.length >= 20000) return out;
    }
  }
  return out;
};

export const selectMatch = (store: EditorStore, m: Match): void => {
  const pos: Pos = { story: 'body', para: m.para, offset: m.from };
  store.setSel({ anchor: pos, focus: { ...pos, offset: m.to } });
};

export const nextMatch = (store: EditorStore, o: FindOptions, dir: 1 | -1): number => {
  const all = findAll(store, o);
  if (!all.length) return 0;
  const f = flatten(storyBlocks(store.doc, 'body'));
  const focus = store.sel.focus;
  const idx = f.index.get(focus.para) ?? 0;
  const key = (m: Match) => (f.index.get(m.para) ?? 0) * 1e7 + m.from;
  const cur = idx * 1e7 + (dir > 0 ? Math.min(focus.offset, paraLength(f.paras[idx]!)) : Math.min(store.sel.anchor.offset, focus.offset));
  const hit = dir > 0 ? all.find((m) => key(m) >= cur) ?? all[0]! : [...all].reverse().find((m) => key(m) < cur) ?? all[all.length - 1]!;
  selectMatch(store, hit);
  return all.length;
};

export const replaceAll = (store: EditorStore, o: FindOptions, replacement: string): number => {
  const all = findAll(store, o).reverse();
  let doc = store.doc;
  for (const m of all) {
    const pos: Pos = { story: 'body', para: m.para, offset: m.from };
    doc = insertText(doc, { anchor: pos, focus: { ...pos, offset: m.to } }, replacement, undefined, store.ctx).doc;
  }
  if (all.length) store.commit(doc);
  return all.length;
};

export const replaceOne = (store: EditorStore, o: FindOptions, replacement: string): void => {
  const sel = store.sel;
  const m = findAll(store, o).find((x) => x.para === sel.anchor.para && x.from === Math.min(sel.anchor.offset, sel.focus.offset) && x.to === Math.max(sel.anchor.offset, sel.focus.offset));
  if (m) store.commit(insertText(store.doc, sel, replacement, undefined, store.ctx));
  nextMatch(store, o, 1);
};
