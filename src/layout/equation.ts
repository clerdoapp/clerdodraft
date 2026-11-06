import { layoutMath, parseMath, type MathBox } from '../core/math';
import type { EquationAtom } from '../core/model';
import type { Measurer } from './types';

export const MATH_FAMILY = 'Cambria';
export const MATH_FONT = '"Caladea", "Cambria", serif';

const cache = new Map<string, MathBox>();

export const equationBox = (m: Measurer, atom: Pick<EquationAtom, 'source'>, size: number): MathBox => {
  const key = `${size}|${atom.source}`;
  let box = cache.get(key);
  if (!box) {
    box = layoutMath(parseMath(atom.source), size, { width: (text, s, italic) => m.width(text, { family: MATH_FAMILY, size: s, bold: false, italic }) });
    if (cache.size > 500) cache.clear();
    cache.set(key, box);
  }
  return box;
};
