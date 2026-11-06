// Equations are edited as linear text such as (a+b)/2 or sqrt(x^2+1), and parsed into this tree.
export type MathNode =
  | { t: 'text'; text: string; plain?: boolean }
  | { t: 'seq'; items: MathNode[] }
  | { t: 'frac'; num: MathNode; den: MathNode }
  | { t: 'script'; base: MathNode; sub?: MathNode; sup?: MathNode }
  | { t: 'root'; body: MathNode; degree?: MathNode }
  | { t: 'nary'; op: string; sub?: MathNode; sup?: MathNode }
  | { t: 'fence'; open: string; close: string; body: MathNode };

export const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', pm: '±', times: '×', div: '÷', cdot: '·', le: '≤', ge: '≥', ne: '≠', approx: '≈', equiv: '≡', to: '→', in: '∈', partial: '∂', nabla: '∇', forall: '∀', exists: '∃',
};
const NARY: Record<string, string> = { sum: '∑', prod: '∏', int: '∫', '∑': '∑', '∏': '∏', '∫': '∫', '∬': '∬', '∮': '∮' };
const CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '|': '|' };
const OPS = new Set([...'+-−=<>≤≥≠≈×÷±·→,;:!']);
const WORDS = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'lim', 'min', 'max', 'exp']);

export const parseMath = (src: string): MathNode => {
  let i = 0;
  const peek = () => src[i];
  const space = () => { while (peek() === ' ') i++; };

  const seq = (stop?: string): MathNode => {
    const items: MathNode[] = [];
    for (;;) {
      space();
      const c = peek();
      if (c === undefined || (stop && c === stop) || ')]}'.includes(c)) break;
      items.push(term());
    }
    return items.length === 1 ? items[0]! : { t: 'seq', items };
  };

  // Brackets that only group a fraction part or a script are not drawn.
  const unwrap = (n: MathNode): MathNode => (n.t === 'fence' && n.open === '(' ? n.body : n.t === 'fence' && n.open === '{' ? n.body : n);

  const term = (): MathNode => {
    let left = scripted();
    for (;;) {
      space();
      if (peek() !== '/') return left;
      i++;
      left = { t: 'frac', num: unwrap(left), den: unwrap(scripted()) };
    }
  };

  const scripted = (): MathNode => {
    const base = atom();
    let sub: MathNode | undefined;
    let sup: MathNode | undefined;
    for (;;) {
      if (peek() === '^' && !sup) { i++; sup = unwrap(atom()); } else if (peek() === '_' && !sub) { i++; sub = unwrap(atom()); } else break;
    }
    if (!sub && !sup) return base;
    return base.t === 'nary' ? { ...base, sub, sup } : { t: 'script', base, sub, sup };
  };

  const atom = (): MathNode => {
    space();
    const c = peek();
    if (c === undefined) return { t: 'text', text: '' };
    if (c === '\\') {
      i++;
      const name = /^[A-Za-z]+/.exec(src.slice(i))?.[0] ?? '';
      i += name.length;
      if (name === 'frac') { const num = unwrap(atom()); return { t: 'frac', num, den: unwrap(atom()) }; }
      if (name === 'sqrt') return { t: 'root', body: unwrap(atom()) };
      if (NARY[name]) return { t: 'nary', op: NARY[name]! };
      return { t: 'text', text: SYMBOLS[name] ?? name };
    }
    if (c === '(' || c === '[' || c === '{' || c === '|') {
      i++;
      const body = seq(CLOSE[c]);
      if (peek() === CLOSE[c]) i++;
      return { t: 'fence', open: c, close: CLOSE[c]!, body };
    }
    if (c === '√') { i++; return { t: 'root', body: unwrap(atom()) }; }
    if (NARY[c]) { i++; return { t: 'nary', op: NARY[c]! }; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return { t: 'text', text: num[0], plain: true }; }
    const word = /^[A-Za-z]{2,}/.exec(src.slice(i));
    if (word) {
      i += word[0].length;
      if (word[0] === 'sqrt') { space(); return { t: 'root', body: unwrap(atom()) }; }
      if (NARY[word[0]]) return { t: 'nary', op: NARY[word[0]]! };
      if (SYMBOLS[word[0]]) return { t: 'text', text: SYMBOLS[word[0]]! };
      return { t: 'text', text: word[0], plain: WORDS.has(word[0]) };
    }
    i++;
    return { t: 'text', text: c === '-' ? '−' : c, plain: OPS.has(c) };
  };

  const out = seq();
  if (i < src.length) { const rest = src.slice(i + 1); return { t: 'seq', items: [out, { t: 'text', text: src[i]!, plain: true }, parseMath(rest)] }; }
  return out;
};

export interface MathFont { width(text: string, size: number, italic: boolean): number }
export type MathDraw = { k: 'text'; x: number; y: number; text: string; size: number; italic: boolean } | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number } | { k: 'path'; d: string; w: number };
export interface MathBox { w: number; asc: number; desc: number; draw: MathDraw[] }

const shift = (d: MathDraw[], dx: number, dy: number): MathDraw[] => d.map((x) => {
  if (x.k === 'text') return { ...x, x: x.x + dx, y: x.y + dy };
  if (x.k === 'line') return { ...x, x1: x.x1 + dx, x2: x.x2 + dx, y1: x.y1 + dy, y2: x.y2 + dy };
  return { ...x, d: x.d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a: string, b: string) => `${(+a + dx).toFixed(2)} ${(+b + dy).toFixed(2)}`) };
});

export const layoutMath = (node: MathNode, size: number, font: MathFont): MathBox => {
  const axis = size * 0.28;
  const rule = Math.max(0.5, size * 0.05);
  const small = (s: number) => Math.max(5, s * 0.7);
  const go = (n: MathNode, s: number): MathBox => {
    switch (n.t) {
      case 'text': {
        const italic = !n.plain && /\p{L}/u.test(n.text);
        const pad = n.plain && /^[+−=<>≤≥≠≈×÷±→]$/.test(n.text) ? s * 0.2 : 0;
        return { w: font.width(n.text, s, italic) + pad * 2, asc: s * 0.78, desc: s * 0.24, draw: [{ k: 'text', x: pad, y: 0, text: n.text, size: s, italic }] };
      }
      case 'seq': {
        let x = 0; let asc = s * 0.78; let desc = s * 0.24; const draw: MathDraw[] = [];
        for (const it of n.items) { const b = go(it, s); draw.push(...shift(b.draw, x, 0)); x += b.w; asc = Math.max(asc, b.asc); desc = Math.max(desc, b.desc); }
        return { w: x, asc, desc, draw };
      }
      case 'frac': {
        const fs = s > 8 ? s * 0.9 : s;
        const a = go(n.num, fs); const b = go(n.den, fs);
        const w = Math.max(a.w, b.w) + s * 0.3;
        const y = -axis;
        const gap = s * 0.12;
        return { w, asc: -y + gap + a.desc + a.asc, desc: y + gap + b.asc + b.desc, draw: [{ k: 'line', x1: 0, y1: y, x2: w, y2: y, w: rule }, ...shift(a.draw, (w - a.w) / 2, y - gap - a.desc), ...shift(b.draw, (w - b.w) / 2, y + gap + b.asc)] };
      }
      case 'script': {
        const base = go(n.base, s);
        const sup = n.sup ? go(n.sup, small(s)) : undefined; const sub = n.sub ? go(n.sub, small(s)) : undefined;
        const upY = -Math.max(base.asc - s * 0.3, s * 0.42); const downY = Math.max(base.desc, s * 0.2);
        const draw = [...base.draw, ...(sup ? shift(sup.draw, base.w + 1, upY) : []), ...(sub ? shift(sub.draw, base.w + 1, downY) : [])];
        return { w: base.w + 1 + Math.max(sup?.w ?? 0, sub?.w ?? 0), asc: Math.max(base.asc, sup ? -upY + sup.asc : 0), desc: Math.max(base.desc, sub ? downY + sub.desc : 0), draw };
      }
      case 'root': {
        const b = go(n.body, s);
        const gap = s * 0.1; const top = b.asc + gap + rule; const hook = s * 0.55;
        const d = `M 0 ${(-top * 0.35).toFixed(2)} L ${(hook * 0.3).toFixed(2)} ${(-top * 0.45).toFixed(2)} L ${(hook * 0.6).toFixed(2)} ${b.desc.toFixed(2)} L ${hook.toFixed(2)} ${(-top).toFixed(2)} L ${(hook + b.w + s * 0.1).toFixed(2)} ${(-top).toFixed(2)}`;
        return { w: hook + b.w + s * 0.15, asc: top + rule, desc: b.desc + rule, draw: [{ k: 'path', d, w: rule }, ...shift(b.draw, hook + s * 0.05, 0)] };
      }
      case 'nary': {
        const big = s * 1.5;
        const opW = font.width(n.op, big, false);
        const sup = n.sup ? go(n.sup, small(s)) : undefined; const sub = n.sub ? go(n.sub, small(s)) : undefined;
        const w = Math.max(opW, sup?.w ?? 0, sub?.w ?? 0) + s * 0.2;
        const asc = big * 0.8; const desc = big * 0.24;
        const draw: MathDraw[] = [{ k: 'text', x: (w - opW) / 2, y: s * 0.2, text: n.op, size: big, italic: false }];
        if (sup) draw.push(...shift(sup.draw, (w - sup.w) / 2, -asc - sup.desc + s * 0.1));
        if (sub) draw.push(...shift(sub.draw, (w - sub.w) / 2, desc + sub.asc + s * 0.1));
        return { w, asc: asc + (sup ? sup.asc + sup.desc : 0), desc: desc + (sub ? sub.asc + sub.desc + s * 0.1 : 0), draw };
      }
      case 'fence': {
        const b = go(n.body, s);
        const h = b.asc + b.desc;
        const tall = h > s * 1.4;
        const fw = tall ? s * 0.32 : font.width(n.open, s, false);
        if (!tall) {
          const open = n.open === '{' ? '{' : n.open; const close = n.close;
          return { w: fw * 2 + b.w, asc: b.asc, desc: b.desc, draw: [{ k: 'text', x: 0, y: 0, text: open, size: s, italic: false }, ...shift(b.draw, fw, 0), { k: 'text', x: fw + b.w, y: 0, text: close, size: s, italic: false }] };
        }
        const t = -b.asc; const e = b.desc; const m = (t + e) / 2;
        const curve = (x0: number, x1: number) => (n.open === '|' ? `M ${x1.toFixed(2)} ${t.toFixed(2)} L ${x1.toFixed(2)} ${e.toFixed(2)}` : n.open === '[' ? `M ${x0.toFixed(2)} ${t.toFixed(2)} L ${x1.toFixed(2)} ${t.toFixed(2)} L ${x1.toFixed(2)} ${e.toFixed(2)} L ${x0.toFixed(2)} ${e.toFixed(2)}` : `M ${x0.toFixed(2)} ${t.toFixed(2)} Q ${x1.toFixed(2)} ${m.toFixed(2)} ${x0.toFixed(2)} ${e.toFixed(2)}`);
        return { w: fw * 2 + b.w, asc: b.asc, desc: b.desc, draw: [{ k: 'path', d: curve(fw * 0.8, fw * 0.1), w: rule }, ...shift(b.draw, fw, 0), { k: 'path', d: curve(fw + b.w + fw * 0.2, fw + b.w + fw * 0.9), w: rule }] };
      }
    }
  };
  return go(node, size);
};

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const toOmml = (n: MathNode): string => {
  const x = (m: MathNode | undefined): string => (m ? one(m) : '');
  const one = (m: MathNode): string => {
    switch (m.t) {
      case 'text': return `<m:r>${m.plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t xml:space="preserve">${esc(m.text)}</m:t></m:r>`;
      case 'seq': return m.items.map(one).join('');
      case 'frac': return `<m:f><m:num>${one(m.num)}</m:num><m:den>${one(m.den)}</m:den></m:f>`;
      case 'script': {
        if (m.sub && m.sup) return `<m:sSubSup><m:e>${one(m.base)}</m:e><m:sub>${one(m.sub)}</m:sub><m:sup>${one(m.sup)}</m:sup></m:sSubSup>`;
        if (m.sup) return `<m:sSup><m:e>${one(m.base)}</m:e><m:sup>${one(m.sup)}</m:sup></m:sSup>`;
        return `<m:sSub><m:e>${one(m.base)}</m:e><m:sub>${x(m.sub)}</m:sub></m:sSub>`;
      }
      case 'root': return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${one(m.body)}</m:e></m:rad>`;
      case 'nary': return `<m:nary><m:naryPr><m:chr m:val="${m.op}"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>${x(m.sub)}</m:sub><m:sup>${x(m.sup)}</m:sup><m:e/></m:nary>`;
      case 'fence': return `<m:d><m:dPr><m:begChr m:val="${esc(m.open)}"/><m:endChr m:val="${esc(m.close)}"/></m:dPr><m:e>${one(m.body)}</m:e></m:d>`;
    }
  };
  return `<m:oMath>${one(n)}</m:oMath>`;
};
