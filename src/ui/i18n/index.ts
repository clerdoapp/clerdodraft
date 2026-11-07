type Table = Record<string, string>;

// Interface languages. Each table is loaded only when it is chosen, keyed by the English text.
export const LANGUAGES: { code: string; name: string; rtl?: boolean; load?: () => Promise<Table> }[] = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية', rtl: true, load: () => import('./ar').then((m) => ({ ...m.AR, ...m.AR_SHAPES })) },
  { code: 'de', name: 'Deutsch', load: () => import('./de').then((m) => m.default) },
  { code: 'es', name: 'Español', load: () => import('./es').then((m) => m.default) },
  { code: 'fa', name: 'فارسی', rtl: true, load: () => import('./fa').then((m) => m.default) },
  { code: 'fr', name: 'Français', load: () => import('./fr').then((m) => m.default) },
  { code: 'hi', name: 'हिन्दी', load: () => import('./hi').then((m) => m.default) },
  { code: 'id', name: 'Bahasa Indonesia', load: () => import('./id').then((m) => m.default) },
  { code: 'it', name: 'Italiano', load: () => import('./it').then((m) => m.default) },
  { code: 'ja', name: '日本語', load: () => import('./ja').then((m) => m.default) },
  { code: 'ko', name: '한국어', load: () => import('./ko').then((m) => m.default) },
  { code: 'nl', name: 'Nederlands', load: () => import('./nl').then((m) => m.default) },
  { code: 'pl', name: 'Polski', load: () => import('./pl').then((m) => m.default) },
  { code: 'pt', name: 'Português', load: () => import('./pt').then((m) => m.default) },
  { code: 'ru', name: 'Русский', load: () => import('./ru').then((m) => m.default) },
  { code: 'tr', name: 'Türkçe', load: () => import('./tr').then((m) => m.default) },
  { code: 'uk', name: 'Українська', load: () => import('./uk').then((m) => m.default) },
  { code: 'ur', name: 'اردو', rtl: true, load: () => import('./ur').then((m) => m.default) },
  { code: 'zh', name: '简体中文', load: () => import('./zh').then((m) => m.default) },
];

export type UiLang = string;
const KEY = 'clerdodraft.ui';
let TABLE: Table = {};

export const uiLang = (): UiLang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* use the default */ }
  return 'en';
};

// The first time, follow the system language when the app has it.
export const startLang = (): UiLang => {
  try { if (localStorage.getItem(KEY)) return uiLang(); } catch { return 'en'; }
  const sys = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGUAGES.some((l) => l.code === sys) ? sys : 'en';
};

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

export const setUiLang = async (lang: UiLang, remember = true): Promise<void> => {
  const def = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]!;
  if (remember) { try { localStorage.setItem(KEY, def.code); } catch { /* this session only */ } }
  observer?.disconnect();
  // Put the English text back first, so moving between two languages starts from the source.
  apply(document.body, 'en');
  TABLE = def.load ? await def.load() : {};
  lang = def.code;
  document.documentElement.lang = lang;
  document.documentElement.dir = def.rtl ? 'rtl' : 'ltr';
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
