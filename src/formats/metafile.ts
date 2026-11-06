// Draws the older vector picture formats (EMF and WMF) and device-independent bitmaps onto a canvas,
// so pictures saved in those formats show on the page. Only the drawing records documents commonly use are read.

type Ctx = CanvasRenderingContext2D;
type M = [number, number, number, number, number, number];

interface Pen { kind: 'pen'; color: string; width: number; none: boolean; dash?: number[] }
interface Brush { kind: 'brush'; color: string; none: boolean; pattern?: HTMLCanvasElement }
interface Font { kind: 'font'; height: number; weight: number; italic: boolean; underline: boolean; strike: boolean; face: string; angle: number; charset: number }
type Obj = Pen | Brush | Font | { kind: 'other' };

interface State {
  pen: Pen; brush: Brush; font: Font;
  text: string; bkMode: number; bk: string; align: number; evenOdd: boolean;
  mapMode: number;
  winOrg: [number, number]; winExt: [number, number]; vpOrg: [number, number]; vpExt: [number, number];
  world: M;
  cur: [number, number];
}

const BLACK_PEN: Pen = { kind: 'pen', color: '#000', width: 0, none: false };
const WHITE_BRUSH: Brush = { kind: 'brush', color: '#fff', none: false };
const DEFAULT_FONT: Font = { kind: 'font', height: 12, weight: 400, italic: false, underline: false, strike: false, face: 'Arial', angle: 0, charset: 0 };
const ID: M = [1, 0, 0, 1, 0, 0];

const STOCK: Record<number, Obj> = {
  0: { kind: 'brush', color: '#fff', none: false },
  1: { kind: 'brush', color: '#c0c0c0', none: false },
  2: { kind: 'brush', color: '#808080', none: false },
  3: { kind: 'brush', color: '#404040', none: false },
  4: { kind: 'brush', color: '#000', none: false },
  5: { kind: 'brush', color: '#000', none: true },
  6: { kind: 'pen', color: '#fff', width: 0, none: false },
  7: { kind: 'pen', color: '#000', width: 0, none: false },
  8: { kind: 'pen', color: '#000', width: 0, none: true },
};

const rgb = (v: number): string => `rgb(${v & 0xff},${(v >> 8) & 0xff},${(v >> 16) & 0xff})`;
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

const CHARSETS: Record<number, string> = { 128: 'shift_jis', 129: 'euc-kr', 134: 'gbk', 136: 'big5', 161: 'windows-1253', 162: 'windows-1254', 163: 'windows-1258', 177: 'windows-1255', 178: 'windows-1256', 186: 'windows-1257', 204: 'windows-1251', 222: 'windows-874', 238: 'windows-1250' };
const decoder = (charset: number): TextDecoder => { try { return new TextDecoder(CHARSETS[charset] ?? 'windows-1252'); } catch { return new TextDecoder('windows-1252'); } };

const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

// A device-independent bitmap: header, optional color table, then pixel rows.
export const dibToCanvas = (b: Uint8Array, at: number, bitsAt?: number): HTMLCanvasElement | null => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (at + 12 > b.length) return null;
  const size = v.getUint32(at, true);
  let width: number, height: number, bits: number, compression = 0, used = 0;
  if (size === 12) { width = v.getUint16(at + 4, true); height = v.getInt16(at + 6, true); bits = v.getUint16(at + 10, true); }
  else {
    if (at + 40 > b.length) return null;
    width = v.getInt32(at + 4, true); height = v.getInt32(at + 8, true); bits = v.getUint16(at + 14, true);
    compression = v.getUint32(at + 16, true); used = v.getUint32(at + 32, true);
  }
  if (width <= 0 || !height || width > 20000 || Math.abs(height) > 20000) return null;
  const topDown = height < 0;
  height = Math.abs(height);
  const palEntry = size === 12 ? 3 : 4;
  const palCount = bits <= 8 ? used || 1 << bits : 0;
  let pal = at + size;
  let masks: [number, number, number, number] | null = null;
  if (compression === 3 || compression === 6) {
    if (size === 40) { masks = [v.getUint32(pal, true), v.getUint32(pal + 4, true), v.getUint32(pal + 8, true), compression === 6 ? v.getUint32(pal + 12, true) : 0]; pal += compression === 6 ? 16 : 12; }
    else masks = [v.getUint32(at + 40, true), v.getUint32(at + 44, true), v.getUint32(at + 48, true), size >= 56 ? v.getUint32(at + 52, true) : 0];
  }
  const colors: [number, number, number][] = [];
  for (let i = 0; i < palCount; i++) { const p = pal + i * palEntry; colors.push([b[p + 2] ?? 0, b[p + 1] ?? 0, b[p] ?? 0]); }
  let px = bitsAt ?? pal + palCount * palEntry;
  if (compression === 4 || compression === 5) return null;
  const c = makeCanvas(width, height);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  const out = img.data;
  const set = (x: number, y: number, r: number, g: number, bl: number, a = 255) => { const row = topDown ? y : height - 1 - y; if (x >= width || row < 0 || row >= height) return; const o = (row * width + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = a; };
  if (compression === 1 || compression === 2) {
    // Run-length encoded 8-bit or 4-bit pixels, written bottom row first.
    let x = 0; let y = 0;
    const put = (i: number) => { const col = colors[i] ?? [0, 0, 0]; set(x++, y, col[0], col[1], col[2]); };
    while (px + 1 < b.length && y < height) {
      const n = b[px]!; const d = b[px + 1]!; px += 2;
      if (n) { for (let k = 0; k < n; k++) put(compression === 1 ? d : k % 2 ? d & 15 : d >> 4); continue; }
      if (d === 0) { x = 0; y++; } else if (d === 1) break;
      else if (d === 2) { x += b[px]!; y += b[px + 1]!; px += 2; }
      else {
        for (let k = 0; k < d; k++) put(compression === 1 ? b[px + k]! : k % 2 ? b[px + (k >> 1)]! & 15 : b[px + (k >> 1)]! >> 4);
        const used2 = compression === 1 ? d : (d + 1) >> 1;
        px += used2 + (used2 & 1);
      }
    }
  } else {
    const stride = ((width * bits + 31) >> 5) * 4;
    const shift = (m: number) => { let s = 0; while (m && !(m & 1)) { m >>>= 1; s++; } return [s, m] as const; };
    const fields = masks ?? (bits === 16 ? [0x7c00, 0x3e0, 0x1f, 0] : null);
    const parts = fields?.map(shift);
    let anyAlpha = false;
    if (bits === 32 && !masks) for (let y = 0; y < height && !anyAlpha; y++) for (let x = 0; x < width; x++) if (b[px + y * stride + x * 4 + 3]) { anyAlpha = true; break; }
    for (let y = 0; y < height; y++) {
      const row = px + y * stride;
      if (row + stride > b.length + 3) break;
      for (let x = 0; x < width; x++) {
        if (bits === 24) set(x, y, b[row + x * 3 + 2]!, b[row + x * 3 + 1]!, b[row + x * 3]!);
        else if (bits === 32 && !masks) set(x, y, b[row + x * 4 + 2]!, b[row + x * 4 + 1]!, b[row + x * 4]!, anyAlpha ? b[row + x * 4 + 3]! : 255);
        else if ((bits === 16 || bits === 32) && parts) {
          const val = bits === 16 ? v.getUint16(row + x * 2, true) : v.getUint32(row + x * 4, true);
          const ch = parts.map(([s, m]) => (m ? Math.round((((val >>> s) & m) * 255) / m) : -1));
          set(x, y, ch[0]!, ch[1]!, ch[2]!, ch[3]! >= 0 && fields![3] ? ch[3]! : 255);
        } else if (bits <= 8) {
          const bit = x * bits;
          const byte = b[row + (bit >> 3)] ?? 0;
          const i = (byte >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
          const col = colors[i] ?? [0, 0, 0];
          set(x, y, col[0], col[1], col[2]);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

class Gdi {
  s: State;
  stack: State[] = [];
  objs: (Obj | undefined)[] = [];
  inPath = false;
  base: M = ID; // device units to canvas pixels

  constructor(public ctx: Ctx, public pxPerMm = 3.78) {
    this.s = { pen: BLACK_PEN, brush: WHITE_BRUSH, font: DEFAULT_FONT, text: '#000', bkMode: 2, bk: '#fff', align: 0, evenOdd: true, mapMode: 1, winOrg: [0, 0], winExt: [1, 1], vpOrg: [0, 0], vpExt: [1, 1], world: ID, cur: [0, 0] };
  }

  matrix(): M {
    const s = this.s;
    let sx = 1; let sy = 1; let tx = 0; let ty = 0;
    if (s.mapMode === 7 || s.mapMode === 8) {
      sx = s.winExt[0] ? s.vpExt[0] / s.winExt[0] : 1;
      sy = s.winExt[1] ? s.vpExt[1] / s.winExt[1] : 1;
      if (s.mapMode === 7) { const k = Math.min(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx) * k; sy = Math.sign(sy) * k; }
    } else if (s.mapMode >= 2 && s.mapMode <= 6) {
      const mm = [0, 0, 0.1, 0.01, 0.254, 0.0254, 25.4 / 1440][s.mapMode]!;
      sx = mm * this.pxPerMm; sy = -sx;
    }
    tx = s.vpOrg[0] - s.winOrg[0] * sx;
    ty = s.vpOrg[1] - s.winOrg[1] * sy;
    return mul(this.base, mul([sx, 0, 0, sy, tx, ty], s.world));
  }

  apply(): void { const m = this.matrix(); this.ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }
  scale(): number { const m = this.matrix(); return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }

  add(o: Obj, at?: number): void {
    if (at !== undefined) { this.objs[at] = o; return; }
    let i = 0;
    while (this.objs[i]) i++;
    this.objs[i] = o;
  }

  select(i: number): void {
    const idx = i & 0x7fffffff;
    const o = i & 0x80000000 ? STOCK[idx] ?? (idx >= 10 ? DEFAULT_FONT : undefined) : this.objs[i];
    if (!o) return;
    if (o.kind === 'pen') this.s.pen = o;
    else if (o.kind === 'brush') this.s.brush = o;
    else if (o.kind === 'font') this.s.font = o;
  }

  save(): void { this.stack.push({ ...this.s }); }
  restore(n: number): void {
    const k = n < 0 ? -n : this.stack.length - n;
    for (let i = 1; i < k && this.stack.length; i++) this.stack.pop();
    const s = this.stack.pop();
    if (s) this.s = s;
  }

  begin(): void { if (!this.inPath) { this.apply(); this.ctx.beginPath(); } }

  paint(fill: boolean, stroke: boolean): void {
    if (this.inPath) return;
    const { ctx, s } = this;
    if (fill && !s.brush.none) {
      ctx.fillStyle = s.brush.pattern ? ctx.createPattern(s.brush.pattern, 'repeat') ?? s.brush.color : s.brush.color;
      ctx.fill(s.evenOdd ? 'evenodd' : 'nonzero');
    }
    if (stroke && !s.pen.none) {
      ctx.strokeStyle = s.pen.color;
      ctx.lineWidth = s.pen.width > 0 ? s.pen.width : 1 / this.scale();
      ctx.setLineDash((s.pen.dash ?? []).map((d) => d * Math.max(ctx.lineWidth, 1 / this.scale())));
      ctx.stroke();
    }
  }

  moveTo(x: number, y: number): void { this.s.cur = [x, y]; if (this.inPath) this.ctx.moveTo(x, y); }
  lineTo(x: number, y: number): void {
    if (this.inPath) { this.ctx.lineTo(x, y); this.s.cur = [x, y]; return; }
    this.begin(); this.ctx.moveTo(...this.s.cur); this.ctx.lineTo(x, y); this.paint(false, true);
    this.s.cur = [x, y];
  }

  poly(pts: [number, number][][], closed: boolean): void {
    this.begin();
    for (const p of pts) { if (!p.length) continue; this.ctx.moveTo(...p[0]!); for (let i = 1; i < p.length; i++) this.ctx.lineTo(...p[i]!); if (closed) this.ctx.closePath(); }
    this.paint(closed, true);
  }

  polyTo(pts: [number, number][]): void {
    this.begin();
    if (!this.inPath) this.ctx.moveTo(...this.s.cur);
    for (const p of pts) this.ctx.lineTo(...p);
    if (pts.length) this.s.cur = pts[pts.length - 1]!;
    this.paint(false, true);
  }

  bezier(pts: [number, number][], from: boolean): void {
    this.begin();
    let i = 0;
    if (!from) { if (!pts.length) return; this.ctx.moveTo(...pts[0]!); i = 1; } else if (!this.inPath) this.ctx.moveTo(...this.s.cur);
    for (; i + 2 < pts.length; i += 3) this.ctx.bezierCurveTo(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], pts[i + 2]![0], pts[i + 2]![1]);
    if (from && pts.length) this.s.cur = pts[pts.length - 1]!;
    this.paint(false, true);
  }

  rect(l: number, t: number, r: number, b: number, rx = 0, ry = 0): void {
    this.begin();
    if (rx || ry) {
      const w = r - l; const h = b - t;
      const a = Math.min(Math.abs(rx) / 2, Math.abs(w) / 2) * Math.sign(w || 1);
      const c = Math.min(Math.abs(ry) / 2, Math.abs(h) / 2) * Math.sign(h || 1);
      this.ctx.moveTo(l + a, t); this.ctx.lineTo(r - a, t); this.ctx.ellipse(r - a, t + c, Math.abs(a), Math.abs(c), 0, -Math.PI / 2, 0);
      this.ctx.lineTo(r, b - c); this.ctx.ellipse(r - a, b - c, Math.abs(a), Math.abs(c), 0, 0, Math.PI / 2);
      this.ctx.lineTo(l + a, b); this.ctx.ellipse(l + a, b - c, Math.abs(a), Math.abs(c), 0, Math.PI / 2, Math.PI);
      this.ctx.lineTo(l, t + c); this.ctx.ellipse(l + a, t + c, Math.abs(a), Math.abs(c), 0, Math.PI, Math.PI * 1.5);
      this.ctx.closePath();
    } else this.ctx.rect(l, t, r - l, b - t);
    this.paint(true, true);
  }

  ellipse(l: number, t: number, r: number, b: number): void {
    this.begin();
    this.ctx.moveTo(r, (t + b) / 2);
    this.ctx.ellipse((l + r) / 2, (t + b) / 2, Math.abs(r - l) / 2, Math.abs(b - t) / 2, 0, 0, Math.PI * 2);
    this.ctx.closePath();
    this.paint(true, true);
  }

  arc(l: number, t: number, r: number, b: number, sx: number, sy: number, ex: number, ey: number, kind: 'arc' | 'pie' | 'chord'): void {
    const cx = (l + r) / 2; const cy = (t + b) / 2;
    const a0 = Math.atan2(sy - cy, sx - cx); const a1 = Math.atan2(ey - cy, ex - cx);
    this.begin();
    if (kind === 'pie') this.ctx.moveTo(cx, cy);
    // The older formats draw arcs counterclockwise on screen.
    this.ctx.ellipse(cx, cy, Math.abs(r - l) / 2, Math.abs(b - t) / 2, 0, a0, a1, true);
    if (kind !== 'arc') this.ctx.closePath();
    this.paint(kind !== 'arc', true);
  }

  text(x: number, y: number, str: string, dx?: number[]): void {
    const { ctx, s } = this;
    if (!str) return;
    if (s.align & 1) [x, y] = s.cur;
    const m = this.matrix();
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    const sy = Math.hypot(m[2], m[3]) || 1;
    const sx = Math.hypot(m[0], m[1]) || 1;
    const size = Math.max(1, Math.abs(s.font.height) * sy * (s.font.height > 0 ? 0.86 : 1));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, px, py);
    if (s.font.angle) ctx.rotate((-s.font.angle / 10) * (Math.PI / 180));
    ctx.font = `${s.font.italic ? 'italic ' : ''}${s.font.weight >= 600 ? 700 : 400} ${size}px "${s.font.face}", sans-serif`;
    ctx.fillStyle = s.text;
    const h = s.align & 6;
    ctx.textAlign = dx ? 'left' : h === 6 ? 'center' : h === 2 ? 'right' : 'left';
    const v = s.align & 24;
    ctx.textBaseline = v === 24 ? 'alphabetic' : v === 8 ? 'bottom' : 'top';
    if (dx && dx.length >= str.length) {
      let off = 0;
      const total = dx.slice(0, str.length).reduce((a, b2) => a + b2, 0) * sx;
      if (h === 6) off = -total / 2; else if (h === 2) off = -total;
      const chars = [...str];
      let k = 0;
      for (const ch of chars) { ctx.fillText(ch, off, 0); off += (dx[k] ?? 0) * sx; k += ch.length; }
    } else ctx.fillText(str, 0, 0);
    if (s.font.underline || s.font.strike) {
      const w = dx ? dx.slice(0, str.length).reduce((a, b2) => a + b2, 0) * sx : ctx.measureText(str).width;
      const x0 = h === 6 ? -w / 2 : h === 2 ? -w : 0;
      ctx.fillRect(x0, s.font.underline ? size * 0.1 : -size * 0.3, w, Math.max(1, size / 14));
    }
    ctx.restore();
    if (s.align & 1) s.cur = [x + (dx ? dx.reduce((a, b2) => a + b2, 0) : 0), y];
  }

  image(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
    this.apply();
    try {
      this.ctx.save();
      this.ctx.imageSmoothingQuality = 'high';
      this.ctx.drawImage(src, sx, sy, Math.max(1, sw || src.width), Math.max(1, sh || src.height), dx, dy, dw, dh);
      this.ctx.restore();
    } catch { /* bad source rectangle */ }
  }

  fillRect(l: number, t: number, w: number, h: number): void {
    if (this.s.brush.none) return;
    this.apply();
    this.ctx.fillStyle = this.s.brush.color;
    this.ctx.fillRect(l, t, w, h);
  }
}

const penFrom = (style: number, width: number, color: number): Pen => {
  const kind = style & 0xf;
  const dash = kind === 1 ? [6, 3] : kind === 2 ? [1.5, 2] : kind === 3 ? [6, 2, 1.5, 2] : kind === 4 ? [6, 2, 1.5, 2, 1.5, 2] : undefined;
  return { kind: 'pen', color: rgb(color), width, none: kind === 5, dash };
};

const brushFrom = (style: number, color: number): Brush => ({ kind: 'brush', color: rgb(color), none: style === 1 });

// Enhanced metafile (EMF).
const playEmf = (b: Uint8Array): HTMLCanvasElement | null => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0, true) !== 1 || v.getUint32(40, true) !== 0x464d4520) return null;
  const bounds = [v.getInt32(8, true), v.getInt32(12, true), v.getInt32(16, true), v.getInt32(20, true)];
  const frame = [v.getInt32(24, true), v.getInt32(28, true), v.getInt32(32, true), v.getInt32(36, true)];
  const devPx = [v.getInt32(72, true), v.getInt32(76, true)];
  const devMm = [v.getInt32(80, true), v.getInt32(84, true)];
  const pxPerMm = devMm[0]! > 0 ? devPx[0]! / devMm[0]! : 3.78;
  let left = (frame[0]! / 100) * pxPerMm; let top = (frame[1]! / 100) * pxPerMm;
  let w = ((frame[2]! - frame[0]!) / 100) * pxPerMm; let h = ((frame[3]! - frame[1]!) / 100) * pxPerMm;
  if (!(w > 1 && h > 1)) { left = bounds[0]!; top = bounds[1]!; w = bounds[2]! - bounds[0]! + 1; h = bounds[3]! - bounds[1]! + 1; }
  if (!(w > 0 && h > 0)) return null;
  const k = Math.min(4, Math.max(0.25, 1600 / Math.max(w, h)));
  const canvas = makeCanvas(w * k, h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = new Gdi(ctx, pxPerMm);
  g.base = [k, 0, 0, k, -left * k, -top * k];
  const pts = (at: number, n: number, small: boolean): [number, number][] => Array.from({ length: n }, (_, i) => (small ? [v.getInt16(at + i * 4, true), v.getInt16(at + i * 4 + 2, true)] : [v.getInt32(at + i * 8, true), v.getInt32(at + i * 8 + 4, true)]));
  const xform = (at: number): M => [v.getFloat32(at, true), v.getFloat32(at + 4, true), v.getFloat32(at + 8, true), v.getFloat32(at + 12, true), v.getFloat32(at + 16, true), v.getFloat32(at + 20, true)];
  const dib = (r: number, offBmi: number, cbBmi: number, offBits: number): HTMLCanvasElement | null => (cbBmi ? dibToCanvas(b, r + offBmi, r + offBits) : null);
  let at = 0;
  while (at + 8 <= b.length) {
    const type = v.getUint32(at, true);
    const size = v.getUint32(at + 4, true);
    if (size < 8 || at + size > b.length) break;
    const r = at;
    const i32 = (o: number) => v.getInt32(r + o, true);
    const u32 = (o: number) => v.getUint32(r + o, true);
    try {
      switch (type) {
        case 14: at = b.length; continue;
        case 2: case 85: g.bezier(pts(r + 28, u32(24), type === 85), false); break;
        case 5: case 88: g.bezier(pts(r + 28, u32(24), type === 88), true); break;
        case 3: case 86: g.poly([pts(r + 28, u32(24), type === 86)], true); break;
        case 4: case 87: g.poly([pts(r + 28, u32(24), type === 87)], false); break;
        case 6: case 89: g.polyTo(pts(r + 28, u32(24), type === 89)); break;
        case 7: case 8: case 90: case 91: {
          const n = u32(24); const small = type >= 90;
          const counts = Array.from({ length: n }, (_, i) => u32(32 + i * 4));
          let p = r + 32 + n * 4;
          const list = counts.map((c) => { const out = pts(p, c, small); p += c * (small ? 4 : 8); return out; });
          g.poly(list, type === 8 || type === 91);
          break;
        }
        case 9: g.s.winExt = [i32(8), i32(12)]; break;
        case 10: g.s.winOrg = [i32(8), i32(12)]; break;
        case 11: g.s.vpExt = [i32(8), i32(12)]; break;
        case 12: g.s.vpOrg = [i32(8), i32(12)]; break;
        case 17: g.s.mapMode = u32(8); break;
        case 18: g.s.bkMode = u32(8); break;
        case 19: g.s.evenOdd = u32(8) === 1; break;
        case 22: g.s.align = u32(8); break;
        case 24: g.s.text = rgb(u32(8)); break;
        case 25: g.s.bk = rgb(u32(8)); break;
        case 27: g.moveTo(i32(8), i32(12)); break;
        case 33: g.save(); break;
        case 34: g.restore(i32(8)); break;
        case 35: g.s.world = xform(r + 8); break;
        case 36: {
          const m = xform(r + 8); const mode = u32(32);
          g.s.world = mode === 1 ? ID : mode === 2 ? mul(g.s.world, m) : mode === 3 ? mul(m, g.s.world) : m;
          break;
        }
        case 37: g.select(u32(8)); break;
        case 38: g.add(penFrom(u32(12), i32(16), u32(24)), u32(8)); break;
        case 39: g.add(brushFrom(u32(12), u32(16)), u32(8)); break;
        case 94: {
          const pat = dib(r, u32(16), u32(20), u32(24));
          g.add({ kind: 'brush', color: '#808080', none: false, pattern: pat ?? undefined }, u32(8));
          break;
        }
        case 95: {
          const style = u32(28); const bs = u32(36);
          const pen = penFrom(style, (style & 0x10000) ? u32(32) : 0, u32(40));
          if (bs === 1) pen.none = true;
          g.add(pen, u32(8));
          break;
        }
        case 40: g.objs[u32(8)] = undefined; break;
        case 42: g.ellipse(i32(8), i32(12), i32(16), i32(20)); break;
        case 43: g.rect(i32(8), i32(12), i32(16), i32(20)); break;
        case 44: g.rect(i32(8), i32(12), i32(16), i32(20), i32(24), i32(28)); break;
        case 45: case 46: case 47: case 55:
          g.arc(i32(8), i32(12), i32(16), i32(20), i32(24), i32(28), i32(32), i32(36), type === 47 ? 'pie' : type === 46 ? 'chord' : 'arc');
          break;
        case 54: g.lineTo(i32(8), i32(12)); break;
        case 59: g.apply(); ctx.beginPath(); g.inPath = true; break;
        case 60: g.inPath = false; break;
        case 61: if (g.inPath) ctx.closePath(); break;
        case 62: g.inPath = false; g.paint(true, false); break;
        case 63: g.inPath = false; g.paint(true, true); break;
        case 64: g.inPath = false; g.paint(false, true); break;
        case 68: g.inPath = false; ctx.beginPath(); break;
        case 82: {
          const face = new TextDecoder('utf-16le').decode(b.subarray(r + 40, r + 104)).replace(/\0.*$/s, '');
          g.add({ kind: 'font', height: i32(12), weight: i32(28), italic: !!b[r + 32], underline: !!b[r + 33], strike: !!b[r + 34], charset: b[r + 35]!, face: face || 'Arial', angle: i32(20) }, u32(8));
          break;
        }
        case 83: case 84: {
          const n = u32(44); const off = u32(48); const offDx = u32(72);
          const str = type === 84 ? new TextDecoder('utf-16le').decode(b.subarray(r + off, r + off + n * 2)) : decoder(g.s.font.charset).decode(b.subarray(r + off, r + off + n));
          const dx = offDx ? Array.from({ length: n }, (_, i) => i32(offDx + i * 4)) : undefined;
          g.text(i32(36), i32(40), str, dx);
          break;
        }
        case 76: case 77: {
          const dx = i32(24); const dy = i32(28); const dw = i32(32); const dh = i32(36);
          const src = dib(r, u32(84), u32(88), u32(92));
          if (src) g.image(src, i32(44), i32(48), type === 77 ? i32(100) : dw, type === 77 ? i32(104) : dh, dx, dy, dw, dh);
          else if (u32(40) === 0xf00021 || u32(40) === 0x5a0049) g.fillRect(dx, dy, dw, dh);
          break;
        }
        case 81: {
          const src = dib(r, u32(48), u32(52), u32(56));
          if (src) {
            const sy = i32(36); const sh = i32(44);
            // Bitmaps stored bottom row first count source rows from the bottom.
            const top = src.height - sy - sh;
            g.image(src, i32(32), top >= 0 ? top : sy, i32(40), sh, i32(24), i32(28), i32(72), i32(76));
          }
          break;
        }
        case 80: {
          const src = dib(r, u32(48), u32(52), u32(56));
          if (src) g.image(src, i32(32), i32(36), i32(40), i32(44), i32(24), i32(28), i32(40), i32(44));
          break;
        }
        default: break;
      }
    } catch { /* skip a damaged record */ }
    at += size;
  }
  return canvas;
};

// Windows metafile (WMF), with or without the placeable header.
const playWmf = (b: Uint8Array): HTMLCanvasElement | null => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 0;
  let box: [number, number, number, number] | null = null;
  let inch = 1440;
  if (v.getUint32(0, true) === 0x9ac6cdd7) {
    box = [v.getInt16(6, true), v.getInt16(8, true), v.getInt16(10, true), v.getInt16(12, true)];
    inch = v.getUint16(14, true) || 1440;
    at = 22;
  }
  if (at + 18 > b.length) return null;
  const headerWords = v.getUint16(at + 2, true);
  at += headerWords * 2;
  const start = at;
  if (!box) {
    // Without the placeable header, size comes from the window records.
    let org: [number, number] = [0, 0]; let ext: [number, number] | null = null;
    for (let p = start; p + 6 <= b.length;) {
      const words = v.getUint32(p, true); const fn = v.getUint16(p + 4, true);
      if (!words || fn === 0) break;
      if (fn === 0x020b) org = [v.getInt16(p + 8, true), v.getInt16(p + 6, true)];
      if (fn === 0x020c) ext = [v.getInt16(p + 8, true), v.getInt16(p + 6, true)];
      p += words * 2;
    }
    if (!ext) return null;
    box = [org[0], org[1], org[0] + ext[0], org[1] + ext[1]];
    inch = 1440;
  }
  const lw = Math.abs(box[2] - box[0]); const lh = Math.abs(box[3] - box[1]);
  if (!lw || !lh) return null;
  const pxW = (lw / inch) * 96; const pxH = (lh / inch) * 96;
  const k = Math.min(4, Math.max(0.25, 1600 / Math.max(pxW, pxH)));
  const W = pxW * k; const H = pxH * k;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = new Gdi(ctx);
  g.s.mapMode = 8;
  g.s.winOrg = [box[0], box[1]];
  g.s.winExt = [box[2] - box[0], box[3] - box[1]];
  g.s.vpExt = [W, H];
  g.s.evenOdd = true;
  at = start;
  while (at + 6 <= b.length) {
    const words = v.getUint32(at, true);
    const fn = v.getUint16(at + 4, true);
    if (words < 3 || at + words * 2 > b.length) break;
    if (fn === 0) break;
    const p = at + 6;
    const w = (i: number) => v.getInt16(p + i * 2, true);
    const uw = (i: number) => v.getUint16(p + i * 2, true);
    const pts = (from: number, n: number): [number, number][] => Array.from({ length: n }, (_, i) => [v.getInt16(from + i * 4, true), v.getInt16(from + i * 4 + 2, true)]);
    try {
      switch (fn) {
        case 0x020b: g.s.winOrg = [w(1), w(0)]; break;
        case 0x020c: g.s.winExt = [w(1), w(0)]; break;
        case 0x020f: g.s.winOrg = [g.s.winOrg[0] + w(1), g.s.winOrg[1] + w(0)]; break;
        case 0x0102: g.s.bkMode = uw(0); break;
        case 0x0106: g.s.evenOdd = uw(0) === 1; break;
        case 0x0209: g.s.text = rgb(v.getUint32(p, true)); break;
        case 0x0201: g.s.bk = rgb(v.getUint32(p, true)); break;
        case 0x012e: g.s.align = uw(0); break;
        case 0x0214: g.moveTo(w(1), w(0)); break;
        case 0x0213: g.lineTo(w(1), w(0)); break;
        case 0x041b: g.rect(w(3), w(2), w(1), w(0)); break;
        case 0x0418: g.ellipse(w(3), w(2), w(1), w(0)); break;
        case 0x061c: g.rect(w(5), w(4), w(3), w(2), w(1), w(0)); break;
        case 0x0817: case 0x081a: case 0x0830: g.arc(w(7), w(6), w(5), w(4), w(3), w(2), w(1), w(0), fn === 0x081a ? 'pie' : fn === 0x0830 ? 'chord' : 'arc'); break;
        case 0x0324: g.poly([pts(p + 2, uw(0))], true); break;
        case 0x0325: g.poly([pts(p + 2, uw(0))], false); break;
        case 0x0538: {
          const n = uw(0); const counts = Array.from({ length: n }, (_, i) => uw(1 + i));
          let q = p + 2 + n * 2;
          g.poly(counts.map((c) => { const out = pts(q, c); q += c * 4; return out; }), true);
          break;
        }
        case 0x02fa: g.add(penFrom(uw(0), w(1), v.getUint32(p + 6, true))); break;
        case 0x02fc: g.add(brushFrom(uw(0), v.getUint32(p + 2, true))); break;
        case 0x0142: { const pat = dibToCanvas(b, p + 4); g.add({ kind: 'brush', color: '#808080', none: false, pattern: pat ?? undefined }); break; }
        case 0x02fb: {
          const face = new TextDecoder('latin1').decode(b.subarray(p + 18, Math.min(p + 50, at + words * 2))).replace(/\0.*$/s, '');
          g.add({ kind: 'font', height: w(0), weight: w(4), italic: !!b[p + 10], underline: !!b[p + 11], strike: !!b[p + 12], charset: b[p + 13]!, face: face || 'Arial', angle: w(2) });
          break;
        }
        case 0x00f7: case 0x06ff: case 0x01f9: g.add({ kind: 'other' }); break;
        case 0x012d: g.select(uw(0)); break;
        case 0x01f0: g.objs[uw(0)] = undefined; break;
        case 0x001e: g.save(); break;
        case 0x0127: g.restore(w(0)); break;
        case 0x0521: {
          const n = uw(0); const strAt = p + 2;
          const after = strAt + n + (n & 1);
          g.text(v.getInt16(after + 2, true), v.getInt16(after, true), decoder(g.s.font.charset).decode(b.subarray(strAt, strAt + n)));
          break;
        }
        case 0x0a32: {
          const y = w(0); const x = w(1); const n = uw(2); const opts = uw(3);
          let q = p + 8 + (opts & 6 ? 8 : 0);
          const str = decoder(g.s.font.charset).decode(b.subarray(q, q + n));
          q += n + (n & 1);
          const end = at + words * 2;
          const dx = q + n * 2 <= end ? Array.from({ length: n }, (_, i) => v.getInt16(q + i * 2, true)) : undefined;
          g.text(x, y, str, dx && str.length === n ? dx : undefined);
          break;
        }
        case 0x0f43: {
          const src = dibToCanvas(b, p + 22);
          if (src) g.image(src, w(6), Math.max(0, src.height - w(5) - w(3)), w(4) || src.width, w(3) || src.height, w(10), w(9), w(8), w(7));
          break;
        }
        case 0x0b41: {
          const hasDib = words * 2 > 6 + 4 + 16 + 2;
          if (hasDib) {
            const src = dibToCanvas(b, p + 20);
            if (src) g.image(src, w(5), w(4), w(3), w(2), w(9), w(8), w(7), w(6));
          } else g.fillRect(w(10), w(9), w(8), w(7));
          break;
        }
        case 0x0940: {
          const hasDib = words * 2 > 6 + 4 + 12 + 2;
          if (hasDib) {
            const src = dibToCanvas(b, p + 16);
            if (src) g.image(src, w(3), w(2), w(5), w(4), w(7), w(6), w(5), w(4));
          } else g.fillRect(w(8), w(7), w(6), w(5));
          break;
        }
        default: break;
      }
    } catch { /* skip a damaged record */ }
    at += words * 2;
  }
  return canvas;
};

const isEmf = (b: Uint8Array): boolean => b.length > 44 && b[0] === 1 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b[40] === 0x20 && b[41] === 0x45 && b[42] === 0x4d && b[43] === 0x46;
const isWmf = (b: Uint8Array): boolean => b.length > 18 && ((b[0] === 0xd7 && b[1] === 0xcd && b[2] === 0xc6 && b[3] === 0x9a) || ((b[0] === 1 || b[0] === 2) && b[1] === 0 && b[2] === 9 && b[3] === 0));

export const isMetafile = (mime: string, data: Uint8Array): boolean => /emf|wmf|metafile/i.test(mime) || isEmf(data) || isWmf(data);

// Returns a PNG data address for an EMF or WMF picture, or null when it can't be drawn here.
export const metafileToPng = (data: Uint8Array): string | null => {
  if (typeof document === 'undefined') return null;
  try {
    const c = isEmf(data) ? playEmf(data) : isWmf(data) ? playWmf(data) : null;
    return c ? c.toDataURL('image/png') : null;
  } catch {
    return null;
  }
};

export const dataUrlBytes = (url: string): Uint8Array => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
