import nspell from 'nspell';
import { arabicVariants } from './arabic';

const spellers = new Map<string, ReturnType<typeof nspell>>();

export interface Request {
  id: number;
  op: 'load' | 'check' | 'suggest';
  lang: string;
  words: string[];
  aff?: string;
  dic?: string;
}

const correct = (lang: string, s: ReturnType<typeof nspell>, w: string): boolean => (lang === 'ar' ? arabicVariants(w).some((v) => s.correct(v)) : s.correct(w));

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, op, lang, words, aff, dic } = e.data;
  if (op === 'load') {
    if (!spellers.has(lang) && aff && dic) spellers.set(lang, nspell(aff, dic));
    self.postMessage({ id });
    return;
  }
  const s = spellers.get(lang);
  if (!s) { self.postMessage({ id, wrong: [], suggestions: [] }); return; }
  if (op === 'check') self.postMessage({ id, wrong: words.filter((w) => !correct(lang, s, w)) });
  else self.postMessage({ id, suggestions: s.suggest(words[0] ?? '').slice(0, 6) });
};
