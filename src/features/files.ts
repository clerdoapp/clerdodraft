import { blankDoc } from '../core/defaults';
import type { EditorStore } from '../editor/store';
import { readDocx, writeDocx } from '../docx';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DB = 'clerdodraft';
const KEY = 'autosave';

interface Bridge {
  open(): Promise<{ path: string; name: string; data: Uint8Array } | null>;
  save(path: string | null, name: string, data: Uint8Array): Promise<{ path: string; name: string } | null>;
}

const desktop = (): Bridge | undefined => (window as unknown as { clerdo?: Bridge }).clerdo;

type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<{ getFile(): Promise<File> }[]>;
  showSaveFilePicker?: (o: unknown) => Promise<SaveHandle>;
};
interface SaveHandle {
  name: string;
  createWritable(): Promise<{ write(d: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

const types = [{ description: 'Documents', accept: { [DOCX]: ['.docx'] } }];

export const baseName = (name: string): string => name.replace(/\.docx$/i, '');

export const newDocument = (store: EditorStore): void => store.load(blankDoc());

export const openBytes = (store: EditorStore, bytes: Uint8Array, name: string, handle: unknown): void => {
  try {
    store.load(readDocx(bytes), { name: baseName(name), handle });
  } catch (e) {
    store.notify(e instanceof Error ? e.message : "This file couldn't be opened.");
  }
};

export const openFile = async (store: EditorStore): Promise<void> => {
  const d = desktop();
  if (d) {
    const r = await d.open();
    if (r) openBytes(store, r.data, r.name, r.path);
    return;
  }
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types });
      if (!h) return;
      const f = await h.getFile();
      openBytes(store, new Uint8Array(await f.arrayBuffer()), f.name, h);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') store.notify("This file couldn't be opened.");
    }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `.docx,${DOCX}`;
  input.onchange = async () => {
    const f = input.files?.[0];
    if (f) openBytes(store, new Uint8Array(await f.arrayBuffer()), f.name, null);
  };
  input.click();
};

const touchDevice = (): boolean => matchMedia('(pointer: coarse)').matches;

// On iPad the share sheet is the dependable way to reach Save to Files.
const shareFile = async (data: BlobPart, name: string, mime: string): Promise<boolean> => {
  if (!touchDevice() || !navigator.canShare) return false;
  const file = new File([data], name, { type: mime });
  if (!navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] });
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') return false;
  }
  return true;
};

export const download = (data: BlobPart, name: string, mime: string): void => {
  void shareFile(data, name, mime).then((done) => { if (!done) plainDownload(data, name, mime); });
};

const plainDownload = (data: BlobPart, name: string, mime: string): void => {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const saveFile = async (store: EditorStore, as = false): Promise<void> => {
  try {
    const data = writeDocx(store.doc);
    const name = `${store.file.name}.docx`;
    const d = desktop();
    if (d) {
      const r = await d.save(as ? null : (store.file.handle as string | null), name, data);
      if (r) { store.file = { name: baseName(r.name), handle: r.path, dirty: false, lastSaved: Date.now() }; store.emit(); }
      return;
    }
    const w = window as PickerWindow;
    let h = (as ? null : store.file.handle) as SaveHandle | null;
    if (h && !('createWritable' in h)) h = null;
    if (!h && w.showSaveFilePicker) h = await w.showSaveFilePicker({ suggestedName: name, types });
    if (h) {
      const out = await h.createWritable();
      await out.write(data);
      await out.close();
      store.file = { name: baseName(h.name), handle: h, dirty: false, lastSaved: Date.now() };
      store.emit();
      return;
    }
    download(data as BlobPart, name, DOCX);
    store.file = { ...store.file, dirty: false, lastSaved: Date.now() };
    store.emit();
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return;
    store.notify(e instanceof Error ? e.message : "This document couldn't be saved.");
  }
};

const idb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const put = async (value: unknown): Promise<void> => {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction('docs', 'readwrite');
    t.objectStore('docs').put(value, KEY);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
};

const get = async (): Promise<{ data: Uint8Array; name: string; at: number } | undefined> => {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction('docs').objectStore('docs').get(KEY);
    r.onsuccess = () => res(r.result as never);
    r.onerror = () => rej(r.error);
  });
};

// Recovery copy kept on this device only, separate from the user's own files.
export const startAutosave = (store: EditorStore): (() => void) => {
  const timer = window.setInterval(() => {
    if (!store.file.dirty) return;
    void put({ data: writeDocx(store.doc), name: store.file.name, at: Date.now() }).catch(() => undefined);
  }, 8000);
  const onLeave = (e: BeforeUnloadEvent) => { if (store.file.dirty) e.preventDefault(); };
  window.addEventListener('beforeunload', onLeave);
  return () => { window.clearInterval(timer); window.removeEventListener('beforeunload', onLeave); };
};

export const restoreDraft = async (store: EditorStore): Promise<void> => {
  try {
    const d = await get();
    if (d && !store.file.dirty) {
      store.load(readDocx(d.data), { name: d.name, dirty: true });
      store.notify('Recovered your last unsaved document.');
    }
  } catch { /* no recovery copy */ }
};
