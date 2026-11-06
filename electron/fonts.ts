import { open, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIRS: Record<string, string[]> = {
  win32: [join(process.env['WINDIR'] ?? 'C:\\Windows', 'Fonts'), join(process.env['LOCALAPPDATA'] ?? '', 'Microsoft', 'Windows', 'Fonts')],
  darwin: ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', join(homedir(), 'Library', 'Fonts'), '/Applications/Microsoft Word.app/Contents/Resources/DFonts'],
  linux: ['/usr/share/fonts', '/usr/local/share/fonts', join(homedir(), '.fonts'), join(homedir(), '.local', 'share', 'fonts')],
};

const files = async (dir: string, depth = 0): Promise<string[]> => {
  try {
    const list = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of list) {
      const p = join(dir, e.name);
      if (e.isDirectory() && depth < 4) out.push(...(await files(p, depth + 1)));
      else if (/\.(ttf|otf|ttc|otc)$/i.test(e.name)) out.push(p);
    }
    return out;
  } catch { return []; }
};

const read = async (fh: import('node:fs/promises').FileHandle, at: number, n: number): Promise<Buffer> => {
  const b = Buffer.alloc(n);
  const { bytesRead } = await fh.read(b, 0, n, at);
  return b.subarray(0, bytesRead);
};

// Reads the family name from a font's name table without loading the whole file.
const familyAt = async (fh: import('node:fs/promises').FileHandle, base: number): Promise<string | null> => {
  const head = await read(fh, base, 12);
  if (head.length < 12) return null;
  const count = head.readUInt16BE(4);
  const dir = await read(fh, base + 12, count * 16);
  for (let i = 0; i < count; i++) {
    if (dir.toString('latin1', i * 16, i * 16 + 4) !== 'name') continue;
    const off = dir.readUInt32BE(i * 16 + 8);
    const len = Math.min(dir.readUInt32BE(i * 16 + 12), 256 * 1024);
    const t = await read(fh, off, len);
    const n = t.readUInt16BE(2);
    const strings = t.readUInt16BE(4);
    let best: string | null = null;
    let rank = 0;
    for (let k = 0; k < n; k++) {
      const r = 6 + k * 12;
      if (r + 12 > t.length) break;
      const platform = t.readUInt16BE(r);
      const lang = t.readUInt16BE(r + 4);
      const id = t.readUInt16BE(r + 6);
      if (id !== 1 && id !== 16) continue;
      const s = t.subarray(strings + t.readUInt16BE(r + 10), strings + t.readUInt16BE(r + 10) + t.readUInt16BE(r + 8));
      const text = platform === 3 || platform === 0 ? s.swap16().toString('utf16le') : s.toString('latin1');
      const score = (id === 16 ? 2 : 1) * 10 + (platform === 3 && lang === 0x409 ? 3 : platform === 1 ? 1 : 2);
      if (text && score > rank) { best = text; rank = score; }
    }
    return best;
  }
  return null;
};

export const installedFonts = async (): Promise<string[]> => {
  const names = new Set<string>();
  const all = (await Promise.all((DIRS[process.platform] ?? DIRS['linux']!).map((d) => files(d)))).flat();
  await Promise.all(all.map(async (p) => {
    let fh: import('node:fs/promises').FileHandle | undefined;
    try {
      fh = await open(p, 'r');
      const tag = (await read(fh, 0, 12));
      if (tag.toString('latin1', 0, 4) === 'ttcf') {
        const count = Math.min(tag.readUInt32BE(8), 64);
        const offs = await read(fh, 12, count * 4);
        for (let i = 0; i < count; i++) { const f = await familyAt(fh, offs.readUInt32BE(i * 4)); if (f) names.add(f); }
      } else {
        const f = await familyAt(fh, 0);
        if (f) names.add(f);
      }
    } catch { /* unreadable font file */ } finally { await fh?.close(); }
  }));
  return [...names].filter((n) => !n.startsWith('.')).sort((a, b) => a.localeCompare(b));
};
