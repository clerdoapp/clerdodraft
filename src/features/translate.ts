interface OnDeviceTranslator {
  translate(text: string): Promise<string>;
  destroy?(): void;
}
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<OnDeviceTranslator>;
}

const api = (): TranslatorApi | undefined => (globalThis as unknown as { Translator?: TranslatorApi }).Translator;

export const LANGUAGES: [string, string][] = [['ar', 'Arabic'], ['en', 'English'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['tr', 'Turkish'], ['ru', 'Russian'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['hi', 'Hindi']];

export const canTranslate = (): boolean => !!api();

// Runs on this device through the system's language models; nothing leaves it.
export const translate = async (text: string, sourceLanguage: string, targetLanguage: string): Promise<string> => {
  const t = api();
  if (!t) throw new Error('Translation is not available on this device.');
  const state = await t.availability({ sourceLanguage, targetLanguage });
  if (state === 'unavailable') throw new Error('This language pair is not available on this device.');
  const worker = await t.create({ sourceLanguage, targetLanguage });
  try {
    const out: string[] = [];
    for (const part of text.split('\n')) out.push(part.trim() ? await worker.translate(part) : '');
    return out.join('\n');
  } finally {
    worker.destroy?.();
  }
};
