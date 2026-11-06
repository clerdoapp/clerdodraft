import nspell from 'nspell';
import usAff from '../../../node_modules/dictionary-en/index.aff?raw';
import usDic from '../../../node_modules/dictionary-en/index.dic?raw';
import gbAff from '../../../node_modules/dictionary-en-gb/index.aff?raw';
import gbDic from '../../../node_modules/dictionary-en-gb/index.dic?raw';

type Lang = 'en-US' | 'en-GB';
const spellers = new Map<Lang, ReturnType<typeof nspell>>();

const speller = (lang: Lang) => {
  let s = spellers.get(lang);
  if (!s) {
    s = lang === 'en-GB' ? nspell(gbAff, gbDic) : nspell(usAff, usDic);
    spellers.set(lang, s);
  }
  return s;
};

export interface Request {
  id: number;
  op: 'check' | 'suggest';
  lang: Lang;
  words: string[];
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, op, lang, words } = e.data;
  const s = speller(lang);
  if (op === 'check') self.postMessage({ id, wrong: words.filter((w) => !s.correct(w)) });
  else self.postMessage({ id, suggestions: s.suggest(words[0] ?? '').slice(0, 6) });
};
