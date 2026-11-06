import type { ImageAtom } from '../core/model';
import { orderedSel, findPara, sliceRuns } from '../core/tree';
import { mapRunsInSelection } from '../core/ops';
import type { EditorStore } from '../editor/store';

const ALLOWED = /^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/;
const MAX_BYTES = 64 * 1024 * 1024;

const imageSize = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
    img.onerror = () => reject(new Error('This image could not be read.'));
    img.src = url;
  });

export const insertImageFile = async (store: EditorStore, file: File): Promise<void> => {
  try {
    if (!ALLOWED.test(file.type)) throw new Error('Use a PNG, JPEG, GIF, WebP, BMP or SVG image.');
    if (file.size > MAX_BYTES) throw new Error('This image is larger than 64 MB.');
    const data = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(file);
    const { w, h } = await imageSize(url).finally(() => URL.revokeObjectURL(url));
    const key = `media/${crypto.randomUUID()}.${file.name.split('.').pop() ?? 'png'}`;
    const sec = store.doc.section;
    const maxW = sec.pageWidth - sec.marginLeft - sec.marginRight;
    const width = Math.min(w * 0.75, maxW);
    const atom: ImageAtom = { kind: 'image', media: key, width, height: (h / w) * width, wrap: 'inline', alt: '' };
    store.doc = { ...store.doc, media: { ...store.doc.media, [key]: { mime: file.type, data, name: file.name } } };
    store.insertAtom(atom, {});
  } catch (e) {
    store.notify(e instanceof Error ? e.message : 'The image could not be added.');
  }
};

export const selectedAtom = (store: EditorStore) => {
  const [a, b] = orderedSel(store.doc, store.sel);
  if (a.para !== b.para || b.offset - a.offset !== 1) return undefined;
  const p = findPara(store.doc, a);
  return p ? sliceRuns(p.runs, a.offset, b.offset)[0]?.atom : undefined;
};

export const updateSelectedAtom = (store: EditorStore, patch: Record<string, unknown>): void => {
  store.commit(mapRunsInSelection(store.doc, store.sel, (r) => (r.atom ? { ...r, atom: { ...r.atom, ...patch } as typeof r.atom } : r)));
};

export const resizeSelectedImage = (store: EditorStore, width: number, height: number): void => {
  store.commit(mapRunsInSelection(store.doc, store.sel, (r) => (r.atom ? { ...r, atom: { ...r.atom, width, height } as typeof r.atom } : r)), { group: true });
};

export const moveSelectedFloat = (store: EditorStore, x: number, y: number): void => {
  store.commit(mapRunsInSelection(store.doc, store.sel, (r) => {
    const a = r.atom;
    if (!a || (a.kind !== 'image' && a.kind !== 'shape' && a.kind !== 'chart') || a.wrap === 'inline') return r;
    return { ...r, atom: { ...a, float: { ...a.float, relH: 'page' as const, relV: 'page' as const, x, y, alignH: undefined, alignV: undefined } } };
  }), { group: true });
};
