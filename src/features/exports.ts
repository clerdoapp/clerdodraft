import { countWords, toHtml, toMarkdown, toText } from '../formats/plain';
import type { EditorStore } from '../editor/store';
import { download } from './files';

export const printDocument = (store: EditorStore): void => {
  const first = store.layout.pages[0];
  const style = document.createElement('style');
  style.textContent = first ? `@page{size:${first.width}pt ${first.height}pt;margin:0}` : '';
  document.head.append(style);
  store.setView({ printing: true });
  window.setTimeout(() => {
    window.print();
    store.setView({ printing: false });
    style.remove();
  }, 300);
};

export const exportHtml = (store: EditorStore): void => download(toHtml(store.doc, store.file.name), `${store.file.name}.html`, 'text/html');

export const exportMarkdown = (store: EditorStore): void => download(toMarkdown(store.doc), `${store.file.name}.md`, 'text/markdown');

export const exportText = (store: EditorStore): void => download(toText(store.doc), `${store.file.name}.txt`, 'text/plain');

export const stats = (store: EditorStore): { words: number; chars: number; charsNoSpaces: number; paras: number; lines: number; pages: number } => {
  const text = toText(store.doc);
  const words = countWords(text);
  const lines = store.layout.pages.reduce((n, p) => n + p.body.lines.length, 0);
  const paras = text.split('\n').filter((l) => l.trim()).length;
  return { words, chars: text.replace(/\n/g, '').length, charsNoSpaces: text.replace(/\s/g, '').length, paras, lines, pages: store.layout.pages.length };
};

export const exportOdt = async (store: EditorStore): Promise<void> => {
  const { writeOdt } = await import('../formats/odt');
  download(writeOdt(store.doc) as BlobPart, `${store.file.name}.odt`, 'application/vnd.oasis.opendocument.text');
};

export const exportRtf = async (store: EditorStore): Promise<void> => {
  const { writeRtf } = await import('../formats/rtf');
  download(writeRtf(store.doc), `${store.file.name}.rtf`, 'application/rtf');
};
