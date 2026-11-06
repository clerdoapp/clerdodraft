import { isCompound, readCompound, writeCompound } from './cfb';

// Any file can be embedded by wrapping it in the standard package object, which other editors also open.
const PACKAGE_CLSID = Uint8Array.from([0x0c, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46]);

const ansi = (s: string): Uint8Array => Uint8Array.from([...s.replace(/[^\x20-\x7e]/g, '_')].map((c) => c.charCodeAt(0)).concat(0));
const u32 = (n: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const u16 = (n: number): Uint8Array => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
const cat = (...p: Uint8Array[]): Uint8Array => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let at = 0; for (const x of p) { o.set(x, at); at += x.length; } return o; };
const lpAnsi = (s: string): Uint8Array => { const b = ansi(s); return cat(u32(b.length), b); };
const utf16z = (s: string): Uint8Array => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) new DataView(b.buffer).setUint16(i * 2, s.charCodeAt(i), true); return b; };

export const makePackage = (name: string, data: Uint8Array): Uint8Array => {
  const label = ansi(name);
  const path = ansi(`C:\\${name}`);
  // The original name, which may hold any letters, follows the older fields in wide characters.
  const wide = (s: string) => cat(u32(s.length), utf16z(s));
  const body = cat(u16(2), label, path, u16(0), u16(3), u32(path.length), path, u32(data.length), data, wide(`C:\\${name}`), wide(name), wide(`C:\\${name}`));
  const native = cat(u32(body.length), body);
  const compObj = cat(Uint8Array.from([0x01, 0x00, 0xfe, 0xff, 0x03, 0x0a, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff]), PACKAGE_CLSID, lpAnsi('OLE Package'), u32(0), lpAnsi('Package'), u32(0x71b239f4), u32(0), u32(0), u32(0));
  return writeCompound([['\x01Ole10Native', native], ['\x01CompObj', compObj], ['\x03ObjInfo', Uint8Array.from([0, 0, 3, 0, 1, 0])]], PACKAGE_CLSID);
};

export const readPackage = (bin: Uint8Array): { name: string; data: Uint8Array } | null => {
  if (!isCompound(bin)) return null;
  const native = readCompound(bin).get('\x01Ole10Native');
  if (!native || native.length < 12) return null;
  const v = new DataView(native.buffer, native.byteOffset, native.byteLength);
  let at = 6;
  const z = (): string => { const s = at; while (at < native.length && native[at]) at++; const out = new TextDecoder('latin1').decode(native.subarray(s, at)); at++; return out; };
  let name = z();
  z();
  at += 4;
  const tempLen = v.getUint32(at, true); at += 4 + tempLen;
  const size = v.getUint32(at, true); at += 4;
  if (at + size > native.length) return null;
  const data = native.slice(at, at + size);
  at += size;
  // Prefer the wide-character name when it is present.
  try {
    const n1 = v.getUint32(at, true); at += 4 + n1 * 2;
    const n2 = v.getUint32(at, true);
    if (n2 > 0 && n2 < 1024 && at + 4 + n2 * 2 <= native.length) name = new TextDecoder('utf-16le').decode(native.subarray(at + 4, at + 4 + n2 * 2));
  } catch { /* the older fields are enough */ }
  return { name: name || 'embedded', data };
};
