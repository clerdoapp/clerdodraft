import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Doc } from '../core/model';
import { readDocx, writeDocx } from '../docx';
import { isCompound, readCompound } from '../formats/cfb';
import { readMarkdown } from '../formats/markdown';
import { toHtml, toMarkdown, toText } from '../formats/plain';
import { decodeText, readText } from '../formats/text';

// Reading and writing documents on disk, by file content first and extension second.

export const FORMATS = ['docx', 'odt', 'rtf', 'html', 'md', 'txt'] as const;
export type Format = (typeof FORMATS)[number];

export class FileError extends Error {}

const ensureDom = async (): Promise<void> => {
  if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== 'undefined') return;
  const { DOMParser, parseHTML } = await import('linkedom');
  const w = parseHTML('<!doctype html><html><body></body></html>') as unknown as Record<string, unknown>;
  const g = globalThis as Record<string, unknown>;
  g['DOMParser'] = DOMParser;
  for (const k of ['HTMLElement', 'Element', 'Node', 'Text']) if (!(k in g)) g[k] = w[k];
};

export const readDocBytes = async (bytes: Uint8Array, name: string, password?: string): Promise<Doc> => {
  const ext = extname(name).slice(1).toLowerCase();
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return (await import('../formats/pdf')).readPdf(bytes);
  if (isCompound(bytes)) {
    if (readCompound(bytes).has('EncryptedPackage')) {
      if (!password) throw new FileError(`${basename(name)} has a password. Pass it with --password.`);
      const { decryptPackage } = await import('../formats/crypt');
      return readDocx(await decryptPackage(bytes, password));
    }
    return (await import('../formats/doc')).readDoc(bytes);
  }
  if (zip && ext === 'odt') return (await import('../formats/odt')).readOdt(bytes);
  if (zip) return readDocx(bytes);
  const text = decodeText(bytes);
  if (text.startsWith('{\\rtf')) return (await import('../formats/rtf')).readRtf(text);
  if (ext === 'md' || ext === 'markdown') return readMarkdown(text);
  if (ext === 'html' || ext === 'htm' || /^\s*<(!doctype|html)/i.test(text)) { await ensureDom(); return (await import('../formats/html')).readHtml(text); }
  return readText(text);
};

export const readDocFile = async (path: string, password?: string): Promise<Doc> => {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await readFile(path)); } catch { throw new FileError(`Can't read ${path}.`); }
  return readDocBytes(bytes, path, password);
};

export const formatOf = (path: string, format?: string): Format => {
  const f = (format ?? extname(path).slice(1)).toLowerCase().replace(/^markdown$/, 'md').replace(/^htm$/, 'html').replace(/^text$/, 'txt');
  if (!(FORMATS as readonly string[]).includes(f)) throw new FileError(`Can't save as "${f || path}". Use one of: ${FORMATS.join(', ')}.`);
  return f as Format;
};

export const docBytes = async (doc: Doc, format: Format, title: string, password?: string): Promise<Uint8Array> => {
  const enc = (s: string) => new TextEncoder().encode(s);
  switch (format) {
    case 'docx': {
      const data = writeDocx(doc);
      if (!password) return data;
      return (await import('../formats/crypt')).encryptPackage(data, password);
    }
    case 'odt': return (await import('../formats/odt')).writeOdt(doc);
    case 'rtf': return enc((await import('../formats/rtf')).writeRtf(doc));
    case 'html': return enc(toHtml(doc, title));
    case 'md': return enc(toMarkdown(doc));
    case 'txt': return enc(toText(doc));
  }
};

export const writeDocFile = async (doc: Doc, path: string, opts: { format?: string; password?: string } = {}): Promise<Format> => {
  const format = formatOf(path, opts.format);
  if (opts.password && format !== 'docx') throw new FileError('Only .docx files can have a password.');
  const data = await docBytes(doc, format, basename(path, extname(path)), opts.password);
  try { await writeFile(path, data); } catch { throw new FileError(`Can't write ${path}.`); }
  return format;
};
