import { AR, AR_SHAPES } from './ar';

export type UiLang = 'en' | 'ar';
const KEY = 'clerdodraft.ui';
const TABLE: Record<string, string> = { ...AR, ...AR_SHAPES };

export const uiLang = (): UiLang => { try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; } };

// Keeps the English text so switching back is exact.
const original = new WeakMap<Node, string>();
const originalAttr = new WeakMap<Element, Record<string, string>>();
const ATTRS = ['title', 'aria-label', 'placeholder'];
const SKIP = '.page, .readbody, .ime, .eqpreview, .chartprev, .fontlist, .fontbtn, .translation, [data-no-translate], textarea, input, select option[data-raw]';

const translate = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  const hit = TABLE[t];
  if (hit) return s.replace(t, hit);
  // Text such as "Shapes (152)" or "12 found" keeps its number.
  const m = /^(.*?)(\s*\(?\d[\d,.]*\)?\s*)(.*)$/.exec(t);
  if (m) {
    const a = m[1]!.trim(); const b = m[3]!.trim();
    const ta = a ? TABLE[a] : ''; const tb = b ? TABLE[b] : '';
    if ((a && ta) || (b && tb)) return s.replace(t, `${a ? (ta || a) : ''}${m[2]}${b ? (tb || b) : ''}`.trim());
  }
  return null;
};

const apply = (root: Node, lang: UiLang): void => {
  const el = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement;
  if (el?.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const visit = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (lang === 'en') { const o = original.get(n); if (o !== undefined && n.nodeValue !== o) n.nodeValue = o; return; }
      const cur = n.nodeValue ?? '';
      const known = original.get(n);
      const source = known !== undefined && TABLE[known.trim()] && cur === translate(known) ? known : cur;
      const out = translate(source);
      if (out && out !== cur) { original.set(n, source); n.nodeValue = out; }
      return;
    }
    const e = n as Element;
    for (const a of ATTRS) {
      const v = e.getAttribute(a);
      if (!v) continue;
      const store = originalAttr.get(e) ?? {};
      if (lang === 'en') { if (store[a] && v !== store[a]) e.setAttribute(a, store[a]!); continue; }
      const src = store[a] && translate(store[a]!) === v ? store[a]! : v;
      const out = translate(src);
      if (out && out !== v) { store[a] = src; originalAttr.set(e, store); e.setAttribute(a, out); }
    }
  };
  if (root.nodeType === Node.TEXT_NODE) { visit(root); return; }
  visit(root);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) visit(n);
};

let observer: MutationObserver | null = null;

export const setUiLang = (lang: UiLang): void => {
  try { localStorage.setItem(KEY, lang); } catch { /* this session only */ }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  observer?.disconnect();
  apply(document.body, lang);
  if (lang === 'en') { observer = null; return; }
  observer = new MutationObserver((list) => {
    observer!.disconnect();
    for (const m of list) {
      if (m.type === 'characterData') apply(m.target, lang);
      else if (m.type === 'attributes') apply(m.target, lang);
      else m.addedNodes.forEach((n) => apply(n, lang));
    }
    observer!.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
};
