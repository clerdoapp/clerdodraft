// Each dictionary loads the first time text in that language is checked.
type Pair = [Promise<{ default: string }>, Promise<{ default: string }>];

const SOURCES: Record<string, () => Pair> = {
  'en-US': () => [import('../../../node_modules/dictionary-en/index.aff?raw'), import('../../../node_modules/dictionary-en/index.dic?raw')],
  'en-GB': () => [import('../../../node_modules/dictionary-en-gb/index.aff?raw'), import('../../../node_modules/dictionary-en-gb/index.dic?raw')],
  fr: () => [import('../../../node_modules/dictionary-fr/index.aff?raw'), import('../../../node_modules/dictionary-fr/index.dic?raw')],
  es: () => [import('../../../node_modules/dictionary-es/index.aff?raw'), import('../../../node_modules/dictionary-es/index.dic?raw')],
  pt: () => [import('../../../node_modules/dictionary-pt/index.aff?raw'), import('../../../node_modules/dictionary-pt/index.dic?raw')],
  nl: () => [import('../../../node_modules/dictionary-nl/index.aff?raw'), import('../../../node_modules/dictionary-nl/index.dic?raw')],
  ru: () => [import('../../../node_modules/dictionary-ru/index.aff?raw'), import('../../../node_modules/dictionary-ru/index.dic?raw')],
  ar: () => [import('./dict/ar/ar.aff?raw'), import('./dict/ar/ar.dic?raw')],
};

export const SPELL_LANGS: [string, string][] = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['ar', 'Arabic'], ['fr', 'French'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian']];

export const spellLang = (tag: string | undefined): string | null => {
  const t = (tag ?? 'en-US').toLowerCase();
  if (t === 'en-gb' || t === 'en-au' || t === 'en-nz' || t === 'en-ie' || t === 'en-za') return 'en-GB';
  if (t.startsWith('en')) return 'en-US';
  const base = t.split('-')[0]!;
  return base in SOURCES ? base : null;
};

export const loadDictionary = async (lang: string): Promise<{ aff: string; dic: string } | null> => {
  const src = SOURCES[lang];
  if (!src) return null;
  const [aff, dic] = await Promise.all(src());
  return { aff: aff.default, dic: dic.default };
};
