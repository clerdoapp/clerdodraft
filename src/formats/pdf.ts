import type { Doc, ParaProps } from '../core/model';
import { DocBuilder } from './build';

interface Item { str: string; x: number; y: number; w: number; h: number; rtl: boolean }
interface Line { text: string; x: number; y: number; h: number; right: number; rtl: boolean }

const toLines = (items: Item[]): Line[] => {
  const rows: Item[][] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0]!.y - it.y) < Math.max(2, it.h * 0.4)) last.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    const rtl = row.filter((r) => r.rtl).length > row.length / 2;
    const sorted = [...row].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    let text = '';
    let edge: number | null = null;
    for (const it of sorted) {
      const gap = edge === null ? 0 : rtl ? edge - (it.x + it.w) : it.x - edge;
      if (edge !== null && gap > it.h * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str;
      edge = rtl ? it.x : it.x + it.w;
    }
    const h = Math.max(...row.map((r) => r.h));
    return { text: text.trim(), x: Math.min(...row.map((r) => r.x)), right: Math.max(...row.map((r) => r.x + r.w)), y: row[0]!.y, h, rtl };
  }).filter((l) => l.text);
};

// Rebuilds paragraphs from positioned text. Pictures and exact layout stay in the original.
export const readPdf = async (bytes: Uint8Array): Promise<Doc> => {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.min.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  const b = new DocBuilder();
  try {
    const sizes = new Map<number, number>();
    const pages: Line[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      if (n === 1) {
        const v = page.getViewport({ scale: 1 });
        b.doc = { ...b.doc, section: { ...b.doc.section, pageWidth: v.width, pageHeight: v.height } };
      }
      const tc = await page.getTextContent();
      const items: Item[] = [];
      for (const it of tc.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width, h: it.height || Math.abs(it.transform[3] as number), rtl: it.dir === 'rtl' });
      }
      const lines = toLines(items);
      pages.push(lines);
      for (const l of lines) { const k = Math.round(l.h); sizes.set(k, (sizes.get(k) ?? 0) + l.text.length); }
      page.cleanup();
    }
    const body = [...sizes.entries()].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? 11;
    pages.forEach((lines, pageIndex) => {
      let text = '';
      let props: ParaProps = pageIndex ? { pageBreakBefore: true } : {};
      const flush = () => {
        if (text) b.add([{ text, props: {} }], props);
        text = '';
        props = {};
      };
      lines.forEach((l, i) => {
        const prev = lines[i - 1];
        const gap = prev ? prev.y - l.y : 0;
        const big = Math.round(l.h) > body * 1.2;
        const sizeChanged = prev && Math.abs(prev.h - l.h) > 1;
        if (prev && (gap > l.h * 1.7 || sizeChanged || big)) flush();
        if (!text) {
          if (big) props = { ...props, style: l.h > body * 1.6 ? 'Heading1' : 'Heading2' };
          if (l.rtl) props = { ...props, bidi: true };
        }
        text = text ? `${text.endsWith('-') ? text.slice(0, -1) : `${text} `}${l.text}` : l.text;
      });
      flush();
    });
  } finally {
    await task.destroy();
  }
  return b.finish();
};
