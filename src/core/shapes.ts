// Shape outlines drawn from their width and height. Names follow the preset names used in .docx files.
type P = [number, number];
const f = (n: number): string => (Math.round(n * 100) / 100).toString();
const poly = (pts: P[]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
const open = (pts: P[]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`;
const ell = (cx: number, cy: number, rx: number, ry: number): string => `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 1 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 1 ${f(cx - rx)} ${f(cy)}Z`;
const rect = (x: number, y: number, w: number, h: number): string => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
const ngon = (w: number, h: number, n: number, rot = -Math.PI / 2): string => poly(Array.from({ length: n }, (_, i) => { const a = rot + (i * 2 * Math.PI) / n; return [w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2] as P; }));
const star = (w: number, h: number, n: number, inner: number): string => poly(Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n; const k = i % 2 ? inner : 1; return [w / 2 + (Math.cos(a) * k * w) / 2, h / 2 + (Math.sin(a) * k * h) / 2] as P; }));
const round = (x: number, y: number, w: number, h: number, r: [number, number, number, number]): string => {
  const [a, b, c, d] = r;
  return `M${f(x + a)} ${f(y)}H${f(x + w - b)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + b)}V${f(y + h - c)}Q${f(x + w)} ${f(y + h)} ${f(x + w - c)} ${f(y + h)}H${f(x + d)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - d)}V${f(y + a)}Q${f(x)} ${f(y)} ${f(x + a)} ${f(y)}Z`;
};
const arrowR = (w: number, h: number, head = 0.4, shaft = 0.5): P[] => [[0, h * (0.5 - shaft / 2)], [w * (1 - head), h * (0.5 - shaft / 2)], [w * (1 - head), 0], [w, h / 2], [w * (1 - head), h], [w * (1 - head), h * (0.5 + shaft / 2)], [0, h * (0.5 + shaft / 2)]];
const flip = (pts: P[], w: number, h: number, fx: boolean, fy: boolean): P[] => pts.map(([x, y]) => [fx ? w - x : x, fy ? h - y : y]);
const turn = (pts: P[], w: number, h: number): P[] => pts.map(([x, y]) => [(y / h) * w, (x / w) * h]);
const wavy = (w: number, y: number, amp: number, dir: 1 | -1, waves = 1): string => {
  let s = '';
  const seg = w / (waves * 2);
  for (let i = 0; i < waves * 2; i++) { const x0 = dir > 0 ? i * seg : w - i * seg; const x1 = dir > 0 ? x0 + seg : x0 - seg; s += `Q${f((x0 + x1) / 2)} ${f(y + (i % 2 ? amp : -amp) * dir)} ${f(x1)} ${f(y)}`; }
  return s;
};
const cloud = (w: number, h: number): string => {
  const bumps: [number, number, number][] = [[0.22, 0.32, 0.2], [0.45, 0.2, 0.24], [0.72, 0.28, 0.22], [0.86, 0.55, 0.16], [0.68, 0.78, 0.2], [0.4, 0.8, 0.22], [0.16, 0.62, 0.18]];
  return bumps.map(([x, y, r]) => ell(x * w, y * h, r * w, r * h * 1.1)).join('');
};
const heart = (w: number, h: number): string => `M${f(w / 2)} ${f(h * 0.25)}C${f(w * 0.5)} ${f(-h * 0.05)} ${f(-w * 0.15)} ${f(h * 0.05)} ${f(w * 0.05)} ${f(h * 0.4)}C${f(w * 0.15)} ${f(h * 0.62)} ${f(w * 0.4)} ${f(h * 0.8)} ${f(w / 2)} ${f(h)}C${f(w * 0.6)} ${f(h * 0.8)} ${f(w * 0.85)} ${f(h * 0.62)} ${f(w * 0.95)} ${f(h * 0.4)}C${f(w * 1.15)} ${f(h * 0.05)} ${f(w * 0.5)} ${f(-h * 0.05)} ${f(w / 2)} ${f(h * 0.25)}Z`;
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, move = true): string => {
  const p = (a: number): P => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  const [x0, y0] = p(a0); const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `${move ? 'M' : 'L'}${f(x0)} ${f(y0)}A${f(rx)} ${f(ry)} 0 ${large} ${a1 > a0 ? 1 : 0} ${f(x1)} ${f(y1)}`;
};

const PATHS: Record<string, (w: number, h: number) => string> = {
  // Lines
  line: (w, h) => `M0 0L${f(w)} ${f(h)}`,
  straightConnector1: (w, h) => `M0 0L${f(w)} ${f(h)}`,
  bentConnector3: (w, h) => open([[0, 0], [w / 2, 0], [w / 2, h], [w, h]]),
  curvedConnector3: (w, h) => `M0 0C${f(w / 2)} 0 ${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`,
  // Rectangles
  rect: (w, h) => rect(0, 0, w, h),
  roundRect: (w, h) => { const r = Math.min(w, h) * 0.16; return round(0, 0, w, h, [r, r, r, r]); },
  round1Rect: (w, h) => { const r = Math.min(w, h) * 0.16; return round(0, 0, w, h, [0, r, 0, 0]); },
  round2SameRect: (w, h) => { const r = Math.min(w, h) * 0.16; return round(0, 0, w, h, [r, r, 0, 0]); },
  round2DiagRect: (w, h) => { const r = Math.min(w, h) * 0.16; return round(0, 0, w, h, [r, 0, r, 0]); },
  snip1Rect: (w, h) => { const s = Math.min(w, h) * 0.16; return poly([[0, 0], [w - s, 0], [w, s], [w, h], [0, h]]); },
  snip2SameRect: (w, h) => { const s = Math.min(w, h) * 0.16; return poly([[s, 0], [w - s, 0], [w, s], [w, h], [0, h], [0, s]]); },
  snip2DiagRect: (w, h) => { const s = Math.min(w, h) * 0.16; return poly([[0, 0], [w - s, 0], [w, s], [w, h], [s, h], [0, h - s]]); },
  snipRoundRect: (w, h) => { const s = Math.min(w, h) * 0.16; return `M${f(s)} 0H${f(w - s)}L${f(w)} ${f(s)}V${f(h)}H0V${f(s)}Q0 0 ${f(s)} 0Z`; },
  // Basic shapes
  ellipse: (w, h) => ell(w / 2, h / 2, w / 2, h / 2),
  triangle: (w, h) => poly([[w / 2, 0], [w, h], [0, h]]),
  rtTriangle: (w, h) => poly([[0, 0], [w, h], [0, h]]),
  parallelogram: (w, h) => poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]),
  trapezoid: (w, h) => poly([[w * 0.25, 0], [w * 0.75, 0], [w, h], [0, h]]),
  diamond: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
  pentagon: (w, h) => ngon(w, h, 5),
  hexagon: (w, h) => poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]),
  heptagon: (w, h) => ngon(w, h, 7),
  octagon: (w, h) => poly([[w * 0.29, 0], [w * 0.71, 0], [w, h * 0.29], [w, h * 0.71], [w * 0.71, h], [w * 0.29, h], [0, h * 0.71], [0, h * 0.29]]),
  decagon: (w, h) => ngon(w, h, 10, 0),
  dodecagon: (w, h) => ngon(w, h, 12, Math.PI / 12),
  pie: (w, h) => `M${f(w / 2)} ${f(h / 2)}${arc(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 1.5, false)}Z`,
  chord: (w, h) => `${arc(w / 2, h / 2, w / 2, h / 2, Math.PI * 0.25, Math.PI * 1.75)}Z`,
  teardrop: (w, h) => `M${f(w / 2)} 0H${f(w)}V${f(h / 2)}A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(w / 2)} 0Z`,
  frame: (w, h) => { const t = Math.min(w, h) * 0.12; return `${rect(0, 0, w, h)}${rect(t, t, w - t * 2, h - t * 2)}`; },
  halfFrame: (w, h) => { const t = Math.min(w, h) * 0.2; return poly([[0, 0], [w, 0], [w - t, t], [t, t], [t, h - t], [0, h]]); },
  corner: (w, h) => { const t = Math.min(w, h) * 0.3; return poly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]]); },
  diagStripe: (w, h) => poly([[0, h * 0.5], [w * 0.5, 0], [w, 0], [0, h]]),
  plus: (w, h) => poly([[w * 0.3, 0], [w * 0.7, 0], [w * 0.7, h * 0.3], [w, h * 0.3], [w, h * 0.7], [w * 0.7, h * 0.7], [w * 0.7, h], [w * 0.3, h], [w * 0.3, h * 0.7], [0, h * 0.7], [0, h * 0.3], [w * 0.3, h * 0.3]]),
  plaque: (w, h) => { const r = Math.min(w, h) * 0.16; return `M${f(r)} 0H${f(w - r)}Q${f(w - r)} ${f(r)} ${f(w)} ${f(r)}V${f(h - r)}Q${f(w - r)} ${f(h - r)} ${f(w - r)} ${f(h)}H${f(r)}Q${f(r)} ${f(h - r)} 0 ${f(h - r)}V${f(r)}Q${f(r)} ${f(r)} ${f(r)} 0Z`; },
  can: (w, h) => { const e = h * 0.12; return `M0 ${f(e)}A${f(w / 2)} ${f(e)} 0 0 1 ${f(w)} ${f(e)}V${f(h - e)}A${f(w / 2)} ${f(e)} 0 0 1 0 ${f(h - e)}Z${ell(w / 2, e, w / 2, e)}`; },
  cube: (w, h) => { const d = Math.min(w, h) * 0.25; return `${poly([[0, d], [w - d, d], [w - d, h], [0, h]])}${poly([[0, d], [d, 0], [w, 0], [w - d, d]])}${poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]])}`; },
  bevel: (w, h) => { const d = Math.min(w, h) * 0.12; return `${rect(0, 0, w, h)}${rect(d, d, w - d * 2, h - d * 2)}`; },
  donut: (w, h) => { const t = Math.min(w, h) * 0.25; return `${ell(w / 2, h / 2, w / 2, h / 2)}${ell(w / 2, h / 2, w / 2 - t, h / 2 - t)}`; },
  noSmoking: (w, h) => { const t = Math.min(w, h) * 0.18; return `${ell(w / 2, h / 2, w / 2, h / 2)}${ell(w / 2, h / 2, w / 2 - t, h / 2 - t)}${poly([[w * 0.22, h * 0.3], [w * 0.3, h * 0.22], [w * 0.78, h * 0.7], [w * 0.7, h * 0.78]])}`; },
  blockArc: (w, h) => `${arc(w / 2, h / 2, w / 2, h / 2, Math.PI, Math.PI * 2)}L${f(w * 0.75)} ${f(h / 2)}${arc(w / 2, h / 2, w / 4, h / 4, Math.PI * 2, Math.PI, false)}Z`,
  foldedCorner: (w, h) => { const d = Math.min(w, h) * 0.2; return `${poly([[0, 0], [w, 0], [w, h - d], [w - d, h], [0, h]])}${poly([[w - d, h], [w - d * 0.8, h - d * 0.8], [w, h - d]])}`; },
  smileyFace: (w, h) => `${ell(w / 2, h / 2, w / 2, h / 2)}${ell(w * 0.33, h * 0.38, w * 0.06, h * 0.06)}${ell(w * 0.67, h * 0.38, w * 0.06, h * 0.06)}M${f(w * 0.28)} ${f(h * 0.65)}Q${f(w / 2)} ${f(h * 0.85)} ${f(w * 0.72)} ${f(h * 0.65)}`,
  heart,
  lightningBolt: (w, h) => poly([[w * 0.38, 0], [w * 0.62, h * 0.32], [w * 0.52, h * 0.36], [w * 0.8, h * 0.66], [w * 0.7, h * 0.7], [w, h], [w * 0.4, h * 0.76], [w * 0.5, h * 0.72], [w * 0.15, h * 0.45], [w * 0.28, h * 0.4], [0, h * 0.12]]),
  sun: (w, h) => { let s = ell(w / 2, h / 2, w * 0.25, h * 0.25); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const c = Math.cos(a); const d = Math.sin(a); const n = Math.cos(a + 0.18); const m = Math.sin(a + 0.18); const o = Math.cos(a - 0.18); const q = Math.sin(a - 0.18); s += poly([[w / 2 + c * w * 0.5, h / 2 + d * h * 0.5], [w / 2 + n * w * 0.32, h / 2 + m * h * 0.32], [w / 2 + o * w * 0.32, h / 2 + q * h * 0.32]]); } return s; },
  moon: (w, h) => `M${f(w)} 0A${f(w)} ${f(h / 2)} 0 1 0 ${f(w)} ${f(h)}A${f(w * 0.6)} ${f(h / 2)} 0 1 1 ${f(w)} 0Z`,
  cloud,
  arc: (w, h) => arc(w / 2, h / 2, w / 2, h / 2, -Math.PI / 2, 0),
  bracketPair: (w, h) => { const r = Math.min(w, h) * 0.16; return `M${f(r)} 0Q0 0 0 ${f(r)}V${f(h - r)}Q0 ${f(h)} ${f(r)} ${f(h)}M${f(w - r)} 0Q${f(w)} 0 ${f(w)} ${f(r)}V${f(h - r)}Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)}`; },
  bracePair: (w, h) => { const r = Math.min(w, h) * 0.1; return `M${f(r * 2)} 0Q${f(r)} 0 ${f(r)} ${f(r)}V${f(h / 2 - r)}Q${f(r)} ${f(h / 2)} 0 ${f(h / 2)}Q${f(r)} ${f(h / 2)} ${f(r)} ${f(h / 2 + r)}V${f(h - r)}Q${f(r)} ${f(h)} ${f(r * 2)} ${f(h)}M${f(w - r * 2)} 0Q${f(w - r)} 0 ${f(w - r)} ${f(r)}V${f(h / 2 - r)}Q${f(w - r)} ${f(h / 2)} ${f(w)} ${f(h / 2)}Q${f(w - r)} ${f(h / 2)} ${f(w - r)} ${f(h / 2 + r)}V${f(h - r)}Q${f(w - r)} ${f(h)} ${f(w - r * 2)} ${f(h)}`; },
  leftBracket: (w, h) => `M${f(w)} 0Q0 0 0 ${f(h * 0.1)}V${f(h * 0.9)}Q0 ${f(h)} ${f(w)} ${f(h)}`,
  rightBracket: (w, h) => `M0 0Q${f(w)} 0 ${f(w)} ${f(h * 0.1)}V${f(h * 0.9)}Q${f(w)} ${f(h)} 0 ${f(h)}`,
  leftBrace: (w, h) => `M${f(w)} 0Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)}V${f(h * 0.4)}Q${f(w / 2)} ${f(h / 2)} 0 ${f(h / 2)}Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.6)}V${f(h * 0.9)}Q${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`,
  rightBrace: (w, h) => `M0 0Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)}V${f(h * 0.4)}Q${f(w / 2)} ${f(h / 2)} ${f(w)} ${f(h / 2)}Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.6)}V${f(h * 0.9)}Q${f(w / 2)} ${f(h)} 0 ${f(h)}`,
  // Block arrows
  rightArrow: (w, h) => poly(arrowR(w, h)),
  leftArrow: (w, h) => poly(flip(arrowR(w, h), w, h, true, false)),
  downArrow: (w, h) => poly(turn(arrowR(h, w), w, h)),
  upArrow: (w, h) => poly(flip(turn(arrowR(h, w), w, h), w, h, false, true)),
  leftRightArrow: (w, h) => poly([[0, h / 2], [w * 0.25, 0], [w * 0.25, h * 0.25], [w * 0.75, h * 0.25], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.75, h * 0.75], [w * 0.25, h * 0.75], [w * 0.25, h]]),
  upDownArrow: (w, h) => poly([[w / 2, 0], [w, h * 0.25], [w * 0.75, h * 0.25], [w * 0.75, h * 0.75], [w, h * 0.75], [w / 2, h], [0, h * 0.75], [w * 0.25, h * 0.75], [w * 0.25, h * 0.25], [0, h * 0.25]]),
  quadArrow: (w, h) => { const a = 0.2; const b = 0.4; const c = 0.6; const d = 0.8; return poly([[w / 2, 0], [w * c, h * a], [w * 0.55, h * a], [w * 0.55, h * 0.45], [w * d, h * 0.45], [w * d, h * b], [w, h / 2], [w * d, h * c], [w * d, h * 0.55], [w * 0.55, h * 0.55], [w * 0.55, h * d], [w * c, h * d], [w / 2, h], [w * b, h * d], [w * 0.45, h * d], [w * 0.45, h * 0.55], [w * a, h * 0.55], [w * a, h * c], [0, h / 2], [w * a, h * b], [w * a, h * 0.45], [w * 0.45, h * 0.45], [w * 0.45, h * a], [w * b, h * a]]); },
  leftRightUpArrow: (w, h) => poly([[w / 2, 0], [w * 0.65, h * 0.25], [w * 0.56, h * 0.25], [w * 0.56, h * 0.62], [w * 0.8, h * 0.62], [w * 0.8, h * 0.45], [w, h * 0.72], [w * 0.8, h], [w * 0.8, h * 0.82], [w * 0.2, h * 0.82], [w * 0.2, h], [0, h * 0.72], [w * 0.2, h * 0.45], [w * 0.2, h * 0.62], [w * 0.44, h * 0.62], [w * 0.44, h * 0.25], [w * 0.35, h * 0.25]]),
  bentArrow: (w, h) => `M0 ${f(h)}V${f(h * 0.45)}Q0 ${f(h * 0.2)} ${f(w * 0.3)} ${f(h * 0.2)}H${f(w * 0.7)}V0L${f(w)} ${f(h * 0.3)}L${f(w * 0.7)} ${f(h * 0.6)}V${f(h * 0.4)}H${f(w * 0.35)}Q${f(w * 0.25)} ${f(h * 0.4)} ${f(w * 0.25)} ${f(h * 0.55)}V${f(h)}Z`,
  uturnArrow: (w, h) => `M0 ${f(h)}V${f(h * 0.35)}Q0 0 ${f(w * 0.35)} 0H${f(w * 0.5)}Q${f(w * 0.85)} 0 ${f(w * 0.85)} ${f(h * 0.35)}V${f(h * 0.55)}H${f(w)}L${f(w * 0.72)} ${f(h * 0.85)}L${f(w * 0.45)} ${f(h * 0.55)}H${f(w * 0.6)}V${f(h * 0.35)}Q${f(w * 0.6)} ${f(h * 0.22)} ${f(w * 0.48)} ${f(h * 0.22)}H${f(w * 0.37)}Q${f(w * 0.25)} ${f(h * 0.22)} ${f(w * 0.25)} ${f(h * 0.35)}V${f(h)}Z`,
  leftUpArrow: (w, h) => poly([[0, h * 0.75], [w * 0.25, h / 2], [w * 0.25, h * 0.65], [w * 0.65, h * 0.65], [w * 0.65, h * 0.25], [w / 2, h * 0.25], [w * 0.75, 0], [w, h * 0.25], [w * 0.85, h * 0.25], [w * 0.85, h * 0.85], [w * 0.25, h * 0.85], [w * 0.25, h]]),
  bentUpArrow: (w, h) => poly([[0, h * 0.7], [w * 0.6, h * 0.7], [w * 0.6, h * 0.3], [w * 0.45, h * 0.3], [w * 0.75, 0], [w, h * 0.3], [w * 0.85, h * 0.3], [w * 0.85, h], [0, h]]),
  curvedRightArrow: (w, h) => `M${f(w * 0.75)} 0L${f(w)} ${f(h * 0.2)}L${f(w * 0.75)} ${f(h * 0.4)}V${f(h * 0.3)}Q${f(w * 0.25)} ${f(h * 0.3)} ${f(w * 0.25)} ${f(h)}H0Q0 ${f(h * 0.1)} ${f(w * 0.75)} ${f(h * 0.1)}Z`,
  curvedLeftArrow: (w, h) => `M${f(w * 0.25)} 0L0 ${f(h * 0.2)}L${f(w * 0.25)} ${f(h * 0.4)}V${f(h * 0.3)}Q${f(w * 0.75)} ${f(h * 0.3)} ${f(w * 0.75)} ${f(h)}H${f(w)}Q${f(w)} ${f(h * 0.1)} ${f(w * 0.25)} ${f(h * 0.1)}Z`,
  curvedUpArrow: (w, h) => `M0 ${f(h * 0.25)}L${f(w * 0.2)} 0L${f(w * 0.4)} ${f(h * 0.25)}H${f(w * 0.3)}Q${f(w * 0.3)} ${f(h * 0.75)} ${f(w)} ${f(h * 0.75)}V${f(h)}Q${f(w * 0.1)} ${f(h)} ${f(w * 0.1)} ${f(h * 0.25)}Z`,
  curvedDownArrow: (w, h) => `M0 ${f(h * 0.75)}L${f(w * 0.2)} ${f(h)}L${f(w * 0.4)} ${f(h * 0.75)}H${f(w * 0.3)}Q${f(w * 0.3)} ${f(h * 0.25)} ${f(w)} ${f(h * 0.25)}V0Q${f(w * 0.1)} 0 ${f(w * 0.1)} ${f(h * 0.75)}Z`,
  stripedRightArrow: (w, h) => `${poly([[w * 0.15, h * 0.25], [w * 0.6, h * 0.25], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.75], [w * 0.15, h * 0.75]])}${rect(0, h * 0.25, w * 0.04, h * 0.5)}${rect(w * 0.07, h * 0.25, w * 0.05, h * 0.5)}`,
  notchedRightArrow: (w, h) => poly([[0, h * 0.25], [w * 0.6, h * 0.25], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.75], [0, h * 0.75], [w * 0.12, h / 2]]),
  homePlate: (w, h) => poly([[0, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [0, h]]),
  chevron: (w, h) => poly([[0, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [0, h], [w * 0.25, h / 2]]),
  rightArrowCallout: (w, h) => poly([[0, 0], [w * 0.6, 0], [w * 0.6, h * 0.35], [w * 0.75, h * 0.35], [w * 0.75, h * 0.2], [w, h / 2], [w * 0.75, h * 0.8], [w * 0.75, h * 0.65], [w * 0.6, h * 0.65], [w * 0.6, h], [0, h]]),
  leftArrowCallout: (w, h) => poly(flip([[0, 0], [w * 0.6, 0], [w * 0.6, h * 0.35], [w * 0.75, h * 0.35], [w * 0.75, h * 0.2], [w, h / 2], [w * 0.75, h * 0.8], [w * 0.75, h * 0.65], [w * 0.6, h * 0.65], [w * 0.6, h], [0, h]], w, h, true, false)),
  downArrowCallout: (w, h) => poly([[0, 0], [w, 0], [w, h * 0.6], [w * 0.65, h * 0.6], [w * 0.65, h * 0.75], [w * 0.8, h * 0.75], [w / 2, h], [w * 0.2, h * 0.75], [w * 0.35, h * 0.75], [w * 0.35, h * 0.6], [0, h * 0.6]]),
  upArrowCallout: (w, h) => poly(flip([[0, 0], [w, 0], [w, h * 0.6], [w * 0.65, h * 0.6], [w * 0.65, h * 0.75], [w * 0.8, h * 0.75], [w / 2, h], [w * 0.2, h * 0.75], [w * 0.35, h * 0.75], [w * 0.35, h * 0.6], [0, h * 0.6]], w, h, false, true)),
  leftRightArrowCallout: (w, h) => poly([[0, h / 2], [w * 0.15, h * 0.2], [w * 0.15, h * 0.35], [w * 0.25, h * 0.35], [w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h * 0.35], [w * 0.85, h * 0.35], [w * 0.85, h * 0.2], [w, h / 2], [w * 0.85, h * 0.8], [w * 0.85, h * 0.65], [w * 0.75, h * 0.65], [w * 0.75, h], [w * 0.25, h], [w * 0.25, h * 0.65], [w * 0.15, h * 0.65], [w * 0.15, h * 0.8]]),
  circularArrow: (w, h) => `${arc(w / 2, h / 2, w * 0.45, h * 0.45, Math.PI, Math.PI * 1.85)}L${f(w * 0.98)} ${f(h * 0.42)}L${f(w * 0.78)} ${f(h * 0.48)}L${f(w * 0.82)} ${f(h * 0.4)}${arc(w / 2, h / 2, w * 0.3, h * 0.3, Math.PI * 1.85, Math.PI, false)}Z`,
  // Equation shapes
  mathPlus: (w, h) => PATHS['plus']!(w, h),
  mathMinus: (w, h) => rect(w * 0.1, h * 0.4, w * 0.8, h * 0.2),
  mathMultiply: (w, h) => poly([[w * 0.2, h * 0.1], [w / 2, h * 0.38], [w * 0.8, h * 0.1], [w * 0.9, h * 0.2], [w * 0.62, h / 2], [w * 0.9, h * 0.8], [w * 0.8, h * 0.9], [w / 2, h * 0.62], [w * 0.2, h * 0.9], [w * 0.1, h * 0.8], [w * 0.38, h / 2], [w * 0.1, h * 0.2]]),
  mathDivide: (w, h) => `${rect(w * 0.1, h * 0.43, w * 0.8, h * 0.14)}${ell(w / 2, h * 0.2, w * 0.1, h * 0.1)}${ell(w / 2, h * 0.8, w * 0.1, h * 0.1)}`,
  mathEqual: (w, h) => `${rect(w * 0.1, h * 0.25, w * 0.8, h * 0.18)}${rect(w * 0.1, h * 0.57, w * 0.8, h * 0.18)}`,
  mathNotEqual: (w, h) => `${rect(w * 0.1, h * 0.25, w * 0.8, h * 0.18)}${rect(w * 0.1, h * 0.57, w * 0.8, h * 0.18)}${poly([[w * 0.55, h * 0.05], [w * 0.68, h * 0.1], [w * 0.45, h * 0.95], [w * 0.32, h * 0.9]])}`,
  // Flowchart
  flowChartProcess: (w, h) => rect(0, 0, w, h),
  flowChartAlternateProcess: (w, h) => PATHS['roundRect']!(w, h),
  flowChartDecision: (w, h) => PATHS['diamond']!(w, h),
  flowChartInputOutput: (w, h) => poly([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]]),
  flowChartPredefinedProcess: (w, h) => `${rect(0, 0, w, h)}M${f(w * 0.12)} 0V${f(h)}M${f(w * 0.88)} 0V${f(h)}`,
  flowChartInternalStorage: (w, h) => `${rect(0, 0, w, h)}M${f(w * 0.15)} 0V${f(h)}M0 ${f(h * 0.2)}H${f(w)}`,
  flowChartDocument: (w, h) => `M0 0H${f(w)}V${f(h * 0.8)}Q${f(w * 0.75)} ${f(h * 0.6)} ${f(w / 2)} ${f(h * 0.8)}Q${f(w * 0.25)} ${f(h)} 0 ${f(h * 0.85)}Z`,
  flowChartMultidocument: (w, h) => `${rect(w * 0.1, 0, w * 0.9, h * 0.7)}${rect(w * 0.05, h * 0.06, w * 0.9, h * 0.7)}M0 ${f(h * 0.12)}H${f(w * 0.9)}V${f(h * 0.85)}Q${f(w * 0.68)} ${f(h * 0.7)} ${f(w * 0.45)} ${f(h * 0.85)}Q${f(w * 0.22)} ${f(h)} 0 ${f(h * 0.9)}Z`,
  flowChartTerminator: (w, h) => { const r = h / 2; return `M${f(r)} 0H${f(w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)}H${f(r)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`; },
  flowChartPreparation: (w, h) => poly([[w * 0.2, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [w * 0.2, h], [0, h / 2]]),
  flowChartManualInput: (w, h) => poly([[0, h * 0.2], [w, 0], [w, h], [0, h]]),
  flowChartManualOperation: (w, h) => poly([[0, 0], [w, 0], [w * 0.8, h], [w * 0.2, h]]),
  flowChartConnector: (w, h) => ell(w / 2, h / 2, w / 2, h / 2),
  flowChartOffpageConnector: (w, h) => poly([[0, 0], [w, 0], [w, h * 0.8], [w / 2, h], [0, h * 0.8]]),
  flowChartPunchedCard: (w, h) => poly([[w * 0.2, 0], [w, 0], [w, h], [0, h], [0, h * 0.2]]),
  flowChartPunchedTape: (w, h) => `M0 ${f(h * 0.1)}${wavy(w, h * 0.1, h * 0.1, 1)}V${f(h * 0.9)}${wavy(w, h * 0.9, h * 0.1, -1)}Z`,
  flowChartSummingJunction: (w, h) => `${ell(w / 2, h / 2, w / 2, h / 2)}M${f(w * 0.15)} ${f(h * 0.15)}L${f(w * 0.85)} ${f(h * 0.85)}M${f(w * 0.85)} ${f(h * 0.15)}L${f(w * 0.15)} ${f(h * 0.85)}`,
  flowChartOr: (w, h) => `${ell(w / 2, h / 2, w / 2, h / 2)}M${f(w / 2)} 0V${f(h)}M0 ${f(h / 2)}H${f(w)}`,
  flowChartCollate: (w, h) => poly([[0, 0], [w, 0], [0, h], [w, h]]),
  flowChartSort: (w, h) => `${PATHS['diamond']!(w, h)}M0 ${f(h / 2)}H${f(w)}`,
  flowChartExtract: (w, h) => poly([[w / 2, 0], [w, h], [0, h]]),
  flowChartMerge: (w, h) => poly([[0, 0], [w, 0], [w / 2, h]]),
  flowChartOnlineStorage: (w, h) => `M${f(w * 0.15)} 0H${f(w)}Q${f(w * 0.85)} ${f(h / 2)} ${f(w)} ${f(h)}H${f(w * 0.15)}Q0 ${f(h / 2)} ${f(w * 0.15)} 0Z`,
  flowChartDelay: (w, h) => `M0 0H${f(w / 2)}A${f(w / 2)} ${f(h / 2)} 0 0 1 ${f(w / 2)} ${f(h)}H0Z`,
  flowChartMagneticTape: (w, h) => `${arc(w / 2, h / 2, w / 2, h / 2, Math.PI / 2, Math.PI * 2.5)}H${f(w)}V${f(h)}Z`,
  flowChartMagneticDisk: (w, h) => PATHS['can']!(w, h),
  flowChartMagneticDrum: (w, h) => { const e = w * 0.12; return `M${f(e)} 0H${f(w - e)}A${f(e)} ${f(h / 2)} 0 0 1 ${f(w - e)} ${f(h)}H${f(e)}A${f(e)} ${f(h / 2)} 0 0 1 ${f(e)} 0Z${ell(w - e, h / 2, e, h / 2)}`; },
  flowChartDisplay: (w, h) => `M0 ${f(h / 2)}L${f(w * 0.15)} 0H${f(w * 0.85)}A${f(w * 0.15)} ${f(h / 2)} 0 0 1 ${f(w * 0.85)} ${f(h)}H${f(w * 0.15)}Z`,
  // Stars and banners
  irregularSeal1: (w, h) => poly([[0.3, 0.2], [0.42, 0], [0.5, 0.18], [0.66, 0.06], [0.66, 0.26], [0.92, 0.18], [0.78, 0.38], [1, 0.5], [0.78, 0.6], [0.92, 0.84], [0.64, 0.72], [0.6, 1], [0.46, 0.76], [0.28, 0.94], [0.28, 0.7], [0.04, 0.78], [0.16, 0.56], [0, 0.4], [0.2, 0.34], [0.06, 0.12]].map(([x, y]) => [x! * w, y! * h] as P)),
  irregularSeal2: (w, h) => poly([[0.38, 0.12], [0.5, 0], [0.56, 0.18], [0.78, 0.1], [0.72, 0.3], [1, 0.32], [0.82, 0.48], [0.96, 0.68], [0.72, 0.66], [0.74, 0.92], [0.54, 0.76], [0.4, 1], [0.34, 0.76], [0.1, 0.84], [0.2, 0.6], [0, 0.5], [0.18, 0.38], [0.04, 0.2], [0.28, 0.24]].map(([x, y]) => [x! * w, y! * h] as P)),
  star4: (w, h) => star(w, h, 4, 0.38),
  star5: (w, h) => star(w, h, 5, 0.4),
  star6: (w, h) => star(w, h, 6, 0.58),
  star7: (w, h) => star(w, h, 7, 0.6),
  star8: (w, h) => star(w, h, 8, 0.7),
  star10: (w, h) => star(w, h, 10, 0.75),
  star12: (w, h) => star(w, h, 12, 0.78),
  star16: (w, h) => star(w, h, 16, 0.82),
  star24: (w, h) => star(w, h, 24, 0.85),
  star32: (w, h) => star(w, h, 32, 0.87),
  ribbon2: (w, h) => `${poly([[w * 0.2, 0], [w * 0.8, 0], [w * 0.8, h * 0.75], [w * 0.2, h * 0.75]])}${poly([[0, h * 0.25], [w * 0.2, h * 0.25], [w * 0.2, h * 0.75], [w * 0.3, h], [0, h], [w * 0.1, h * 0.62]])}${poly([[w, h * 0.25], [w * 0.8, h * 0.25], [w * 0.8, h * 0.75], [w * 0.7, h], [w, h], [w * 0.9, h * 0.62]])}`,
  ribbon: (w, h) => `${poly([[w * 0.2, h * 0.25], [w * 0.8, h * 0.25], [w * 0.8, h], [w * 0.2, h]])}${poly([[0, 0], [w * 0.2, 0], [w * 0.2, h * 0.75], [0, h * 0.75], [w * 0.1, h * 0.38]])}${poly([[w, 0], [w * 0.8, 0], [w * 0.8, h * 0.75], [w, h * 0.75], [w * 0.9, h * 0.38]])}`,
  ellipseRibbon2: (w, h) => `M0 ${f(h * 0.3)}Q${f(w / 2)} ${f(-h * 0.1)} ${f(w)} ${f(h * 0.3)}L${f(w * 0.9)} ${f(h * 0.6)}L${f(w)} ${f(h)}Q${f(w / 2)} ${f(h * 0.6)} 0 ${f(h)}L${f(w * 0.1)} ${f(h * 0.6)}Z`,
  ellipseRibbon: (w, h) => `M0 ${f(h * 0.7)}Q${f(w / 2)} ${f(h * 1.1)} ${f(w)} ${f(h * 0.7)}L${f(w * 0.9)} ${f(h * 0.4)}L${f(w)} 0Q${f(w / 2)} ${f(h * 0.4)} 0 0L${f(w * 0.1)} ${f(h * 0.4)}Z`,
  verticalScroll: (w, h) => { const e = Math.min(w, h) * 0.1; return `M${f(e * 2)} ${f(e)}H${f(w)}V${f(h - e)}H${f(e)}V${f(e)}Z${ell(e * 1.5, e, e, e)}${ell(w - e, h - e, e, e)}`; },
  horizontalScroll: (w, h) => { const e = Math.min(w, h) * 0.1; return `M${f(e)} ${f(e * 2)}V${f(h)}H${f(w - e)}V${f(e)}H${f(e)}Z${ell(e, e * 1.5, e, e)}${ell(w - e, h - e, e, e)}`; },
  wave: (w, h) => `M0 ${f(h * 0.15)}${wavy(w, h * 0.15, h * 0.15, 1)}V${f(h * 0.85)}${wavy(w, h * 0.85, h * 0.15, -1)}Z`,
  doubleWave: (w, h) => `M0 ${f(h * 0.15)}${wavy(w, h * 0.15, h * 0.12, 1, 2)}V${f(h * 0.85)}${wavy(w, h * 0.85, h * 0.12, -1, 2)}Z`,
  // Callouts
  wedgeRectCallout: (w, h) => poly([[0, 0], [w, 0], [w, h * 0.75], [w * 0.45, h * 0.75], [w * 0.2, h], [w * 0.28, h * 0.75], [0, h * 0.75]]),
  wedgeRoundRectCallout: (w, h) => { const r = Math.min(w, h) * 0.12; const b = h * 0.75; return `M${f(r)} 0H${f(w - r)}Q${f(w)} 0 ${f(w)} ${f(r)}V${f(b - r)}Q${f(w)} ${f(b)} ${f(w - r)} ${f(b)}H${f(w * 0.45)}L${f(w * 0.2)} ${f(h)}L${f(w * 0.28)} ${f(b)}H${f(r)}Q0 ${f(b)} 0 ${f(b - r)}V${f(r)}Q0 0 ${f(r)} 0Z`; },
  wedgeEllipseCallout: (w, h) => `M${f(w * 0.3)} ${f(h * 0.7)}A${f(w / 2)} ${f(h * 0.37)} 0 1 1 ${f(w * 0.45)} ${f(h * 0.74)}L${f(w * 0.15)} ${f(h)}Z`,
  cloudCallout: (w, h) => `${cloud(w, h * 0.8)}${ell(w * 0.2, h * 0.88, w * 0.05, h * 0.04)}${ell(w * 0.1, h * 0.96, w * 0.03, h * 0.03)}`,
  borderCallout1: (w, h) => `${rect(0, 0, w, h * 0.75)}M${f(w * 0.3)} ${f(h * 0.75)}L${f(w * 0.1)} ${f(h)}`,
  borderCallout2: (w, h) => `${rect(0, 0, w, h * 0.75)}M${f(w * 0.3)} ${f(h * 0.75)}L${f(w * 0.3)} ${f(h * 0.88)}L${f(w * 0.05)} ${f(h)}`,
  accentCallout1: (w, h) => `${rect(w * 0.15, 0, w * 0.85, h * 0.75)}M${f(w * 0.1)} 0V${f(h * 0.75)}M${f(w * 0.1)} ${f(h * 0.4)}L0 ${f(h)}`,
  callout1: (w, h) => `${rect(0, 0, w, h * 0.75)}M${f(w * 0.3)} ${f(h * 0.75)}L${f(w * 0.1)} ${f(h)}`,
  actionButtonBlank: (w, h) => PATHS['bevel']!(w, h),
  chartPlus: (w, h) => `${rect(0, 0, w, h)}M${f(w / 2)} ${f(h * 0.2)}V${f(h * 0.8)}M${f(w * 0.2)} ${f(h / 2)}H${f(w * 0.8)}`,
  gear6: (w, h) => `${star(w, h, 6, 0.78)}${ell(w / 2, h / 2, w * 0.18, h * 0.18)}`,
  gear9: (w, h) => `${star(w, h, 9, 0.82)}${ell(w / 2, h / 2, w * 0.18, h * 0.18)}`,
  funnel: (w, h) => poly([[0, 0], [w, 0], [w * 0.6, h * 0.6], [w * 0.6, h], [w * 0.4, h], [w * 0.4, h * 0.6]]),
};

export const shapePath = (prst: string, w: number, h: number): string => (PATHS[prst] ?? PATHS['rect']!)(w, h);

// Lines and brackets are drawn as outlines only.
export const isOutlineOnly = (prst: string): boolean => /^(line|straightConnector1|bentConnector3|curvedConnector3|arc|bracketPair|bracePair|leftBracket|rightBracket|leftBrace|rightBrace)$/.test(prst);

export const SHAPE_GROUPS: [string, [string, string][]][] = [
  ['Lines', [['line', 'Line'], ['straightConnector1', 'Arrow'], ['bentConnector3', 'Elbow connector'], ['curvedConnector3', 'Curved connector'], ['arc', 'Arc']]],
  ['Rectangles', [['rect', 'Rectangle'], ['roundRect', 'Rounded rectangle'], ['round1Rect', 'One round corner'], ['round2SameRect', 'Round top corners'], ['round2DiagRect', 'Round diagonal corners'], ['snip1Rect', 'One cut corner'], ['snip2SameRect', 'Cut top corners'], ['snip2DiagRect', 'Cut diagonal corners'], ['snipRoundRect', 'Cut and round corners']]],
  ['Basic', [['ellipse', 'Oval'], ['triangle', 'Triangle'], ['rtTriangle', 'Right triangle'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['diamond', 'Diamond'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['heptagon', 'Heptagon'], ['octagon', 'Octagon'], ['decagon', 'Decagon'], ['dodecagon', 'Dodecagon'], ['pie', 'Pie'], ['chord', 'Chord'], ['teardrop', 'Teardrop'], ['frame', 'Frame'], ['halfFrame', 'Half frame'], ['corner', 'L-shape'], ['diagStripe', 'Diagonal stripe'], ['plus', 'Cross'], ['plaque', 'Plaque'], ['can', 'Cylinder'], ['cube', 'Cube'], ['bevel', 'Bevel'], ['donut', 'Ring'], ['noSmoking', 'Not allowed'], ['blockArc', 'Block arc'], ['foldedCorner', 'Folded corner'], ['smileyFace', 'Smiling face'], ['heart', 'Heart'], ['lightningBolt', 'Lightning'], ['sun', 'Sun'], ['moon', 'Moon'], ['cloud', 'Cloud'], ['bracketPair', 'Double bracket'], ['bracePair', 'Double brace'], ['leftBracket', 'Left bracket'], ['rightBracket', 'Right bracket'], ['leftBrace', 'Left brace'], ['rightBrace', 'Right brace'], ['gear6', 'Gear'], ['gear9', 'Gear, nine teeth'], ['funnel', 'Funnel']]],
  ['Block arrows', [['rightArrow', 'Right arrow'], ['leftArrow', 'Left arrow'], ['upArrow', 'Up arrow'], ['downArrow', 'Down arrow'], ['leftRightArrow', 'Left-right arrow'], ['upDownArrow', 'Up-down arrow'], ['quadArrow', 'Four-way arrow'], ['leftRightUpArrow', 'Three-way arrow'], ['bentArrow', 'Bent arrow'], ['uturnArrow', 'U-turn arrow'], ['leftUpArrow', 'Left-up arrow'], ['bentUpArrow', 'Bent-up arrow'], ['curvedRightArrow', 'Curved right arrow'], ['curvedLeftArrow', 'Curved left arrow'], ['curvedUpArrow', 'Curved up arrow'], ['curvedDownArrow', 'Curved down arrow'], ['stripedRightArrow', 'Striped arrow'], ['notchedRightArrow', 'Notched arrow'], ['homePlate', 'Pentagon arrow'], ['chevron', 'Chevron'], ['rightArrowCallout', 'Right arrow callout'], ['leftArrowCallout', 'Left arrow callout'], ['upArrowCallout', 'Up arrow callout'], ['downArrowCallout', 'Down arrow callout'], ['leftRightArrowCallout', 'Left-right arrow callout'], ['circularArrow', 'Circular arrow']]],
  ['Equation', [['mathPlus', 'Plus'], ['mathMinus', 'Minus'], ['mathMultiply', 'Multiply'], ['mathDivide', 'Divide'], ['mathEqual', 'Equal'], ['mathNotEqual', 'Not equal']]],
  ['Flowchart', [['flowChartProcess', 'Process'], ['flowChartAlternateProcess', 'Alternate process'], ['flowChartDecision', 'Decision'], ['flowChartInputOutput', 'Data'], ['flowChartPredefinedProcess', 'Predefined process'], ['flowChartInternalStorage', 'Internal storage'], ['flowChartDocument', 'Document'], ['flowChartMultidocument', 'Multiple documents'], ['flowChartTerminator', 'Start or end'], ['flowChartPreparation', 'Preparation'], ['flowChartManualInput', 'Manual input'], ['flowChartManualOperation', 'Manual operation'], ['flowChartConnector', 'Connector'], ['flowChartOffpageConnector', 'Off-page connector'], ['flowChartPunchedCard', 'Card'], ['flowChartPunchedTape', 'Punched tape'], ['flowChartSummingJunction', 'Summing junction'], ['flowChartOr', 'Or'], ['flowChartCollate', 'Collate'], ['flowChartSort', 'Sort'], ['flowChartExtract', 'Extract'], ['flowChartMerge', 'Merge'], ['flowChartOnlineStorage', 'Stored data'], ['flowChartDelay', 'Delay'], ['flowChartMagneticTape', 'Sequential access storage'], ['flowChartMagneticDisk', 'Magnetic disk'], ['flowChartMagneticDrum', 'Direct access storage'], ['flowChartDisplay', 'Display']]],
  ['Stars and banners', [['irregularSeal1', 'Explosion'], ['irregularSeal2', 'Explosion 2'], ['star4', 'Four-point star'], ['star5', 'Five-point star'], ['star6', 'Six-point star'], ['star7', 'Seven-point star'], ['star8', 'Eight-point star'], ['star10', 'Ten-point star'], ['star12', 'Twelve-point star'], ['star16', 'Sixteen-point star'], ['star24', 'Twenty-four-point star'], ['star32', 'Thirty-two-point star'], ['ribbon2', 'Ribbon up'], ['ribbon', 'Ribbon down'], ['ellipseRibbon2', 'Curved ribbon up'], ['ellipseRibbon', 'Curved ribbon down'], ['verticalScroll', 'Vertical scroll'], ['horizontalScroll', 'Horizontal scroll'], ['wave', 'Wave'], ['doubleWave', 'Double wave']]],
  ['Callouts', [['wedgeRectCallout', 'Speech, rectangle'], ['wedgeRoundRectCallout', 'Speech, rounded'], ['wedgeEllipseCallout', 'Speech, oval'], ['cloudCallout', 'Thought'], ['borderCallout1', 'Line callout'], ['borderCallout2', 'Bent line callout'], ['accentCallout1', 'Accent callout'], ['callout1', 'Plain callout']]],
];

export const SHAPE_COUNT = SHAPE_GROUPS.reduce((n, [, l]) => n + l.length, 0);
