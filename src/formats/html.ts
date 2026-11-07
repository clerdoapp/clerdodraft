import type { Block, Doc, ParaProps, Run, RunProps } from '../core/model';
import { para } from '../core/model';
import { DocBuilder, makeTable } from './build';

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'BLOCKQUOTE', 'PRE', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'HR', 'BODY', 'CENTER', 'DL', 'DT', 'DD']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

const dataImage = (src: string): { mime: string; data: Uint8Array } | null => {
  const m = /^data:(image\/(?:png|jpeg|gif));base64,(.+)$/i.exec(src);
  if (!m) return null;
  try { return { mime: m[1]!.toLowerCase(), data: Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0)) }; } catch { return null; }
};

const styled = (el: HTMLElement, p: RunProps): RunProps => {
  const out = { ...p };
  const tag = el.tagName;
  const st = el.style;
  if (tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) out.bold = true;
  if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') out.italic = true;
  if (tag === 'U' || (st.textDecoration ?? '').includes('underline')) out.underline = 'single';
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || (st.textDecoration ?? '').includes('line-through')) out.strike = true;
  if (tag === 'SUP') out.vertAlign = 'super';
  if (tag === 'SUB') out.vertAlign = 'sub';
  if (tag === 'CODE' || tag === 'KBD' || tag === 'TT') out.font = 'Courier New';
  const color = /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : undefined;
  if (color) out.color = color.toLowerCase();
  return out;
};

export const readHtml = (src: string): Doc => {
  const dom = new DOMParser().parseFromString(src, 'text/html');
  const b = new DocBuilder();

  const inlineRuns = (node: Node, props: RunProps, href?: string): Run[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ');
      return text ? [{ text, props, ...(href ? { link: { href } } : {}) }] : [];
    }
    if (!(node instanceof HTMLElement) || SKIP.has(node.tagName)) return [];
    if (node.tagName === 'BR') return [{ text: '\n', props }];
    if (node.tagName === 'IMG') {
      const img = dataImage(node.getAttribute('src') ?? '');
      if (!img) return [{ text: node.getAttribute('alt') ?? '', props }];
      return [b.image({ ...img, width: Number(node.getAttribute('width')) || 300, height: Number(node.getAttribute('height')) || 200, alt: node.getAttribute('alt') ?? '' })];
    }
    const next = styled(node, props);
    const link = node.tagName === 'A' && /^(https?:|mailto:|#)/i.test(node.getAttribute('href') ?? '') ? node.getAttribute('href')! : href;
    const linkProps = link && !href ? { ...next, color: '#2347ff', underline: 'single' as const } : next;
    return [...node.childNodes].flatMap((c) => inlineRuns(c, linkProps, link));
  };

  const trim = (runs: Run[]): Run[] => {
    const out = [...runs];
    const first = out[0];
    if (first && !first.atom) out[0] = { ...first, text: first.text.trimStart() };
    const last = out[out.length - 1];
    if (last && !last.atom) out[out.length - 1] = { ...last, text: last.text.trimEnd() };
    return out.filter((r) => r.text);
  };

  const paraProps = (el: HTMLElement): ParaProps => {
    const p: ParaProps = {};
    const a = el.style.textAlign || el.getAttribute('align');
    if (a === 'center' || a === 'right') p.align = a;
    if (a === 'justify') p.align = 'justify';
    if (el.tagName === 'CENTER') p.align = 'center';
    if (el.getAttribute('dir') === 'rtl') p.bidi = true;
    return p;
  };

  const cellBlocks = (el: HTMLElement): Block[] => {
    const runs = trim([...el.childNodes].flatMap((c) => inlineRuns(c, el.tagName === 'TH' ? { bold: true } : {})));
    return [para(runs)];
  };

  const walk = (el: HTMLElement, props: ParaProps, level: number): void => {
    let pending: Run[] = [];
    const flush = () => {
      const runs = trim(pending);
      pending = [];
      if (runs.length) b.add(runs, props);
    };
    for (const c of el.childNodes) {
      if (!(c instanceof HTMLElement) || !BLOCK.has(c.tagName)) { pending.push(...inlineRuns(c, {})); continue; }
      if (SKIP.has(c.tagName)) continue;
      flush();
      const heading = /^H([1-6])$/.exec(c.tagName);
      if (heading) b.add(trim([...c.childNodes].flatMap((n) => inlineRuns(n, {}))), { ...paraProps(c), style: `Heading${heading[1]}` });
      else if (c.tagName === 'HR') b.add([], { borders: { bottom: { style: 'single', width: 0.75, color: '#999999' } } });
      else if (c.tagName === 'UL' || c.tagName === 'OL') {
        const numId = b.list(c.tagName === 'UL' ? 'bullet' : 'number');
        for (const li of c.children) if (li instanceof HTMLElement) walk(li, { numbering: { numId, level: Math.min(8, level) } }, level + 1);
      } else if (c.tagName === 'TABLE') {
        const rows = [...c.querySelectorAll('tr')].filter((r) => r.closest('table') === c).map((r) => [...r.children].filter((x): x is HTMLElement => x instanceof HTMLElement).map(cellBlocks));
        if (rows.length) b.blocks.push(makeTable(rows));
      } else if (c.tagName === 'PRE') {
        for (const line of (c.textContent ?? '').split('\n')) b.add(line ? [{ text: line, props: { font: 'Courier New', size: 10 } }] : [], { spaceAfter: 0 });
      } else walk(c, { ...props, ...paraProps(c), ...(c.tagName === 'BLOCKQUOTE' ? { indentLeft: 36 } : {}) }, level);
    }
    flush();
  };
  walk(dom.body, {}, 0);
  return b.finish();
};
