import type { Doc } from '../core/model';
import { DocBuilder } from './build';

export const decodeText = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1256').decode(bytes); }
};

export const readText = (text: string): Doc => {
  const b = new DocBuilder();
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) b.add(line ? [{ text: line.replace(/[\f\v]/g, ' '), props: {} }] : []);
  return b.finish();
};
