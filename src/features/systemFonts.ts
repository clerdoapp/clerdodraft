import { setInstalledFonts } from '../core/fonts';
import type { EditorStore } from '../editor/store';

type LocalFont = { family: string };
const bridge = (): { fonts?: () => Promise<string[]> } | undefined => (window as unknown as { clerdo?: { fonts?: () => Promise<string[]> } }).clerdo;

export const canAskForFonts = (): boolean => !bridge()?.fonts && 'queryLocalFonts' in window;

let list: string[] = [];
export const computerFonts = (): string[] => list;

const use = (store: EditorStore, names: string[]): void => {
  list = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  setInstalledFonts(list);
  store.remeasure();
};

// The desktop app reads the font folders itself; a browser asks the person first.
export const loadComputerFonts = async (store: EditorStore, ask = false): Promise<void> => {
  try {
    const b = bridge();
    if (b?.fonts) { use(store, await b.fonts()); return; }
    if (!ask || !('queryLocalFonts' in window)) return;
    const fonts = await (window as unknown as { queryLocalFonts: () => Promise<LocalFont[]> }).queryLocalFonts();
    use(store, fonts.map((f) => f.family));
  } catch {
    if (ask) store.notify('Fonts on this computer could not be listed.');
  }
};
