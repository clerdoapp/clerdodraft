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
