import type { Block, Doc, Paragraph } from '../core/model';
import { effectivePara, headingLevel } from '../core/styles';
import { paraText } from '../core/tree';

// Plain exports shared by the app and the command-line tool.
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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

// Whether a paragraph is a list item, at which level, and whether its list is numbered.
const listOf = (doc: Doc, p: Paragraph): { level: number; ordered: boolean; numId: string } | null => {
  const n = effectivePara(doc, p.props).numbering;
  if (!n || n.numId === '0') return null;
  const inst = doc.numbering.instances[n.numId];
  const lvl = inst ? doc.numbering.abstracts[inst.abstractId]?.levels[n.level ?? 0] : undefined;
  if (lvl?.format === 'none') return null;
  return { level: n.level ?? 0, ordered: !!lvl && lvl.format !== 'bullet', numId: n.numId };
};

const blocksHtml = (doc: Doc, blocks: Block[]): string => {
  const out: string[] = [];
  const open: ('ul' | 'ol')[] = [];
  const close = (to: number) => { while (open.length > to) out.push(`</li></${open.pop()}>`); };
  for (const b of blocks) {
    const li = b.type === 'p' && !headingLevel(doc, b) ? listOf(doc, b) : null;
    if (b.type === 'p' && li) {
      const tag = li.ordered ? 'ol' : 'ul';
      if (open.length > li.level + 1) close(li.level + 1);
      if (open.length === li.level + 1 && open[li.level] !== tag) close(li.level);
      if (open.length === li.level + 1) out.push('</li><li>');
      while (open.length < li.level + 1) { out.push(`<${tag}><li>`); open.push(tag); }
      out.push(runHtml(b));
      continue;
    }
    close(0);
    if (b.type === 'p') {
      const h = headingLevel(doc, b);
      out.push(h ? `<h${h}>${runHtml(b)}</h${h}>` : `<p dir="${b.props.bidi ? 'rtl' : 'auto'}">${runHtml(b)}</p>`);
    } else if (b.type === 'tbl') out.push(`<table>${b.rows.map((r) => `<tr>${r.cells.map((c) => (c.props.vMerge === 'continue' ? '' : `<td colspan="${c.props.gridSpan ?? 1}">${blocksHtml(doc, c.blocks)}</td>`)).join('')}</tr>`).join('')}</table>`);
  }
  close(0);
  return out.join('\n');
};


const mdBlocks = (doc: Doc, blocks: Block[]): string => {
  const counters: number[] = [];
  const lists: string[] = [];
  return blocks.map((b, i) => {
    const prev = blocks[i - 1];
    if (b.type === 'p') {
      const h = headingLevel(doc, b);
      const t = b.runs.filter((r) => !r.del).map((r) => {
        let s = r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text;
        if (r.props.bold) s = `**${s}**`;
        if (r.props.italic) s = `*${s}*`;
        if (r.link?.href) s = `[${s}](${r.link.href})`;
        return s;
      }).join('');
      if (h) return `${'#'.repeat(h)} ${t}`;
      const li = listOf(doc, b);
      if (li) {
        counters.length = li.level + 1;
        if (lists[li.level] !== li.numId) { counters[li.level] = 0; lists[li.level] = li.numId; }
        counters[li.level] = (counters[li.level] ?? 0) + 1;
        const mark = li.ordered ? `${counters[li.level]}.` : '-';
        // List items sit on consecutive lines so they form one list.
        const join = prev?.type === 'p' && listOf(doc, prev) ? '\u0000' : '';
        return `${join}${'  '.repeat(li.level)}${mark} ${t}`;
      }
      counters.length = 0; lists.length = 0;
      return t;
    }
    counters.length = 0; lists.length = 0;
    if (b.type === 'tbl') {
      const rows = b.rows.map((r) => `| ${r.cells.map((c) => c.blocks.map((x) => (x.type === 'p' ? paraText(x) : '')).join(' ')).join(' | ')} |`);
      if (rows.length) rows.splice(1, 0, `|${b.rows[0]!.cells.map(() => ' --- ').join('|')}|`);
      return rows.join('\n');
    }
    return '';
  }).join('\n\n').replace(/\n\n\u0000/g, '\n');
};


export const textBlocks = (blocks: Block[]): string =>
  blocks.map((b) => (b.type === 'p' ? b.runs.filter((r) => !r.del).map((r) => (r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text)).join('') : b.type === 'tbl' ? b.rows.map((r) => r.cells.map((c) => textBlocks(c.blocks)).join('\t')).join('\n') : '')).join('\n');

export const toHtml = (doc: Doc, title: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1rem;font:16px/1.5 system-ui,sans-serif}table{border-collapse:collapse}td{border:1px solid #999;padding:.3rem .5rem}</style></head><body>${blocksHtml(doc, doc.blocks)}</body></html>`;

export const toMarkdown = (doc: Doc): string => mdBlocks(doc, doc.blocks);

export const toText = (doc: Doc): string => textBlocks(doc.blocks);

export const countWords = (text: string): number => {
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
  let words = 0;
  for (const s of seg.segment(text)) if (s.isWordLike) words++;
  return words;
};
