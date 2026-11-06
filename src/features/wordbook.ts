export interface WordEntry {
  word: string;
  definitions: { part: string; text: string }[];
  synonyms: string[];
}

const PARTS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

let book: Promise<Map<string, string>> | null = null;

const load = (): Promise<Map<string, string>> => {
  book ??= import('./proof/wordbook.txt?raw').then((m) => {
    const map = new Map<string, string>();
    for (const line of m.default.split('\n')) {
      const tab = line.indexOf('\t');
      if (tab > 0) map.set(line.slice(0, tab), line.slice(tab + 1));
    }
    return map;
  });
  return book;
};

// Simple ending rules are enough to reach the base form of a typed word.
const baseForms = (w: string): string[] => {
  const out = [w];
  const add = (cond: boolean, x: string) => { if (cond) out.push(x); };
  add(w.endsWith('ies'), `${w.slice(0, -3)}y`);
  add(w.endsWith('es'), w.slice(0, -2));
  add(w.endsWith('s'), w.slice(0, -1));
  add(w.endsWith('ied'), `${w.slice(0, -3)}y`);
  add(w.endsWith('ed'), w.slice(0, -2));
  add(w.endsWith('ed'), w.slice(0, -1));
  add(w.endsWith('ing'), w.slice(0, -3));
  add(w.endsWith('ing'), `${w.slice(0, -3)}e`);
  add(/(.)\1(ed|ing)$/.test(w), w.replace(/.(ed|ing)$/, ''));
  add(w.endsWith('ly'), w.slice(0, -2));
  add(w.endsWith('er'), w.slice(0, -2));
  add(w.endsWith('est'), w.slice(0, -3));
  return out;
};

export const lookupWord = async (input: string): Promise<WordEntry | null> => {
  const map = await load();
  const clean = input.trim().toLowerCase().replace(/[’]/g, "'");
  for (const form of baseForms(clean)) {
    const hit = map.get(form);
    if (hit === undefined) continue;
    const [defs = '', syn = ''] = hit.split('\t');
    const definitions = defs.split('|').filter(Boolean).map((d) => {
      const at = d.indexOf(': ');
      return { part: PARTS[d.slice(0, at)] ?? '', text: d.slice(at + 2) };
    });
    return { word: form, definitions, synonyms: syn.split(',').filter(Boolean) };
  }
  return null;
};

export const matchCase = (original: string, word: string): string => {
  if (original.length > 1 && original === original.toUpperCase()) return word.toUpperCase();
  if (original[0] && original[0] === original[0].toUpperCase()) return word[0]!.toUpperCase() + word.slice(1);
  return word;
};
