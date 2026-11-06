import type { FontMetrics, FontSpec, Measurer } from './types';

import { cssFamily, lookalikeOf } from '../core/fonts';

export { cssFamily };

const fontCss = (f: FontSpec): string => `${f.italic ? 'italic ' : ''}${f.bold ? '700 ' : ''}${f.size}px ${cssFamily(f.family)}`;

export const fontSubstitute = (name: string): string | undefined => lookalikeOf(name);

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
