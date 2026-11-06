import { hyphenateSync as english } from 'hyphen/en';

type Fn = (word: string) => string;

// English is built in; other languages load the first time they are needed.
const LOADERS: Record<string, () => Promise<{ hyphenateSync: Fn }>> = {
  fr: () => import('hyphen/fr'), es: () => import('hyphen/es'), de: () => import('hyphen/de'), it: () => import('hyphen/it'), pt: () => import('hyphen/pt'),
  nl: () => import('hyphen/nl'), ru: () => import('hyphen/ru'), sv: () => import('hyphen/sv'), da: () => import('hyphen/da'), nb: () => import('hyphen/nb'),
  pl: () => import('hyphen/pl'), tr: () => import('hyphen/tr'), cs: () => import('hyphen/cs'), fi: () => import('hyphen/fi'), hu: () => import('hyphen/hu'),
  ro: () => import('hyphen/ro'), uk: () => import('hyphen/uk'), el: () => import('hyphen/el'), ca: () => import('hyphen/ca'), hr: () => import('hyphen/hr'),
};

const ready = new Map<string, Fn>([['en', english]]);
const waiting = new Set<string>();
const listeners = new Set<() => void>();

export const onHyphenationLoaded = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export const hyphenatorFor = (lang?: string): Fn | undefined => {
  const base = (lang ?? 'en').toLowerCase().split('-')[0]!;
  const hit = ready.get(base);
  if (hit) return hit;
  const load = LOADERS[base];
  if (load && !waiting.has(base)) {
    waiting.add(base);
    void load().then((m) => { ready.set(base, m.hyphenateSync); listeners.forEach((f) => f()); }).catch(() => undefined);
  }
  return undefined;
};
