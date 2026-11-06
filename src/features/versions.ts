import { readDocx, writeDocx } from '../docx';
import type { EditorStore } from '../editor/store';
import { openDb } from './files';

export interface Version { id: number; doc: string; label: string; at: number; size: number }
interface Stored extends Version { data: Uint8Array }

const KEEP = 40;

const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction('versions', mode).objectStore('versions'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
};

export const listVersions = async (doc: string): Promise<Version[]> => {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<Stored[]>);
  return all.filter((v) => v.doc === doc).sort((a, b) => b.at - a.at).map(({ data: _d, ...v }) => v);
};

export const saveVersion = async (store: EditorStore, label: string): Promise<void> => {
  const data = writeDocx(store.doc);
  await tx('readwrite', (s) => s.add({ doc: store.file.name, label, at: Date.now(), size: data.length, data }));
  const old = (await listVersions(store.file.name)).slice(KEEP);
  await Promise.all(old.map((v) => tx('readwrite', (s) => s.delete(v.id))));
};

export const restoreVersion = async (store: EditorStore, id: number): Promise<void> => {
  const v = await tx('readonly', (s) => s.get(id) as IDBRequest<Stored | undefined>);
  if (!v) throw new Error('This version is no longer on this device.');
  await saveVersion(store, 'Before restoring');
  store.load(readDocx(v.data), { name: store.file.name, handle: store.file.handle, dirty: true });
};

export const deleteVersion = (id: number): Promise<unknown> => tx('readwrite', (s) => s.delete(id));
