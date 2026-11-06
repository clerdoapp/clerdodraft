export interface Finding {
  from: number;
  to: number;
  message: string;
  fix?: string;
}

interface Rule {
  re: RegExp;
  message: string;
  fix?: (m: RegExpExecArray) => string | undefined;
  range?: (m: RegExpExecArray) => [number, number];
}

const keepCase = (from: string, to: string): string => (/^\p{Lu}/u.test(from) ? to[0]!.toUpperCase() + to.slice(1) : to);

const phrase = (wrong: string, right: string, message: string): Rule => ({
  re: new RegExp(`\\b${wrong}\\b`, 'gi'),
  message,
  fix: (m) => keepCase(m[0], right),
});

const VOWEL_SOUND_EXCEPT = /^(uni[^nmd]|use|used|user|usual|utility|euro|one|once|ubiquit|unanim|ufo)/i;
const SILENT_H = /^(hour|honest|honou?r|heir)/i;

const ABBREV = /(?:\b(?:e\.g|i\.e|etc|vs|cf|al|approx|no|fig|mr|mrs|ms|dr|prof|st)\.|\b\p{L}\.)\s+$/iu;

const RULES: Rule[] = [
  { re: /\b(\p{L}+)(\s+)\1\b/giu, message: 'This word is repeated.', fix: (m) => m[1]!, },
  { re: /(?<=\S) {2,}(?=\S)/g, message: 'Use one space here.', fix: () => ' ' },
  { re: /(?<=\p{L}) +(?=[,.;:!?](\s|$))/gu, message: 'Remove the space before the punctuation.', fix: () => '' },
  { re: /(?<=[a-z][,;:])(?=\p{L})/gu, message: 'Add a space after the punctuation.', fix: () => ' ', range: (m) => [m.index - 1, m.index + 1] },
  { re: /\b(could|would|should|might|must) of\b/gi, message: 'Use "have" here.', fix: (m) => `${m[1]} have` },
  { re: /\b(I|we|you|they) (is|was has)\b/g, message: 'The verb does not agree with the subject.', fix: (m) => `${m[1]} ${m[1] === 'I' ? 'am' : 'are'}` },
  { re: /\bI are\b/g, message: 'The verb does not agree with the subject.', fix: () => 'I am' },
  { re: /\b(he|she|it) (are|were not)\b/gi, message: 'The verb does not agree with the subject.', fix: (m) => `${m[1]} is` },
  { re: /\b(he|she|it) (have|do|go|don't)\b(?! not)/gi, message: 'The verb does not agree with the subject.', fix: (m) => `${m[1]} ${({ have: 'has', do: 'does', go: 'goes', "don't": "doesn't" } as Record<string, string>)[m[2]!.toLowerCase()]}` },
  { re: /\b(they|we|you) (has|does|goes|doesn't)\b/gi, message: 'The verb does not agree with the subject.', fix: (m) => `${m[1]} ${({ has: 'have', does: 'do', goes: 'go', "doesn't": "don't" } as Record<string, string>)[m[2]!.toLowerCase()]}` },
  { re: /\bI (has|does|goes|doesn't)\b/g, message: 'The verb does not agree with the subject.', fix: (m) => `I ${({ has: 'have', does: 'do', goes: 'go', "doesn't": "don't" } as Record<string, string>)[m[1]!]}` },
  { re: /\b(there) (is|was) (many|several|few|two|three|four|five)\b/gi, message: 'Use a plural verb here.', fix: (m) => `${m[1]} ${m[2]!.toLowerCase() === 'is' ? 'are' : 'were'} ${m[3]}` },
  { re: /\b(more|less|better|worse|bigger|smaller|faster|slower|higher|lower|greater|older|younger|rather) then\b/gi, message: 'Use "than" for comparisons.', fix: (m) => `${m[1]} than` },
  { re: /\b(a|an) (\p{L}+)/giu, message: 'Check the article before this word.', fix: (m) => {
    const word = m[2]!;
    if (word.length < 2 || /^[A-Z]{2,}$/.test(word)) return undefined;
    const vowel = (/^[aeiou]/i.test(word) && !VOWEL_SOUND_EXCEPT.test(word)) || SILENT_H.test(word);
    const isAn = m[1]!.toLowerCase() === 'an';
    if (vowel === isAn) return undefined;
    return `${keepCase(m[1]!, vowel ? 'an' : 'a')} ${word}`;
  } },
  { re: /(?<=[.!?]\s+)\p{Ll}\p{L}+/gu, message: 'Start a sentence with a capital letter.', fix: (m) => (ABBREV.test(m.input.slice(Math.max(0, m.index - 8), m.index)) ? undefined : m[0][0]!.toUpperCase() + m[0].slice(1)) },
  { re: /\b(its) (a|an|the|been|going|not|very|been)\b/gi, message: 'This may need "it\'s".', fix: (m) => `${keepCase(m[1]!, "it's")} ${m[2]}` },
  { re: /\b(your) (a|an|the|welcome|right|wrong|going|not|very)\b/gi, message: 'This may need "you\'re".', fix: (m) => `${keepCase(m[1]!, "you're")} ${m[2]}` },
  { re: /\b(their) (is|are|was|were)\b/gi, message: 'This may need "there".', fix: (m) => `${keepCase(m[1]!, 'there')} ${m[2]}` },
  { re: /\b(there) (house|car|name|work|own|friends|family|team|company)\b/gi, message: 'This may need "their".', fix: (m) => `${keepCase(m[1]!, 'their')} ${m[2]}` },
  { re: /\b(to) (much|many|late|early|big|small|fast|slow)\b/gi, message: 'This may need "too".', fix: (m) => `${keepCase(m[1]!, 'too')} ${m[2]}` },
  { re: /\b(loose) (weight|money|the game|time)\b/gi, message: 'This may need "lose".', fix: (m) => `${keepCase(m[1]!, 'lose')} ${m[2]}` },
  { re: /\b(affect) (of|on)\b/gi, message: 'This may need "effect".', fix: (m) => `${keepCase(m[1]!, 'effect')} ${m[2]}` },
  { re: /\b(fewer|less) (\p{L}+s)\b/giu, message: 'Use "fewer" with things you can count.', fix: (m) => (m[1]!.toLowerCase() === 'less' && !/(ss|us|is|news|series)$/i.test(m[2]!) ? `${keepCase(m[1]!, 'fewer')} ${m[2]}` : undefined) },
  phrase('alot', 'a lot', 'Write this as two words.'),
  phrase('alright', 'all right', 'Formal writing prefers "all right".'),
  phrase('irregardless', 'regardless', 'Use "regardless".'),
  phrase('should of', 'should have', 'Use "have" here.'),
  phrase('for all intensive purposes', 'for all intents and purposes', 'Check this phrase.'),
  phrase('suppose to', 'supposed to', 'Use "supposed to".'),
  phrase('use to', 'used to', 'This may need "used to".'),
  phrase('each others', "each other's", 'Check the apostrophe.'),
  phrase('very unique', 'unique', '"Unique" does not need "very".'),
  phrase('in order to', 'to', 'A shorter form reads better.'),
  phrase('due to the fact that', 'because', 'A shorter form reads better.'),
];

const ARABIC_RULES: Rule[] = [
  { re: /(?<=\p{Script=Arabic}) +(?=[،؛؟.!:])/gu, message: 'احذف المسافة قبل علامة الترقيم.', fix: () => '' },
  { re: /(?<=[،؛؟])(?=\p{Script=Arabic})/gu, message: 'أضف مسافة بعد علامة الترقيم.', fix: () => ' ', range: (m) => [m.index - 1, m.index] },
];

export const checkGrammar = (text: string): Finding[] => {
  const out: Finding[] = [];
  for (const rule of [...RULES, ...ARABIC_RULES]) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      if (m[0].length === 0) rule.re.lastIndex++;
      const fix = rule.fix?.(m);
      if (rule.fix && fix === undefined) continue;
      const [from, to] = rule.range ? rule.range(m) : [m.index, m.index + m[0].length];
      const replacement = rule.range && fix !== undefined ? text.slice(from, to).replace(/^(.)(.*)$/su, (_a, a: string) => a + fix + text.slice(from + 1, to)) : fix;
      out.push({ from, to, message: rule.message, fix: replacement });
    }
  }
  return out.sort((a, b) => a.from - b.from).filter((f, i, l) => !l.slice(0, i).some((g) => f.from < g.to && g.from < f.to));
};

export interface Word {
  from: number;
  to: number;
  word: string;
}

const LATIN_WORD = /[\p{Script=Latin}][\p{Script=Latin}\p{M}'’]*|[\p{Script=Arabic}][\p{Script=Arabic}\p{M}]*|[\p{Script=Cyrillic}][\p{Script=Cyrillic}\p{M}]*/gu;

export const spellWords = (text: string): Word[] => {
  const out: Word[] = [];
  const skipZones: [number, number][] = [];
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/gi)) skipZones.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(LATIN_WORD)) {
    let w = m[0].replace(/’/g, "'").replace(/'+$/, '');
    const from = m.index;
    const to = from + w.length;
    if (w.endsWith("'s")) w = w.slice(0, -2);
    if (w.length < 2) continue;
    if (/\d/.test(text[from - 1] ?? '') || /\d/.test(text[to] ?? '')) continue;
    if (/\p{Lu}/u.test(w) && w === w.toUpperCase()) continue;
    if (/\p{Ll}\p{Lu}/u.test(w)) continue;
    if (skipZones.some(([a, b]) => from >= a && to <= b)) continue;
    out.push({ from, to, word: w });
  }
  return out;
};

const syllables = (w: string): number => {
  const s = w.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, s.match(/[aeiouy]{1,2}/g)?.length ?? 1);
};

export const readability = (text: string): { sentences: number; wordsPerSentence: number; ease: number; grade: number } => {
  const words = text.match(/\p{L}[\p{L}'’-]*/gu) ?? [];
  const sentences = Math.max(1, text.match(/[.!?؟]+(\s|$)/g)?.length ?? 1);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const n = Math.max(1, words.length);
  const a = n / sentences;
  const b = syl / n;
  return { sentences, wordsPerSentence: +a.toFixed(1), ease: +(206.835 - 1.015 * a - 84.6 * b).toFixed(1), grade: +(0.39 * a + 11.8 * b - 15.59).toFixed(1) };
};
