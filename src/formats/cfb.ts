// Reader for the compound container used by older documents and encrypted packages.
export const isCompound = (b: Uint8Array): boolean => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

const END = 0xfffffffe;

export const readCompound = (bytes: Uint8Array): Map<string, Uint8Array> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << view.getUint16(30, true);
  const miniSize = 1 << view.getUint16(32, true);
  const cutoff = view.getUint32(56, true);
  const sector = (n: number) => bytes.subarray((n + 1) * sectorSize, (n + 2) * sectorSize);

  const difat: number[] = [];
  for (let i = 0; i < 109; i++) difat.push(view.getUint32(76 + i * 4, true));
  let next = view.getUint32(68, true);
  for (let guard = 0; next < END && guard < 100000; guard++) {
    const s = new DataView(sector(next).buffer, sector(next).byteOffset, sectorSize);
    for (let i = 0; i < sectorSize / 4 - 1; i++) difat.push(s.getUint32(i * 4, true));
    next = s.getUint32(sectorSize - 4, true);
  }
  const fat: number[] = [];
  for (const d of difat) {
    if (d >= END) continue;
    const s = sector(d);
    const v = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(v.getUint32(i * 4, true));
  }
  const chain = (start: number, table: number[], read: (n: number) => Uint8Array, unit: number, size?: number): Uint8Array => {
    const parts: Uint8Array[] = [];
    const seen = new Set<number>();
    for (let n = start; n < END && !seen.has(n); n = table[n] ?? END) { seen.add(n); parts.push(read(n)); }
    const out = new Uint8Array(parts.length * unit);
    parts.forEach((p, i) => out.set(p, i * unit));
    return size === undefined ? out : out.subarray(0, size);
  };
  const dir = chain(view.getUint32(48, true), fat, sector, sectorSize);
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const miniFat: number[] = [];
  const miniTable = chain(view.getUint32(60, true), fat, sector, sectorSize);
  const mv = new DataView(miniTable.buffer, miniTable.byteOffset, miniTable.byteLength);
  for (let i = 0; i < miniTable.length / 4; i++) miniFat.push(mv.getUint32(i * 4, true));

  const out = new Map<string, Uint8Array>();
  let mini: Uint8Array = new Uint8Array();
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const type = dir[o + 66];
    if (type !== 2 && type !== 5) continue;
    const len = dv.getUint16(o + 64, true);
    const name = new TextDecoder('utf-16le').decode(dir.subarray(o, o + Math.max(0, len - 2)));
    const start = dv.getUint32(o + 116, true);
    const size = dv.getUint32(o + 120, true);
    if (type === 5) { mini = chain(start, fat, sector, sectorSize, size); continue; }
    out.set(name, size >= cutoff ? chain(start, fat, sector, sectorSize, size) : chain(start, miniFat, (n) => mini.subarray(n * miniSize, (n + 1) * miniSize), miniSize, size));
  }
  return out;
};

const SECTOR = 4096;
const MINI = 64;
const concat = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const utf16 = (s: string): Uint8Array => { const out = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) new DataView(out.buffer).setUint16(i * 2, s.charCodeAt(i), true); return out; };

const FREE = 0xffffffff;
const CHAIN_END = 0xfffffffe;
const FAT_SECTOR = 0xfffffffd;

// Writes a compound container holding the given streams at its top level.
export const writeCompound = (streams: [string, Uint8Array][], clsid?: Uint8Array): Uint8Array => {
  streams = [...streams].sort(([a], [b]) => a.length - b.length || (a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0));
  const miniData: Uint8Array[] = [];
  const miniFat: number[] = [];
  const placed = streams.map(([name, data]) => {
    if (data.length >= SECTOR) return { name, data, mini: false, start: 0 };
    const start = miniFat.length;
    const count = Math.ceil(data.length / MINI);
    for (let i = 0; i < count; i++) miniFat.push(i === count - 1 ? CHAIN_END : start + i + 1);
    miniData.push(concat(data, new Uint8Array(count * MINI - data.length)));
    return { name, data, mini: true, start };
  });
  const miniStream = concat(...miniData);
  const miniFatBytes = new Uint8Array(Math.ceil((miniFat.length * 4) / SECTOR) * SECTOR).fill(0xff);
  miniFat.forEach((v, i) => new DataView(miniFatBytes.buffer).setUint32(i * 4, v, true));

  const sectors = (n: number) => Math.ceil(n / SECTOR);
  const big = placed.filter((p) => !p.mini);
  const dataCount = 1 + sectors(miniFatBytes.length) + sectors(miniStream.length) + big.reduce((s, p) => s + sectors(p.data.length), 0);
  let fatCount = 1;
  while (fatCount * (SECTOR / 4) < dataCount + fatCount) fatCount++;
  if (fatCount > 109) throw new Error('This file is too large to store.');

  const fat = new Array<number>(fatCount * (SECTOR / 4)).fill(FREE);
  for (let i = 0; i < fatCount; i++) fat[i] = FAT_SECTOR;
  let next = fatCount;
  const body: Uint8Array[] = [];
  const place = (bytes: Uint8Array): number => {
    const start = next;
    const count = sectors(bytes.length);
    for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? CHAIN_END : start + i + 1;
    body.push(concat(bytes, new Uint8Array(count * SECTOR - bytes.length)));
    next += count;
    return count ? start : CHAIN_END;
  };
  const dirSectors = sectors((streams.length + 1) * 128);
  const dirStart = next;
  for (let i = 0; i < dirSectors; i++) fat[next + i] = i === dirSectors - 1 ? CHAIN_END : next + i + 1;
  next += dirSectors;
  const miniFatStart = place(miniFatBytes);
  const miniStart = place(miniStream);
  for (const p of big) p.start = place(p.data);

  const dir = new Uint8Array(dirSectors * SECTOR);
  const dv = new DataView(dir.buffer);
  for (let o = 0; o < dir.length; o += 128) { dv.setUint32(o + 68, FREE, true); dv.setUint32(o + 72, FREE, true); dv.setUint32(o + 76, FREE, true); }
  const entry = (i: number, name: string, type: number, left: number, right: number, child: number, start: number, size: number) => {
    const o = i * 128;
    dir.set(utf16(name), o);
    dv.setUint16(o + 64, (name.length + 1) * 2, true);
    dir[o + 66] = type;
    dir[o + 67] = 1;
    dv.setUint32(o + 68, left, true);
    dv.setUint32(o + 72, right, true);
    dv.setUint32(o + 76, child, true);
    dv.setUint32(o + 116, start, true);
    dv.setUint32(o + 120, size, true);
  };
  entry(0, 'Root Entry', 5, FREE, FREE, placed.length ? 1 : FREE, miniStream.length ? miniStart : CHAIN_END, miniStream.length);
  if (clsid) dir.set(clsid, 80);
  // Siblings sorted by name and linked to the right form a valid tree.
  placed.forEach((p, i) => entry(i + 1, p.name, 2, FREE, i + 1 < placed.length ? i + 2 : FREE, FREE, p.start, p.data.length));

  const head = new Uint8Array(SECTOR);
  const hv = new DataView(head.buffer);
  head.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  hv.setUint16(24, 0x3e, true);
  hv.setUint16(26, 4, true);
  hv.setUint16(28, 0xfffe, true);
  hv.setUint16(30, 12, true);
  hv.setUint16(32, 6, true);
  hv.setUint32(40, 1, true);
  hv.setUint32(44, fatCount, true);
  hv.setUint32(48, dirStart, true);
  hv.setUint32(56, SECTOR, true);
  hv.setUint32(60, miniFatStart, true);
  hv.setUint32(64, sectors(miniFatBytes.length), true);
  hv.setUint32(68, CHAIN_END, true);
  for (let i = 0; i < 109; i++) hv.setUint32(76 + i * 4, i < fatCount ? i : FREE, true);
  const fatBytes = new Uint8Array(fatCount * SECTOR);
  fat.forEach((v, i) => new DataView(fatBytes.buffer).setUint32(i * 4, v, true));
  return concat(head, fatBytes, dir, ...body);
};
