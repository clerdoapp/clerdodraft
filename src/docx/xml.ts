export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: (XNode | string)[];
}

export const NS: Record<string, string> = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  wpc: 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
  wp14: 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  v: 'urn:schemas-microsoft-com:vml',
  o: 'urn:schemas-microsoft-com:office:office',
  w10: 'urn:schemas-microsoft-com:office:word',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  dgm: 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  b: 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography',
  dsp: 'http://schemas.microsoft.com/office/drawing/2008/diagram',
};

const CANON = new Map(Object.entries(NS).map(([p, u]) => [u, p]));
// Strict-conformance documents use these namespaces for the same vocabulary.
CANON.set('http://purl.oclc.org/ooxml/wordprocessingml/main', 'w');
CANON.set('http://purl.oclc.org/ooxml/officeDocument/relationships', 'r');
CANON.set('http://purl.oclc.org/ooxml/drawingml/main', 'a');
CANON.set('http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing', 'wp');

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const unescapeXml = (s: string): string =>
  s.includes('&')
    ? s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
        if (e[0] === '#') {
          const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
        }
        return ENT[e] ?? m;
      })
    : s;

export const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

const NAME_END = /[\s/>]/;

export const parseXml = (src: string): XNode => {
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const root: XNode = { name: '#root', attrs: {}, children: [] };
  const stack: { node: XNode; ns: Map<string, string> }[] = [{ node: root, ns: new Map() }];
  const n = src.length;
  while (i < n) {
    const top = stack[stack.length - 1]!;
    if (src[i] !== '<') {
      const j = src.indexOf('<', i);
      const end = j < 0 ? n : j;
      const text = src.slice(i, end);
      if (stack.length > 1) top.node.children.push(unescapeXml(text));
      i = end;
      continue;
    }
    if (src.startsWith('<?', i)) { const j = src.indexOf('?>', i); if (j < 0) throw new Error('Broken XML'); i = j + 2; continue; }
    if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i); if (j < 0) throw new Error('Broken XML'); i = j + 3; continue; }
    if (src.startsWith('<![CDATA[', i)) {
      const j = src.indexOf(']]>', i);
      if (j < 0) throw new Error('Broken XML');
      top.node.children.push(src.slice(i + 9, j));
      i = j + 3;
      continue;
    }
    if (src.startsWith('<!', i)) throw new Error('Document type declarations are not allowed');
    if (src[i + 1] === '/') {
      const j = src.indexOf('>', i);
      if (j < 0 || stack.length < 2) throw new Error('Broken XML');
      stack.pop();
      i = j + 1;
      continue;
    }
    let j = i + 1;
    while (j < n && !NAME_END.test(src[j]!)) j++;
    const raw = src.slice(i + 1, j);
    const attrs: [string, string][] = [];
    for (;;) {
      while (j < n && /\s/.test(src[j]!)) j++;
      if (j >= n) throw new Error('Broken XML');
      if (src[j] === '>' || src[j] === '/') break;
      const a = j;
      while (j < n && src[j] !== '=' && !/\s/.test(src[j]!)) j++;
      const key = src.slice(a, j);
      while (j < n && src[j] !== '"' && src[j] !== "'") j++;
      const q = src[j]!;
      const e = src.indexOf(q, j + 1);
      if (e < 0) throw new Error('Broken XML');
      attrs.push([key, unescapeXml(src.slice(j + 1, e))]);
      j = e + 1;
    }
    let ns = top.ns;
    for (const [k, v] of attrs) {
      if (k === 'xmlns' || k.startsWith('xmlns:')) {
        if (ns === top.ns) ns = new Map(ns);
        ns.set(k === 'xmlns' ? '' : k.slice(6), v);
      }
    }
    const canon = (q: string, isAttr: boolean): string => {
      const c = q.indexOf(':');
      if (c < 0) {
        if (isAttr) return q;
        const u = ns.get('');
        const p = u ? CANON.get(u) : undefined;
        return p ? `${p}:${q}` : q;
      }
      const prefix = q.slice(0, c);
      const u = ns.get(prefix);
      const p = u ? CANON.get(u) : undefined;
      return p ? `${p}:${q.slice(c + 1)}` : q;
    };
    const node: XNode = { name: canon(raw, false), attrs: {}, children: [] };
    for (const [k, v] of attrs) {
      if (k === 'xmlns') { if (!CANON.has(v)) node.attrs[k] = v; }
      else if (k.startsWith('xmlns:')) { if (!CANON.has(v)) node.attrs[k] = v; }
      else node.attrs[canon(k, true)] = v;
    }
    top.node.children.push(node);
    if (src[j] === '/') i = j + 2;
    else {
      stack.push({ node, ns });
      i = j + 1;
    }
  }
  if (stack.length > 1) throw new Error('Broken XML');
  const el = root.children.find((c): c is XNode => typeof c !== 'string');
  if (!el) throw new Error('Empty XML');
  return el;
};

export const kids = (n: XNode | undefined, name?: string): XNode[] =>
  n ? (n.children.filter((c): c is XNode => typeof c !== 'string' && (!name || c.name === name))) : [];

export const kid = (n: XNode | undefined, name: string): XNode | undefined => {
  if (n) for (const c of n.children) if (typeof c !== 'string' && c.name === name) return c;
  return undefined;
};

export const find = (n: XNode | undefined, name: string): XNode | undefined => {
  if (!n) return undefined;
  for (const c of kids(n)) {
    if (c.name === name) return c;
    const f = find(c, name);
    if (f) return f;
  }
  return undefined;
};

export const textOf = (n: XNode | undefined): string =>
  n ? n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('') : '';

export const serialize = (n: XNode): string => {
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  if (!n.children.length) return `<${n.name}${attrs}/>`;
  return `<${n.name}${attrs}>${n.children.map((c) => (typeof c === 'string' ? escapeText(c) : serialize(c))).join('')}</${n.name}>`;
};
