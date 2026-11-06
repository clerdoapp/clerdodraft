import type { Block, Doc, Paragraph, ParaProps, Run, RunProps } from '../core/model';
import { para } from '../core/model';
import { paraText } from '../core/tree';
import { DocBuilder, makeTable } from './build';

interface State { run: RunProps; skip: number; uc: number; fontTable: boolean; colorTable: boolean; pict: boolean; }

const SKIP_GROUPS = new Set(['stylesheet', 'info', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote', 'annotation', 'fldinst', 'pntext', 'pntxta', 'pntxtb', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'object', 'filetbl', 'revtbl', 'shpinst', 'shptxt']);

const CODEPAGES: Record<number, string> = { 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5' };
const CHARSETS: Record<number, number> = { 161: 1253, 162: 1254, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 238: 1250, 128: 932, 134: 936, 129: 949, 136: 950 };

export const readRtf = (src: string): Doc => {
  if (!src.startsWith('{\\rtf')) throw new Error('This file is not a valid rich text document.');
  const b = new DocBuilder();
  const fonts: Record<number, { name: string; cp?: number }> = {};
  const colors: (string | undefined)[] = [];
  let color = { r: 0, g: 0, b: 0, set: false };
  let fontId = -1;
  let fontName = '';
  let codepage = 1252;
  let state: State = { run: {}, skip: 0, uc: 1, fontTable: false, colorTable: false, pict: false };
  const stack: State[] = [];
  let runs: Run[] = [];
  let props: ParaProps = {};
  let pendingBytes: number[] = [];
  let skipChars = 0;
  let row: Block[][] = [];
  let rows: Block[][][] = [];
  let cell: Block[] = [];
  let inTable = false;
  let hex = '';
  let pictMime = '';
  let pictW = 0;
  let pictH = 0;

  const flushBytes = () => {
    if (!pendingBytes.length) return;
    const cp = (state.run.font ? Object.values(fonts).find((f) => f.name === state.run.font)?.cp : undefined) ?? codepage;
    const text = new TextDecoder(CODEPAGES[cp] ?? 'windows-1252').decode(new Uint8Array(pendingBytes));
    pendingBytes = [];
    runs.push({ text, props: { ...state.run } });
  };
  const emit = (t: string) => { flushBytes(); if (t) runs.push({ text: t, props: { ...state.run } }); };
  const endPara = () => {
    flushBytes();
    if (inTable) { cell.push(para(tidy(runs), { ...props })); runs = []; return; }
    b.add(runs, { ...props });
    runs = [];
  };
  const endTable = () => {
    if (!rows.length) return;
    b.blocks.push(makeTable(rows));
    rows = [];
  };

  const word = (w: string, n: number | null): void => {
    if (state.fontTable) {
      if (w === 'f' && n !== null) { fontId = n; fontName = ''; }
      if (w === 'fcharset' && n !== null && CHARSETS[n]) fonts[fontId] = { name: '', cp: CHARSETS[n] };
      return;
    }
    if (state.colorTable) {
      if (w === 'red') { color.r = n ?? 0; color.set = true; }
      if (w === 'green') { color.g = n ?? 0; color.set = true; }
      if (w === 'blue') { color.b = n ?? 0; color.set = true; }
      return;
    }
    if (state.pict) {
      if (w === 'pngblip') pictMime = 'image/png';
      if (w === 'jpegblip') pictMime = 'image/jpeg';
      if (w === 'picwgoal' && n) pictW = n / 20;
      if (w === 'pichgoal' && n) pictH = n / 20;
      return;
    }
    const on = n !== 0;
    const r = state.run;
    switch (w) {
      case 'ansicpg': if (n) codepage = n; break;
      case 'uc': state.uc = n ?? 1; break;
      case 'u': { flushBytes(); let c = n ?? 0; if (c < 0) c += 65536; emit(String.fromCharCode(c)); skipChars = state.uc; break; }
      case 'par': endPara(); break;
      case 'line': emit('\n'); break;
      case 'page': emit('\f'); break;
      case 'tab': emit('\t'); break;
      case 'emdash': emit('—'); break;
      case 'endash': emit('–'); break;
      case 'bullet': emit('•'); break;
      case 'lquote': emit('‘'); break;
      case 'rquote': emit('’'); break;
      case 'ldblquote': emit('“'); break;
      case 'rdblquote': emit('”'); break;
      case 'plain': flushBytes(); state.run = {}; break;
      case 'pard': flushBytes(); props = {}; if (inTable) { /* still in the row until \row */ } break;
      case 'b': flushBytes(); r.bold = on || undefined; break;
      case 'i': flushBytes(); r.italic = on || undefined; break;
      case 'ul': flushBytes(); r.underline = on ? 'single' : undefined; break;
      case 'ulnone': flushBytes(); r.underline = undefined; break;
      case 'strike': flushBytes(); r.strike = on || undefined; break;
      case 'super': flushBytes(); r.vertAlign = 'super'; break;
      case 'sub': flushBytes(); r.vertAlign = 'sub'; break;
      case 'nosupersub': flushBytes(); r.vertAlign = undefined; break;
      case 'fs': flushBytes(); r.size = (n ?? 22) / 2; break;
      case 'f': flushBytes(); r.font = fonts[n ?? 0]?.name || undefined; break;
      case 'cf': flushBytes(); r.color = colors[n ?? 0]; break;
      case 'highlight': case 'cb': flushBytes(); r.highlight = colors[n ?? 0]; break;
      case 'ql': props.align = 'left'; break;
      case 'qc': props.align = 'center'; break;
      case 'qr': props.align = 'right'; break;
      case 'qj': props.align = 'justify'; break;
      case 'li': props.indentLeft = (n ?? 0) / 20; break;
      case 'ri': props.indentRight = (n ?? 0) / 20; break;
      case 'fi': props.firstLine = (n ?? 0) / 20; break;
      case 'sb': props.spaceBefore = (n ?? 0) / 20; break;
      case 'sa': props.spaceAfter = (n ?? 0) / 20; break;
      case 'rtlpar': props.bidi = true; break;
      case 'trowd': flushBytes(); inTable = true; break;
      case 'intbl': inTable = true; break;
      case 'cell': if (runs.length || !cell.length) endPara(); row.push(cell); cell = []; break;
      case 'row': rows.push(row); row = []; inTable = false; break;
      default: break;
    }
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '{') {
      stack.push({ ...state, run: { ...state.run } });
      if (src.startsWith('{\\*', i)) { state.skip++; }
      i++;
      continue;
    }
    if (c === '}') {
      if (!inTable && rows.length && !state.fontTable) { /* table ends at the next paragraph */ }
      if (state.pict && !stack[stack.length - 1]?.pict) {
        if (pictMime && hex) {
          const data = new Uint8Array(Math.floor(hex.length / 2));
          for (let k = 0; k < data.length; k++) data[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
          flushBytes();
          runs.push(b.image({ mime: pictMime, data, width: pictW || 300, height: pictH || 200 }));
        }
        hex = ''; pictMime = ''; pictW = 0; pictH = 0;
      }
      flushBytes();
      state = stack.pop() ?? state;
      i++;
      continue;
    }
    if (c === '\\') {
      const nx = src[i + 1];
      if (nx === "'") {
        const v = parseInt(src.slice(i + 2, i + 4), 16);
        i += 4;
        if (skipChars > 0) { skipChars--; continue; }
        if (!state.skip && !state.fontTable && !state.colorTable && !state.pict) pendingBytes.push(v);
        continue;
      }
      if (nx === '\\' || nx === '{' || nx === '}') {
        i += 2;
        if (skipChars > 0) { skipChars--; continue; }
        if (!state.skip && !state.fontTable && !state.colorTable) emit(nx);
        continue;
      }
      if (nx === '~') { i += 2; if (!state.skip) emit('\u00a0'); continue; }
      if (nx === '-') { i += 2; if (!state.skip) emit('\u00ad'); continue; }
      if (nx === '_') { i += 2; if (!state.skip) emit('\u2011'); continue; }
      if (nx === '\n' || nx === '\r') { i += 2; if (!state.skip) word('par', null); continue; }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 40));
      if (!m) { i += 2; continue; }
      i += 1 + m[0].length;
      const name = m[1]!;
      const val = m[2] !== undefined ? parseInt(m[2], 10) : null;
      if (name === 'fonttbl') { state.fontTable = true; continue; }
      if (name === 'colortbl') { state.colorTable = true; continue; }
      if (name === 'pict') { state.pict = true; continue; }
      if (SKIP_GROUPS.has(name)) { state.skip++; continue; }
      if (state.skip) continue;
      if (rows.length && !inTable && (name === 'par' || name === 'pard')) endTable();
      word(name, val);
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (state.skip) { i++; continue; }
    if (state.pict) { if (/[0-9a-fA-F]/.test(c)) hex += c; i++; continue; }
    if (state.fontTable) {
      if (c === ';') { fonts[fontId] = { ...fonts[fontId], name: fontName.trim() }; fontName = ''; } else fontName += c;
      i++;
      continue;
    }
    if (state.colorTable) {
      if (c === ';') { colors.push(color.set ? `#${[color.r, color.g, color.b].map((v) => v.toString(16).padStart(2, '0')).join('')}` : undefined); color = { r: 0, g: 0, b: 0, set: false }; }
      i++;
      continue;
    }
    if (skipChars > 0) { skipChars--; i++; continue; }
    let j = i;
    while (j < n && !'\\{}\r\n'.includes(src[j]!)) j++;
    emit(src.slice(i, j));
    i = j;
  }
  flushBytes();
  endTable();
  if (runs.length) b.add(runs, { ...props });
  return b.finish();
};

const tidy = (runs: Run[]): Run[] => runs.filter((r) => r.text);

const escRtf = (s: string): string => {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\t') out += '\\tab ';
    else if (ch === '\f') out += '\\page ';
    else if (ch === '\v') continue;
    else if (ch === '\ufffc') continue;
    else if (code < 128) out += ch;
    else for (let i = 0; i < ch.length; i++) { const u = ch.charCodeAt(i); out += `\\u${u > 32767 ? u - 65536 : u}?`; }
  }
  return out;
};

export const writeRtf = (doc: Doc): string => {
  const fonts = ['Calibri'];
  const colors: string[] = [];
  const fontIx = (f: string) => { let i = fonts.indexOf(f); if (i < 0) i = fonts.push(f) - 1; return i; };
  const colorIx = (c: string) => { let i = colors.indexOf(c); if (i < 0) i = colors.push(c) - 1; return i + 1; };
  const runRtf = (r: Run): string => {
    const q = r.props;
    let open = '';
    if (q.bold) open += '\\b';
    if (q.italic) open += '\\i';
    if (q.underline && q.underline !== 'none') open += '\\ul';
    if (q.strike) open += '\\strike';
    if (q.vertAlign === 'super') open += '\\super';
    if (q.vertAlign === 'sub') open += '\\sub';
    if (q.size) open += `\\fs${Math.round(q.size * 2)}`;
    if (q.font) open += `\\f${fontIx(q.font)}`;
    if (q.color) open += `\\cf${colorIx(q.color)}`;
    if (q.highlight) open += `\\highlight${colorIx(q.highlight)}`;
    const text = escRtf(r.atom?.kind === 'field' ? r.atom.result : r.text);
    return open ? `{${open} ${text}}` : text;
  };
  const paraRtf = (p: Paragraph, inCell = false): string => {
    const q = p.props;
    let head = inCell ? '\\pard\\intbl' : '\\pard';
    if (q.align === 'center') head += '\\qc';
    if (q.align === 'right') head += '\\qr';
    if (q.align === 'justify') head += '\\qj';
    if (q.indentLeft) head += `\\li${Math.round(q.indentLeft * 20)}`;
    if (q.indentRight) head += `\\ri${Math.round(q.indentRight * 20)}`;
    if (q.firstLine) head += `\\fi${Math.round(q.firstLine * 20)}`;
    if (q.spaceBefore) head += `\\sb${Math.round(q.spaceBefore * 20)}`;
    if (q.spaceAfter) head += `\\sa${Math.round(q.spaceAfter * 20)}`;
    if (q.bidi) head += '\\rtlpar';
    const level = /^Heading([1-6])$/.exec(q.style ?? '');
    const body = p.runs.filter((r) => !r.del).map((r) => (level ? runRtf({ ...r, props: { bold: true, size: 20 - Number(level[1]) * 1.5, ...r.props } }) : runRtf(r))).join('');
    return `${head} ${body}${inCell ? '' : '\\par'}\n`;
  };
  const blockRtf = (b: Block): string => {
    if (b.type === 'p') return paraRtf(b);
    if (b.type !== 'tbl') return '';
    return b.rows.map((row) => {
      let x = 0;
      const defs = row.cells.map((c, i) => { x += c.props.width ?? b.grid[i] ?? 72; return `\\cellx${Math.round(x * 20)}`; }).join('');
      const cells = row.cells.map((c) => `${c.blocks.filter((k): k is Paragraph => k.type === 'p').map((k) => paraRtf(k, true)).join('\\par ')}\\cell\n`).join('');
      return `\\trowd${defs}\n${cells}\\row\n`;
    }).join('');
  };
  const body = doc.blocks.map(blockRtf).join('');
  const fontTbl = fonts.map((f, i) => `{\\f${i}\\fnil ${f};}`).join('');
  const colorTbl = colors.map((c) => `\\red${parseInt(c.slice(1, 3), 16)}\\green${parseInt(c.slice(3, 5), 16)}\\blue${parseInt(c.slice(5, 7), 16)};`).join('');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl${fontTbl}}{\\colortbl;${colorTbl}}\\fs22\n${body}}`;
};

void paraText;
