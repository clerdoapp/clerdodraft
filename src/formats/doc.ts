import type { Block, Doc, Run } from '../core/model';
import { para } from '../core/model';
import { DocBuilder, makeTable } from './build';
import { readCompound } from './cfb';

// Reads the text and table structure of the older binary format. Formatting is not carried over.
const pieces = (word: Uint8Array, table: Uint8Array): string => {
  const w = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const fcClx = w.getUint32(418, true);
  const lcbClx = w.getUint32(422, true);
  let at = fcClx;
  const end = fcClx + lcbClx;
  while (at < end && table[at] === 1) at += 3 + t.getUint16(at + 1, true);
  if (table[at] !== 2) throw new Error("This older document couldn't be read.");
  const size = t.getUint32(at + 1, true);
  const base = at + 5;
  const count = (size - 4) / 12;
  let text = '';
  const cp1252 = new TextDecoder('windows-1252');
  const utf16 = new TextDecoder('utf-16le');
  for (let i = 0; i < count; i++) {
    const from = t.getUint32(base + i * 4, true);
    const to = t.getUint32(base + (i + 1) * 4, true);
    const raw = t.getUint32(base + (count + 1) * 4 + i * 8 + 2, true);
    const chars = to - from;
    if (raw & 0x40000000) {
      const fc = (raw & 0x3fffffff) >>> 1;
      text += cp1252.decode(word.subarray(fc, fc + chars));
    } else text += utf16.decode(word.subarray(raw, raw + chars * 2));
  }
  return text;
};

const stripFields = (s: string): string => {
  let out = '';
  const stack: boolean[] = [];
  for (const c of s) {
    if (c === '\x13') { stack.push(true); continue; }
    if (c === '\x14') { if (stack.length) stack[stack.length - 1] = false; continue; }
    if (c === '\x15') { stack.pop(); continue; }
    if (!stack.some(Boolean)) out += c;
  }
  return out;
};

const runsOf = (text: string): Run[] => {
  const clean = text.replace(/[\x01\x02\x05\x08]/g, '').replace(/\x1e/g, '-').replace(/\x1f/g, '­').replace(/\x0e/g, '\v').replace(/\x0b/g, '\n').replace(/\xa0/g, ' ');
  return clean ? [{ text: clean, props: {} }] : [];
};

export const readDoc = (bytes: Uint8Array): Doc => {
  const files = readCompound(bytes);
  const word = files.get('WordDocument');
  if (!word) throw new Error('This file is not a document this app can read.');
  const v = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (v.getUint16(0, true) !== 0xa5ec || v.getUint16(2, true) < 101) throw new Error('This document uses a format that is too old to open.');
  const flags = v.getUint16(10, true);
  if (flags & 0x0100) throw new Error('This older document is protected with a password.');
  const table = files.get(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new Error("This older document couldn't be read.");
  const body = v.getUint32(76, true);
  const text = stripFields(pieces(word, table).slice(0, body));

  const b = new DocBuilder();
  let rows: Block[][][] = [];
  let row: Block[][] = [];
  let cell: Block[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\r') {
      if (row.length || cell.length) cell.push(para(runsOf(cur)));
      else { if (rows.length) { b.blocks.push(makeTable(rows)); rows = []; } b.add(runsOf(cur)); }
      cur = '';
    } else if (c === '\x07') {
      if (text[i + 1] === '\x07') {
        cell.push(para(runsOf(cur)));
        row.push(cell);
        rows.push(row);
        row = []; cell = []; cur = '';
        i++;
      } else if (cur || !cell.length || row.length) {
        cell.push(para(runsOf(cur)));
        row.push(cell);
        cell = []; cur = '';
      } else { rows.push(row); row = []; }
    } else cur += c;
  }
  if (rows.length) b.blocks.push(makeTable(rows));
  if (cur) b.add(runsOf(cur));
  return b.finish();
};
