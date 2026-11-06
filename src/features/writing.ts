import { isCollapsed, selectedText } from '../core/tree';
import { register } from '../editor/commands';
import { wordAt } from '../editor/interaction';
import type { EditorStore } from '../editor/store';
import { exportOdt, exportRtf } from './exports';

export const wordHere = (s: EditorStore): { text: string; from: number; to: number } | null => {
  if (!isCollapsed(s.sel)) {
    const text = selectedText(s.doc, s.sel).trim();
    return text && !/\s/.test(text) ? { text, from: s.sel.anchor.offset, to: s.sel.focus.offset } : null;
  }
  const pos = s.sel.focus;
  const [from, to] = wordAt(s.doc, pos);
  const text = selectedText(s.doc, { anchor: { ...pos, offset: from }, focus: { ...pos, offset: to } }).trim();
  return text ? { text, from, to } : null;
};

export const replaceWordHere = (s: EditorStore, text: string): void => {
  const w = wordHere(s);
  if (!w) return;
  if (isCollapsed(s.sel)) {
    const pos = s.sel.focus;
    s.setSel({ anchor: { ...pos, offset: w.from }, focus: { ...pos, offset: w.to } });
  }
  s.typeText(text);
};

export const registerWriting = (): void => {
  register(
    { id: 'rev.thesaurus', label: 'Word book', group: 'Review', keys: 'shift+f7', run: (s) => s.togglePane('words'), active: (s) => s.view.pane === 'words' },
    { id: 'rev.translate', label: 'Translate', group: 'Review', run: (s) => s.togglePane('translate'), active: (s) => s.view.pane === 'translate' },
    { id: 'page.hyphen', label: 'Automatic hyphens', group: 'Page', run: (s) => s.commit({ ...s.doc, settings: { ...s.doc.settings, autoHyphenation: !s.doc.settings.autoHyphenation || undefined } }), active: (s) => !!s.doc.settings.autoHyphenation },
    { id: 'ins.softHyphen', label: 'Optional hyphen', group: 'Insert', keys: 'mod+-', run: (s) => s.typeText('­') },
    { id: 'file.odt', label: 'Open document (.odt)', group: 'File', run: (s) => void exportOdt(s) },
    { id: 'file.rtf', label: 'Rich text (.rtf)', group: 'File', run: (s) => void exportRtf(s) },
    { id: 'file.protect', label: 'Protect with a password', group: 'File', run: (s) => s.openDialog('protect'), active: (s) => !!s.file.password },
    { id: 'ins.emoji', label: 'Emoji', group: 'Insert', run: (s) => s.openDialog('emoji') },
    { id: 'view.reader', label: 'Focus reader', group: 'View', run: (s) => s.setView({ reader: !s.view.reader }), active: (s) => !!s.view.reader },
  );
};
