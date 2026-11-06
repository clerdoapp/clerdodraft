// The Arabic word list relies on prefix and suffix rules the speller can't apply, so common
// attached letters are removed here and each remaining stem is looked up.
const PRE = ['وبال', 'وكال', 'وال', 'فال', 'بال', 'كال', 'ولل', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'س'];
const SUF = ['كما', 'هما', 'تما', 'تين', 'تان', 'كم', 'كن', 'هم', 'هن', 'نا', 'ها', 'ون', 'ين', 'ات', 'ان', 'وا', 'تم', 'ه', 'ك', 'ي', 'ا', 'ة', 'ت'];
const normal = (w: string): string => w.replace(/[ً-ْـ]/g, '');

export const arabicVariants = (word: string): string[] => {
  const w = normal(word);
  const out = new Set<string>([w]);
  const stems = new Set<string>([w]);
  for (const p of PRE) if (w.startsWith(p) && w.length - p.length >= 2) stems.add(w.slice(p.length));
  for (const st of [...stems]) {
    out.add(st);
    for (const x of SUF) {
      if (!st.endsWith(x) || st.length - x.length < 2) continue;
      const b = st.slice(0, -x.length);
      out.add(b); out.add(`${b}ة`); out.add(`${b}ه`);
      for (const y of SUF) if (b.endsWith(y) && b.length - y.length >= 2) { out.add(b.slice(0, -y.length)); out.add(`${b.slice(0, -y.length)}ة`); }
    }
  }
  for (const v of [...out]) { if (/^[أإآ]/.test(v)) out.add(`ا${v.slice(1)}`); if (v.startsWith('ا')) { out.add(`أ${v.slice(1)}`); out.add(`إ${v.slice(1)}`); } if (v.endsWith('ئ')) out.add(`${v.slice(0, -1)}ء`); }
  return [...out];
};
