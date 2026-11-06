import type { Block, Doc, ParaProps, Run, RunProps } from '../core/model';
import { para } from '../core/model';
import { DocBuilder, makeTable } from './build';

const safeLink = (href: string): boolean => /^(https?:|mailto:|#)/i.test(href);

export const inline = (text: string, base: RunProps = {}): Run[] => {
  const out: Run[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?=\S)(.+?)\3|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)[^)]*\)|\\([\\`*_{}[\]()#+\-.!~])/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), props: base });
    if (m[2] !== undefined) out.push(...inline(m[2], { ...base, bold: true }));
    else if (m[4] !== undefined) out.push(...inline(m[4], { ...base, italic: true }));
    else if (m[5] !== undefined) out.push(...inline(m[5], { ...base, strike: true }));
    else if (m[6] !== undefined) out.push({ text: m[6], props: { ...base, font: 'Courier New' } });
    else if (m[7] !== undefined) out.push(...inline(m[7], { ...base, color: '#2347ff', underline: 'single' }).map((r) => (safeLink(m[8]!) ? { ...r, link: { href: m[8] } } : r)));
    else if (m[9] !== undefined) out.push({ text: m[9], props: base });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), props: base });
  return out;
};

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export const readMarkdown = (src: string): Doc => {
  const b = new DocBuilder();
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const head = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (!line.trim()) { i++; continue; }
    if (head) { b.add(inline(head[2]!), { style: `Heading${head[1]!.length}` }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { b.add([], { borders: { bottom: { style: 'single', width: 0.75, color: '#999999' } } }); i++; continue; }
    if (/^```/.test(line)) {
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) { b.add([{ text: lines[i]!, props: { font: 'Courier New', size: 10 } }], { spaceAfter: 0 }); i++; }
      i++;
      continue;
    }
    if (line.includes('|') && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1] ?? '') && lines[i + 1]!.includes('-')) {
      const rows: Block[][][] = [cells(line).map((c) => [para(inline(c, { bold: true }))])];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) { rows.push(cells(lines[i]!).map((c) => [para(inline(c))])); i++; }
      b.blocks.push(makeTable(rows));
      continue;
    }
    if (item) {
      const props: ParaProps = { numbering: { numId: b.list(/\d/.test(item[2]!) ? 'number' : 'bullet'), level: Math.min(8, Math.floor(item[1]!.length / 2)) } };
      b.add(inline(item[3]!), props);
      i++;
      continue;
    }
    if (line.startsWith('>')) { b.add(inline(line.replace(/^>\s?/, '')), { indentLeft: 36 }); i++; continue; }
    const text = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]!)) text.push(lines[i++]!);
    b.add(inline(text.join(' ')));
  }
  return b.finish();
};
