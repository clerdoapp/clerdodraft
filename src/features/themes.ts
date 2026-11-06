import type { Doc, Style } from '../core/model';
import type { EditorStore } from '../editor/store';

export interface DocTheme { id: string; name: string; heading: string; body: string; color: string }

export const THEMES: DocTheme[] = [
  { id: 'plain', name: 'Plain', heading: 'Calibri', body: 'Calibri', color: '#000000' },
  { id: 'cobalt', name: 'Cobalt', heading: 'Calibri', body: 'Calibri', color: '#2347ff' },
  { id: 'ink', name: 'Ink', heading: 'Cambria', body: 'Calibri', color: '#1f2a44' },
  { id: 'paper', name: 'Paper', heading: 'Cambria', body: 'Cambria', color: '#5a3e1b' },
  { id: 'forest', name: 'Forest', heading: 'Arial', body: 'Calibri', color: '#1b5e3b' },
  { id: 'plum', name: 'Plum', heading: 'Arial', body: 'Cambria', color: '#6a1b6a' },
  { id: 'report', name: 'Report', heading: 'Times New Roman', body: 'Times New Roman', color: '#7a1f1f' },
  { id: 'type', name: 'Typewriter', heading: 'Courier New', body: 'Courier New', color: '#333333' },
];

export const SPACINGS: { id: string; name: string; after: number; line: number }[] = [
  { id: 'tight', name: 'Tight', after: 4, line: 1 },
  { id: 'normal', name: 'Normal', after: 8, line: 1.08 },
  { id: 'open', name: 'Open', after: 12, line: 1.3 },
];

const HEADINGS = /^(Title|Subtitle|Heading[1-9])$/;

export const applyThemeToDoc = (doc: Doc, t: DocTheme): Doc => {
  const styles: Record<string, Style> = {};
  for (const [id, s] of Object.entries(doc.styles.styles)) {
    if (HEADINGS.test(id)) styles[id] = { ...s, run: { ...s.run, font: t.heading, fontCs: t.heading, color: t.color === '#000000' ? undefined : t.color } };
    else if (s.kind === 'paragraph' && s.run?.font) styles[id] = { ...s, run: { ...s.run, font: t.body, fontCs: t.body } };
    else styles[id] = s;
  }
  return {
    ...doc,
    theme: { ...doc.theme, majorFont: t.heading, minorFont: t.body },
    styles: { ...doc.styles, styles, docDefaults: { ...doc.styles.docDefaults, run: { ...doc.styles.docDefaults.run, font: t.body, fontCs: t.body } } },
  };
};

export const applyTheme = (s: EditorStore, t: DocTheme): void => s.commit(applyThemeToDoc(s.doc, t));

export const applySpacing = (s: EditorStore, id: string): void => {
  const p = SPACINGS.find((x) => x.id === id);
  if (!p) return;
  const d = s.doc;
  s.commit({ ...d, styles: { ...d.styles, docDefaults: { ...d.styles.docDefaults, para: { ...d.styles.docDefaults.para, spaceAfter: p.after, lineSpacing: { rule: 'auto', value: p.line } } } } });
};
