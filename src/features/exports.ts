import type { Block, Paragraph } from '../core/model';
import { headingLevel } from '../core/styles';
import { paraText } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { download } from './files';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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

const runHtml = (p: Paragraph): string =>
  p.runs.filter((r) => !r.del).map((r) => {
    let h = esc(r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text).replaceAll('\n', '<br>').replaceAll('\t', '&emsp;');
    const q = r.props;
    if (q.bold) h = `<strong>${h}</strong>`;
    if (q.italic) h = `<em>${h}</em>`;
    if (q.underline && q.underline !== 'none') h = `<u>${h}</u>`;
    if (q.strike) h = `<s>${h}</s>`;
    if (r.link?.href && /^(https?:|mailto:)/i.test(r.link.href)) h = `<a href="${esc(r.link.href)}">${h}</a>`;
    return h;
  }).join('');

const blocksHtml = (store: EditorStore, blocks: Block[]): string =>
  blocks.map((b) => {
    if (b.type === 'p') {
      const h = headingLevel(store.doc, b);
      return h ? `<h${h}>${runHtml(b)}</h${h}>` : `<p dir="${b.props.bidi ? 'rtl' : 'auto'}">${runHtml(b)}</p>`;
    }
    if (b.type === 'tbl') return `<table>${b.rows.map((r) => `<tr>${r.cells.map((c) => (c.props.vMerge === 'continue' ? '' : `<td colspan="${c.props.gridSpan ?? 1}">${blocksHtml(store, c.blocks)}</td>`)).join('')}</tr>`).join('')}</table>`;
    return '';
  }).join('\n');

export const exportHtml = (store: EditorStore): void => {
  const title = esc(store.file.name);
  download(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1rem;font:16px/1.5 system-ui,sans-serif}table{border-collapse:collapse}td{border:1px solid #999;padding:.3rem .5rem}</style></head><body>${blocksHtml(store, store.doc.blocks)}</body></html>`, `${store.file.name}.html`, 'text/html');
};

const mdBlocks = (store: EditorStore, blocks: Block[]): string =>
  blocks.map((b) => {
    if (b.type === 'p') {
      const h = headingLevel(store.doc, b);
      const t = b.runs.filter((r) => !r.del).map((r) => {
        let s = r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text;
        if (r.props.bold) s = `**${s}**`;
        if (r.props.italic) s = `*${s}*`;
        if (r.link?.href) s = `[${s}](${r.link.href})`;
        return s;
      }).join('');
      return h ? `${'#'.repeat(h)} ${t}` : t;
    }
    if (b.type === 'tbl') {
      const rows = b.rows.map((r) => `| ${r.cells.map((c) => c.blocks.map((x) => (x.type === 'p' ? paraText(x) : '')).join(' ')).join(' | ')} |`);
      if (rows.length) rows.splice(1, 0, `|${b.rows[0]!.cells.map(() => ' --- ').join('|')}|`);
      return rows.join('\n');
    }
    return '';
  }).join('\n\n');

export const exportMarkdown = (store: EditorStore): void => download(mdBlocks(store, store.doc.blocks), `${store.file.name}.md`, 'text/markdown');

const textBlocks = (blocks: Block[]): string =>
  blocks.map((b) => (b.type === 'p' ? b.runs.filter((r) => !r.del).map((r) => (r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text)).join('') : b.type === 'tbl' ? b.rows.map((r) => r.cells.map((c) => textBlocks(c.blocks)).join('\t')).join('\n') : '')).join('\n');

export const exportText = (store: EditorStore): void => download(textBlocks(store.doc.blocks), `${store.file.name}.txt`, 'text/plain');

export const stats = (store: EditorStore): { words: number; chars: number; charsNoSpaces: number; paras: number; lines: number; pages: number } => {
  const text = textBlocks(store.doc.blocks);
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
  let words = 0;
  for (const s of seg.segment(text)) if (s.isWordLike) words++;
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
