import type { FontMetrics, FontSpec, Measurer } from './types';

// Metric-compatible open fonts stand in for common proprietary names. The document keeps the original name.
const SUBSTITUTES: Record<string, string> = {
  calibri: 'Carlito',
  'calibri light': 'Carlito',
  aptos: 'Carlito',
  'aptos display': 'Carlito',
  'aptos narrow': 'Carlito',
  cambria: 'Caladea',
  'cambria math': 'Caladea',
  arial: 'Arimo',
  helvetica: 'Arimo',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'courier new': 'Cousine',
  courier: 'Cousine',
  consolas: 'Cousine',
};

export const cssFamily = (name: string): string => {
  const sub = SUBSTITUTES[name.toLowerCase()];
  const first = sub ? `"${sub}"` : `"${name.replaceAll('"', '')}"`;
  return `${first}, "Noto Naskh Arabic", "Carlito", sans-serif`;
};

const fontCss = (f: FontSpec): string => `${f.italic ? 'italic ' : ''}${f.bold ? '700 ' : ''}${f.size}px ${cssFamily(f.family)}`;

export const fontSubstitute = (name: string): string | undefined => SUBSTITUTES[name.toLowerCase()];

export class CanvasMeasurer implements Measurer {
  private ctx: CanvasRenderingContext2D;
  private widths = new Map<string, number>();
  private metricsCache = new Map<string, FontMetrics>();
  private current = '';

  constructor() {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) throw new Error('Canvas 2D is not available');
    this.ctx = c;
    this.ctx.fontKerning = 'normal';
  }

  invalidate(): void {
    this.widths.clear();
    this.metricsCache.clear();
    this.current = '';
  }

  private set(css: string): void {
    if (this.current !== css) {
      this.ctx.font = css;
      this.current = css;
    }
  }

  width(text: string, font: FontSpec): number {
    const css = fontCss(font);
    const key = `${css}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.set(css);
      w = this.ctx.measureText(text).width;
      if (this.widths.size > 200000) this.widths.clear();
      this.widths.set(key, w);
    }
    return w;
  }

  metrics(font: FontSpec): FontMetrics {
    const css = fontCss(font);
    let m = this.metricsCache.get(css);
    if (!m) {
      this.set(css);
      const t = this.ctx.measureText('Hg');
      m = { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent };
      this.metricsCache.set(css, m);
    }
    return m;
  }
}
