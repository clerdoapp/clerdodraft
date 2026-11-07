// Reading text aloud with the system's voices.
// Browsers drop long utterances, forget ones nothing refers to, and still report the end of one that was
// stopped, so text is spoken in short pieces, each kept alive here, and every run has its own token.

let token = 0;
const alive = new Set<SpeechSynthesisUtterance>();

export const canSpeak = (): boolean => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

const SCRIPTS: [RegExp, string][] = [
  [/[؀-ۿ]/, 'ar'], [/[֐-׿]/, 'he'], [/[Ѐ-ӿ]/, 'ru'], [/[぀-ヿ]/, 'ja'],
  [/[가-힯]/, 'ko'], [/[一-鿿]/, 'zh'], [/[ऀ-ॿ]/, 'hi'], [/[฀-๿]/, 'th'],
];

// The language to read in: the text's own script first, then the document language, then the system.
export const speechLang = (text: string, fallback?: string): string => SCRIPTS.find(([re]) => re.test(text))?.[1] ?? fallback ?? navigator.language;

const voiceFor = (lang: string): SpeechSynthesisVoice | undefined => {
  const all = speechSynthesis.getVoices();
  const base = lang.toLowerCase().split('-')[0]!;
  return all.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? all.find((v) => v.lang.toLowerCase().startsWith(base)) ?? undefined;
};

// Sentences, joined back into pieces short enough that no browser cuts them off.
export const speechPieces = (text: string, max = 180): string[] => {
  const out: string[] = [];
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?؟。！？]+[.!?؟。！？]*\s*/g) ?? [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (s.length > max) {
      for (const w of s.split(/(?<=[,،;:])\s+|\s+/)) {
        if ((cur + ' ' + w).length > max && cur) { out.push(cur.trim()); cur = ''; }
        cur += (cur ? ' ' : '') + w;
      }
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

export const stopSpeaking = (): void => {
  token++;
  alive.clear();
  if (canSpeak()) speechSynthesis.cancel();
};

export const isSpeaking = (): boolean => canSpeak() && (speechSynthesis.speaking || speechSynthesis.pending);

/**
 * Speaks blocks of text one after another. onBlock reports which block is being read; onDone runs when
 * everything was read or reading failed, but not after stopSpeaking.
 */
export const speakBlocks = (blocks: string[], opts: { lang?: string; from?: number; onBlock?: (i: number) => void; onDone?: (ok: boolean) => void } = {}): void => {
  if (!canSpeak()) { opts.onDone?.(false); return; }
  stopSpeaking();
  const mine = token;
  // Some browsers ignore a new utterance queued in the same moment as a cancel.
  window.setTimeout(() => {
    if (mine !== token) return;
    if (speechSynthesis.paused) speechSynthesis.resume();
    const play = (b: number, piece: number): void => {
      if (mine !== token) return;
      const text = blocks[b];
      if (text === undefined) { opts.onDone?.(true); return; }
      const pieces = speechPieces(text);
      if (!pieces.length) { play(b + 1, 0); return; }
      if (piece === 0) opts.onBlock?.(b);
      const u = new SpeechSynthesisUtterance(pieces[piece]!);
      u.lang = speechLang(pieces[piece]!, opts.lang);
      const v = voiceFor(u.lang);
      if (v) u.voice = v;
      alive.add(u);
      const next = () => { alive.delete(u); if (mine !== token) return; if (piece + 1 < pieces.length) play(b, piece + 1); else play(b + 1, 0); };
      u.onend = next;
      u.onerror = (e) => {
        alive.delete(u);
        if (mine !== token || e.error === 'interrupted' || e.error === 'canceled') return;
        // A piece the voice can't read is skipped instead of ending the whole reading.
        if (e.error === 'language-unavailable' || e.error === 'voice-unavailable' || e.error === 'text-too-long') { next(); return; }
        token++;
        opts.onDone?.(false);
      };
      speechSynthesis.speak(u);
    };
    play(opts.from ?? 0, 0);
  }, 60);
};

// Voices load after the page; asking early makes them ready by the time someone presses Read aloud.
if (canSpeak()) { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices()); }
