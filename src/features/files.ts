import { blankDoc } from '../core/defaults';
import type { EditorStore } from '../editor/store';
import type { Doc } from '../core/model';
import { readDocx, writeDocx } from '../docx';
import { isCompound, readCompound } from '../formats/cfb';
import { readHtml } from '../formats/html';
import { readMarkdown } from '../formats/markdown';
import { readOdt } from '../formats/odt';
import { readRtf } from '../formats/rtf';
import { decodeText, readText } from '../formats/text';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DB = 'clerdodraft';
const KEY = 'autosave';

interface Bridge {
  open(): Promise<{ path: string; name: string; data: Uint8Array } | null>;
  launchFile?(): Promise<{ path: string; name: string; data: Uint8Array } | null>;
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
const OPEN_EXT = ['.docx', '.docm', '.dotx', '.doc', '.odt', '.rtf', '.pdf', '.txt', '.md', '.markdown', '.html', '.htm'];
const openTypes = [{ description: 'Documents', accept: { [DOCX]: OPEN_EXT } }];

export const baseName = (name: string): string => name.replace(/\.docx$/i, '');

export const newDocument = (store: EditorStore): void => store.load(blankDoc());

class NeedsPassword extends Error {}

export const openProtected = async (store: EditorStore, bytes: Uint8Array, name: string, handle: unknown, password: string): Promise<void> => {
  try {
    const { decryptPackage } = await import('../formats/crypt');
    store.load(readDocx(await decryptPackage(bytes, password)), { name: baseName(name), handle, password });
  } catch (e) {
    store.notify(e instanceof Error ? e.message : "This file couldn't be opened.");
  }
};

export const setFilePassword = (store: EditorStore, password: string, again: string): void => {
  if (password !== again) { store.notify('The two passwords are different.'); return; }
  store.file = { ...store.file, password: password || undefined, dirty: true };
  store.emit();
  store.notify(password ? 'The password applies from your next save. It cannot be recovered if you forget it.' : 'The password will be removed at your next save.');
};

const fileBytes = async (store: EditorStore): Promise<Uint8Array> => {
  const data = writeDocx(store.doc);
  if (!store.file.password) return data;
  const { encryptPackage } = await import('../formats/crypt');
  return encryptPackage(data, store.file.password);
};

// Other formats open as a new document, so Save never writes over the original.
const importDoc = async (bytes: Uint8Array, name: string): Promise<Doc | null> => {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return (await import('../formats/pdf')).readPdf(bytes);
  if (isCompound(bytes)) {
    if (readCompound(bytes).has('EncryptedPackage')) throw new NeedsPassword();
    return (await import('../formats/doc')).readDoc(bytes);
  }
  if (zip && ext === 'odt') return readOdt(bytes);
  if (zip) return null;
  const text = decodeText(bytes);
  if (text.startsWith('{\\rtf')) return readRtf(text);
  if (ext === 'md' || ext === 'markdown') return readMarkdown(text);
  if (ext === 'html' || ext === 'htm' || /^\s*<(!doctype|html)/i.test(text)) return readHtml(text);
  return readText(text);
};

const hasSignatures = (bytes: Uint8Array): boolean => {
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
  return tail.includes('_xmlsignatures/');
};

export const readAny = async (bytes: Uint8Array, name: string): Promise<Doc> => (await importDoc(bytes, name)) ?? readDocx(bytes);

export const openBytes = async (store: EditorStore, bytes: Uint8Array, name: string, handle: unknown): Promise<void> => {
  try {
    const other = await importDoc(bytes, name);
    if (other) store.load(other, { name: name.replace(/\.[a-z0-9]+$/i, ''), handle: null });
    else {
      const signed = hasSignatures(bytes) ? (await import('../formats/sign')).verifyPackage(bytes) : undefined;
      store.load(readDocx(bytes), { name: baseName(name), handle, signatures: signed });
      if (signed?.length) store.setView({ pane: 'signatures' });
    }
  } catch (e) {
    if (e instanceof NeedsPassword) { store.openDialog('password', { bytes, name, handle }); return; }
    store.notify(e instanceof Error ? e.message : "This file couldn't be opened.");
  }
};

// A document the desktop app was asked to open, by double-clicking it or dropping it on the app icon.
export const openLaunchFile = async (store: EditorStore): Promise<boolean> => {
  try {
    const r = await desktop()?.launchFile?.();
    if (!r) return false;
    await openBytes(store, r.data, r.name, r.path);
    return true;
  } catch (e) {
    store.notify(e instanceof Error ? e.message : "This file couldn't be opened.");
    return false;
  }
};

export const openFile = async (store: EditorStore): Promise<void> => {
  const d = desktop();
  if (d) {
    const r = await d.open();
    if (r) await openBytes(store, r.data, r.name, r.path);
    return;
  }
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: openTypes });
      if (!h) return;
      const f = await h.getFile();
      await openBytes(store, new Uint8Array(await f.arrayBuffer()), f.name, h);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') store.notify("This file couldn't be opened.");
    }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = OPEN_EXT.join(',');
  input.onchange = async () => {
    const f = input.files?.[0];
    if (f) await openBytes(store, new Uint8Array(await f.arrayBuffer()), f.name, null);
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

const keepVersion = (store: EditorStore): void => { if (!store.file.password) void import('./versions').then((v) => v.saveVersion(store, 'Saved')).catch(() => undefined); };

export const saveFile = async (store: EditorStore, as = false): Promise<void> => {
  try {
    if (store.file.signatures?.length) { store.file = { ...store.file, signatures: undefined }; store.notify('Saving changes removes the signatures from this document.'); }
    const data = await fileBytes(store);
    const name = `${store.file.name}.docx`;
    const d = desktop();
    if (d) {
      const r = await d.save(as ? null : (store.file.handle as string | null), name, data);
      if (r) { store.file = { ...store.file, name: baseName(r.name), handle: r.path, dirty: false, lastSaved: Date.now() }; store.emit(); keepVersion(store); }
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
      store.file = { ...store.file, name: baseName(h.name), handle: h, dirty: false, lastSaved: Date.now() };
      store.emit();
      keepVersion(store);
      return;
    }
    download(data as BlobPart, name, DOCX);
    store.file = { ...store.file, dirty: false, lastSaved: Date.now() };
    store.emit();
    keepVersion(store);
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return;
    store.notify(e instanceof Error ? e.message : "This document couldn't be saved.");
  }
};

export const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('docs')) r.result.createObjectStore('docs');
      if (!r.result.objectStoreNames.contains('versions')) r.result.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const put = async (value: unknown): Promise<void> => {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction('docs', 'readwrite');
    t.objectStore('docs').put(value, KEY);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
};

const get = async (): Promise<{ data: Uint8Array; name: string; at: number } | undefined> => {
  const db = await openDb();
  return new Promise((res, rej) => {
    const r = db.transaction('docs').objectStore('docs').get(KEY);
    r.onsuccess = () => res(r.result as never);
    r.onerror = () => rej(r.error);
  });
};

// Recovery copy kept on this device only, separate from the user's own files.
export const startAutosave = (store: EditorStore): (() => void) => {
  const timer = window.setInterval(() => {
    if (!store.file.dirty || store.file.password) return;
    void put({ data: writeDocx(store.doc), name: store.file.name, at: Date.now() }).catch(() => undefined);
  }, 8000);
  const onLeave = (e: BeforeUnloadEvent) => { if (store.file.dirty) e.preventDefault(); };
  window.addEventListener('beforeunload', onLeave);
  return () => { window.clearInterval(timer); window.removeEventListener('beforeunload', onLeave); };
};

export const restoreDraft = async (store: EditorStore): Promise<void> => {
  if (new URLSearchParams(location.search).has('new')) return;
  try {
    const d = await get();
    if (d && !store.file.dirty) {
      store.load(readDocx(d.data), { name: d.name, dirty: true });
      store.notify('Recovered your last unsaved document.');
    }
  } catch { /* no recovery copy */ }
};
