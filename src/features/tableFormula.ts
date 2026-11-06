import type { Doc, Table } from '../core/model';
import { paraText, updatePara, walkParagraphs } from '../core/tree';

const cellNumber = (t: Table, r: number, c: number): number | null => {
  const cell = t.rows[r]?.cells[c];
  if (!cell) return null;
  const text = [...walkParagraphs(cell.blocks)].map((p) => p.runs.filter((x) => !x.atom || x.atom.kind === 'field').map((x) => (x.atom?.kind === 'field' ? x.atom.result : x.text)).join('')).join(' ').trim();
  const clean = text.replace(/[,$€£%\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

const collect = (arg: string, t: Table, r: number, c: number): number[] => {
  const out: number[] = [];
  const push = (y: number, x: number) => { const n = cellNumber(t, y, x); if (n !== null) out.push(n); };
  const up = arg.trim().toUpperCase();
  if (up === 'ABOVE') for (let y = r - 1; y >= 0; y--) push(y, c);
  else if (up === 'BELOW') for (let y = r + 1; y < t.rows.length; y++) push(y, c);
  else if (up === 'LEFT') for (let x = c - 1; x >= 0; x--) push(r, x);
  else if (up === 'RIGHT') for (let x = c + 1; x < (t.rows[r]?.cells.length ?? 0); x++) push(r, x);
  else {
    for (const part of up.split(/[,;]/)) {
      const m = /^([A-Z])(\d+)(?::([A-Z])(\d+))?$/.exec(part.trim());
      if (!m) continue;
      const x0 = m[1]!.charCodeAt(0) - 65; const y0 = Number(m[2]) - 1;
      const x1 = m[3] ? m[3].charCodeAt(0) - 65 : x0; const y1 = m[4] ? Number(m[4]) - 1 : y0;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) push(y, x);
    }
  }
  return out;
};

const FUNCS: Record<string, (v: number[]) => number> = {
  SUM: (v) => v.reduce((a, b) => a + b, 0),
  AVERAGE: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
  COUNT: (v) => v.length,
  MIN: (v) => (v.length ? Math.min(...v) : 0),
  MAX: (v) => (v.length ? Math.max(...v) : 0),
  PRODUCT: (v) => v.reduce((a, b) => a * b, 1),
};

// Small arithmetic reader, so a formula from a file is never run as code.
export const evaluate = (formula: string, t: Table, r: number, c: number): number => {
  const src = formula.trim().replace(/^=/, '');
  let i = 0;
  const space = () => { while (src[i] === ' ') i++; };
  const atom = (): number => {
    space();
    if (src[i] === '(') { i++; const v = sum(); space(); if (src[i] !== ')') throw new Error('bad'); i++; return v; }
    if (src[i] === '-') { i++; return -atom(); }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const name = /^[A-Za-z]+\d*/.exec(src.slice(i));
    if (!name) throw new Error('bad');
    i += name[0].length;
    const fn = FUNCS[name[0].toUpperCase()];
    space();
    if (fn && src[i] === '(') {
      const end = src.indexOf(')', i);
      if (end < 0) throw new Error('bad');
      const arg = src.slice(i + 1, end);
      i = end + 1;
      return fn(collect(arg, t, r, c));
    }
    return collect(name[0], t, r, c)[0] ?? 0;
  };
  const product = (): number => {
    let v = atom();
    for (;;) { space(); if (src[i] === '*') { i++; v *= atom(); } else if (src[i] === '/') { i++; v /= atom(); } else return v; }
  };
  const sum = (): number => {
    let v = product();
    for (;;) { space(); if (src[i] === '+') { i++; v += product(); } else if (src[i] === '-') { i++; v -= product(); } else return v; }
  };
  const v = sum();
  space();
  if (i < src.length) throw new Error('bad');
  return v;
};

export const formulaResult = (formula: string, t: Table, r: number, c: number): string => {
  try {
    const v = evaluate(formula, t, r, c);
    return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : '!Error';
  } catch { return '!Error'; }
};

export const refreshFormulas = (doc: Doc): Doc => {
  let d = doc;
  const visit = (t: Table): void => {
    t.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
      for (const b of cell.blocks) {
        if (b.type === 'tbl') visit(b);
        if (b.type !== 'p' || !b.runs.some((x) => x.atom?.kind === 'field' && x.atom.instr.trim().startsWith('='))) continue;
        d = updatePara(d, 'body', b.id, (q) => ({ ...q, runs: q.runs.map((x) => (x.atom?.kind === 'field' && x.atom.instr.trim().startsWith('=') ? { ...x, atom: { ...x.atom, result: formulaResult(x.atom.instr, t, r, c) } } : x)) }));
      }
    }));
  };
  for (const b of doc.blocks) if (b.type === 'tbl') visit(b);
  return d;
};

void paraText;
