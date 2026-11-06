import type { Doc, ParaProps } from '../core/model';
import { DocBuilder } from './build';

interface Pic { y: number; w: number; h: number; png: Uint8Array }
type Raw = { width: number; height: number; data?: Uint8ClampedArray | Uint8Array; kind?: number; bitmap?: ImageBitmap };

const toPng = async (img: Raw): Promise<Uint8Array | null> => {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if (!g || !img.width || !img.height) return null;
  if (img.bitmap) g.drawImage(img.bitmap, 0, 0);
  else if (img.data) {
    const out = g.createImageData(img.width, img.height);
    const px = img.width * img.height;
    if (img.data.length === px * 4) out.data.set(img.data);
    else if (img.data.length === px * 3) for (let i = 0; i < px; i++) { out.data[i * 4] = img.data[i * 3]!; out.data[i * 4 + 1] = img.data[i * 3 + 1]!; out.data[i * 4 + 2] = img.data[i * 3 + 2]!; out.data[i * 4 + 3] = 255; }
    else if (img.data.length === px) for (let i = 0; i < px; i++) { out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = img.data[i]!; out.data[i * 4 + 3] = 255; }
    else return null;
    g.putImageData(out, 0, 0);
  } else return null;
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};

const mul = (a: number[], b: number[]): number[] => [a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!, a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!, a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!];

// Pictures are found by following the page's drawing steps, so each lands near its place in the text.
const pagePictures = async (page: { getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>; objs: { get(id: string, cb: (v: unknown) => void): void } }, OPS: Record<string, number>): Promise<Pic[]> => {
  const list = await page.getOperatorList();
  const out: Pic[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  for (let i = 0; i < list.fnArray.length && out.length < 60; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] ?? [];
    if (fn === OPS['save']) stack.push(ctm);
    else if (fn === OPS['restore']) ctm = stack.pop() ?? ctm;
    else if (fn === OPS['transform']) ctm = mul(ctm, args as number[]);
    else if (fn === OPS['paintImageXObject'] || fn === OPS['paintInlineImageXObject']) {
      const w = Math.hypot(ctm[0]!, ctm[1]!); const h = Math.hypot(ctm[2]!, ctm[3]!);
      if (w < 24 || h < 24) continue;
      const img = fn === OPS['paintInlineImageXObject'] ? (args[0] as Raw) : await new Promise<Raw | null>((resolve) => { try { page.objs.get(String(args[0]), (v) => resolve(v as Raw)); } catch { resolve(null); } window.setTimeout(() => resolve(null), 3000); });
      if (!img) continue;
      const png = await toPng(img).catch(() => null);
      if (png) out.push({ y: ctm[5]! + h, w, h, png });
    }
  }
  return out;
};

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
    const picsByPage: Pic[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      if (n === 1) {
        const v = page.getViewport({ scale: 1 });
        b.doc = { ...b.doc, section: { ...b.doc.section, pageWidth: v.width, pageHeight: v.height } };
      }
      const pics = typeof document !== 'undefined' ? await pagePictures(page as never, pdfjs.OPS as unknown as Record<string, number>).catch(() => []) : [];
      picsByPage.push(pics);
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
      const pics = [...(picsByPage[pageIndex] ?? [])].sort((a, b) => b.y - a.y);
      const placePics = (above: number) => {
        while (pics.length && pics[0]!.y >= above) {
          const pic = pics.shift()!;
          flush();
          b.add([b.image({ mime: 'image/png', data: pic.png, width: pic.w, height: pic.h })]);
        }
      };
      lines.forEach((l, i) => {
        placePics(l.y + l.h);
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
      placePics(-Infinity);
    });
  } finally {
    await task.destroy();
  }
  return b.finish();
};
