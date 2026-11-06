import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { readDocx, writeDocx } from '../docx';
import type { EditorStore } from '../editor/store';

const MAX_LINK = 1_500_000;

const toB64 = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const webAppUrl = (): string => {
  if (/^https?:/.test(location.protocol)) return `${location.origin}${location.pathname}`;
  const repo = import.meta.env.VITE_RELEASE_REPO ?? 'clerdoapp/clerdodraft';
  const [owner, name] = repo.split('/');
  return `https://${owner}.github.io/${name}/`;
};

// The whole document travels inside the link itself, so nothing is stored anywhere else.
export const makeShareLink = (store: EditorStore): string | null => {
  const data = writeDocx(store.doc);
  const name = toB64(strToU8(store.file.name));
  const link = `${webAppUrl()}#doc=${toB64(data)}&name=${name}`;
  return link.length > MAX_LINK ? null : link;
};

export const shareLink = async (store: EditorStore): Promise<void> => {
  const link = makeShareLink(store);
  if (!link) { store.notify('This document is too large for a link. Send the file instead.'); return; }
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: store.file.name, url: link });
    else { await navigator.clipboard.writeText(link); store.notify('Link copied. Anyone with it can open a copy of this document.'); }
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') store.notify("The link couldn't be copied here.");
  }
};

export const openSharedLink = (store: EditorStore): boolean => {
  const m = /[#&]doc=([A-Za-z0-9_-]+)(?:&name=([A-Za-z0-9_-]+))?/.exec(location.hash);
  if (!m) return false;
  try {
    const doc = readDocx(fromB64(m[1]!));
    store.load(doc, { name: m[2] ? strFromU8(fromB64(m[2])) : 'Shared document', dirty: true });
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch {
    store.notify("This link's document couldn't be opened.");
    return false;
  }
};

export const pack = (o: unknown): string => toB64(zlibSync(strToU8(JSON.stringify(o)), { level: 9 }));
export const unpack = <T>(s: string): T => JSON.parse(strFromU8(unzlibSync(fromB64(s.trim())))) as T;
