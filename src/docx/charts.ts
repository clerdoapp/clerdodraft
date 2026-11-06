import { strToU8, zipSync } from 'fflate';
import type { ChartAtom, ChartKind, ChartSeries, DiagramShape, Theme } from '../core/model';
import { escapeText, find, kid, kids, NS, textOf, type XNode } from './xml';

const SCHEME: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };

export const drawingColor = (fill: XNode | undefined, theme: Theme): string | undefined => {
  if (!fill) return undefined;
  const rgb = kid(fill, 'a:srgbClr')?.attrs['val'];
  if (rgb) return `#${rgb.toLowerCase()}`;
  const scheme = kid(fill, 'a:schemeClr')?.attrs['val'];
  return scheme ? theme.colors?.[SCHEME[scheme] ?? scheme] : undefined;
};

const points = (n: XNode | undefined): Map<number, string> => {
  const out = new Map<number, string>();
  for (const p of kids(n, 'c:pt')) out.set(Number(p.attrs['idx'] ?? 0), textOf(kid(p, 'c:v')));
  return out;
};

const allText = (n: XNode | undefined, tag: string): string => {
  if (!n) return '';
  return kids(n).map((c) => (c.name === tag ? textOf(c) : allText(c, tag))).join('');
};

export type ChartData = Pick<ChartAtom, 'chart' | 'stacked' | 'percent' | 'markers' | 'smooth' | 'labels' | 'legend' | 'xTitle' | 'yTitle' | 'noGrid' | 'title' | 'categories' | 'series'>;

const OWN = 'urn:clerdo:chart';

export const parseChart = (x: XNode, theme: Theme): ChartData | null => {
  const chart = kid(x, 'c:chart');
  const plot = kid(chart, 'c:plotArea');
  if (!plot) return null;
  const pick = (...names: string[]) => { for (const n of names) { const f = kid(plot, n); if (f) return f; } return undefined; };
  const bar = pick('c:barChart', 'c:bar3DChart');
  const line = pick('c:lineChart', 'c:line3DChart');
  const area = pick('c:areaChart', 'c:area3DChart');
  const pie = pick('c:pieChart', 'c:pie3DChart', 'c:ofPieChart');
  const ring = pick('c:doughnutChart');
  const scatter = pick('c:scatterChart');
  const bubble = pick('c:bubbleChart');
  const radar = pick('c:radarChart');
  const stock = pick('c:stockChart');
  const surface = pick('c:surfaceChart', 'c:surface3DChart');
  const nodes = [bar, line, area, pie, ring, scatter, bubble, radar, stock, surface].filter(Boolean) as XNode[];
  if (!nodes.length) return null;
  let kind: ChartKind = bar ? (kid(bar, 'c:barDir')?.attrs['val'] === 'bar' ? 'bar' : 'column') : line ? 'line' : area ? 'area' : pie ? 'pie' : ring ? 'doughnut' : scatter ? 'scatter' : bubble ? 'bubble' : radar ? (kid(radar, 'c:radarStyle')?.attrs['val'] === 'filled' ? 'radarFilled' : 'radar') : stock ? 'stock' : 'surface';
  if (bar && line) kind = 'combo';
  const sers = nodes.flatMap((n) => kids(n, 'c:ser'));
  if (!sers.length) return null;
  let categories: string[] = [];
  const series: ChartSeries[] = [];
  sers.forEach((s, i) => {
    const vals = points(find(kid(s, 'c:val') ?? kid(s, 'c:yVal'), 'c:numCache'));
    const catNode = kid(s, 'c:cat') ?? kid(s, 'c:xVal');
    const cats = points(find(catNode, 'c:strCache') ?? find(catNode, 'c:numCache'));
    const n = Math.max(0, ...vals.keys(), ...cats.keys()) + 1;
    if (!categories.length) categories = Array.from({ length: n }, (_, k) => cats.get(k) ?? String(k + 1));
    series.push({ name: textOf(find(kid(s, 'c:tx'), 'c:v')) || `Series ${i + 1}`, values: Array.from({ length: categories.length }, (_, k) => Number(vals.get(k) ?? 0) || 0), color: drawingColor(kid(kid(s, 'c:spPr'), 'a:solidFill'), theme) });
    if (bubble) {
      const sizes = points(find(kid(s, 'c:bubbleSize'), 'c:numCache'));
      series.push({ name: 'Size', values: Array.from({ length: categories.length }, (_, k) => Number(sizes.get(k) ?? 1) || 1) });
    }
  });
  const node = nodes[0]!;
  const grouping = kid(node, 'c:grouping')?.attrs['val'];
  const title = allText(kid(chart, 'c:title'), 'a:t');
  const legend = kid(chart, 'c:legend');
  const pos = kid(legend, 'c:legendPos')?.attrs['val'];
  const axTitle = (name: string) => kids(plot, name).map((ax) => allText(kid(ax, 'c:title'), 'a:t')).find(Boolean);
  const out: ChartData = {
    chart: kind, stacked: grouping === 'stacked' || undefined, percent: grouping === 'percentStacked' || undefined, title: title || undefined, categories, series,
    smooth: kids(sers[0], 'c:smooth')[0]?.attrs['val'] === '1' || undefined, labels: kid(find(node, 'c:dLbls'), 'c:showVal')?.attrs['val'] === '1' || undefined,
    legend: !legend ? 'none' : pos === 't' || pos === 'r' || pos === 'l' ? pos : undefined,
    xTitle: axTitle('c:catAx') ?? undefined, yTitle: axTitle('c:valAx') ?? undefined,
  };
  // Kinds drawn here but saved with a simpler fallback carry their own note.
  const own = kids(kid(x, 'c:extLst'), 'c:ext').find((e) => e.attrs['uri'] === OWN);
  const opts = own ? kids(own)[0]?.attrs : undefined;
  if (opts?.['kind']) {
    out.chart = opts['kind'] as ChartKind;
    if (opts['data']) try { const d = JSON.parse(opts['data']) as { categories: string[]; series: ChartSeries[] }; out.categories = d.categories; out.series = d.series; } catch { /* keep what the chart part shows */ }
  }
  if (opts?.['markers'] === '0') out.markers = false;
  if (opts?.['noGrid'] === '1') out.noGrid = true;
  return out;
};

const col = (i: number): string => String.fromCharCode(66 + i);

const fill = (c?: string): string => (c ? `<c:spPr><a:solidFill><a:srgbClr val="${c.slice(1).toUpperCase()}"/></a:solidFill></c:spPr>` : '');
const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const strCache = (ref: string, vals: string[]): string => `<c:strRef><c:f>${ref}</c:f><c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, k) => `<c:pt idx="${k}"><c:v>${escapeText(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`;
const numCache = (ref: string, vals: number[]): string => `<c:numRef><c:f>${ref}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, k) => `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;

// Kinds without a classic equivalent are saved as the closest classic chart.
const FALLBACK: Partial<Record<ChartKind, ChartKind>> = { treemap: 'doughnut', sunburst: 'doughnut', histogram: 'column', boxWhisker: 'column', waterfall: 'column', funnel: 'bar' };

const serXml = (a: ChartAtom, s: ChartSeries, i: number, kind: ChartKind, size?: ChartSeries): string => {
  const n = a.categories.length;
  const tx = `<c:tx>${strCache(`Sheet1!$${col(i)}$1`, [s.name])}</c:tx>`;
  const head = `<c:idx val="${i}"/><c:order val="${i}"/>${tx}`;
  const vals = numCache(`Sheet1!$${col(i)}$2:$${col(i)}$${n + 1}`, a.categories.map((_, k) => s.values[k] ?? 0));
  const cats = strCache(`Sheet1!$A$2:$A$${n + 1}`, a.categories);
  const xs = numCache(`Sheet1!$A$2:$A$${n + 1}`, a.categories.map((c, k) => (Number.isFinite(Number(c)) && c.trim() ? Number(c) : k + 1)));
  const labels = a.labels ? '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>' : '';
  const marker = a.markers === false ? '<c:marker><c:symbol val="none"/></c:marker>' : '<c:marker><c:symbol val="circle"/></c:marker>';
  const smooth = `<c:smooth val="${a.smooth ? 1 : 0}"/>`;
  switch (kind) {
    case 'pie': case 'doughnut': return `<c:ser>${head}${labels}<c:cat>${cats}</c:cat><c:val>${vals}</c:val></c:ser>`;
    case 'line': case 'stock': return `<c:ser>${head}${fill(s.color)}${kind === 'stock' ? '<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>' : marker}${labels}<c:cat>${cats}</c:cat><c:val>${vals}</c:val>${smooth}</c:ser>`;
    case 'scatter': return `<c:ser>${head}${fill(s.color)}${marker}${labels}<c:xVal>${xs}</c:xVal><c:yVal>${vals}</c:yVal>${smooth}</c:ser>`;
    case 'bubble': return `<c:ser>${head}${fill(s.color)}<c:invertIfNegative val="0"/>${labels}<c:xVal>${xs}</c:xVal><c:yVal>${vals}</c:yVal><c:bubbleSize>${numCache(`Sheet1!$${col(i + 1)}$2:$${col(i + 1)}$${n + 1}`, a.categories.map((_, k) => size?.values[k] ?? 1))}</c:bubbleSize><c:bubble3D val="0"/></c:ser>`;
    case 'radar': case 'radarFilled': return `<c:ser>${head}${fill(s.color)}${kind === 'radar' ? marker : ''}${labels}<c:cat>${cats}</c:cat><c:val>${vals}</c:val></c:ser>`;
    case 'surface': return `<c:ser>${head}<c:cat>${cats}</c:cat><c:val>${vals}</c:val></c:ser>`;
    default: return `<c:ser>${head}${fill(s.color)}<c:invertIfNegative val="0"/>${labels}<c:cat>${cats}</c:cat><c:val>${vals}</c:val></c:ser>`;
  }
};

const titleXml = (t: string): string => `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeText(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

const axis = (tag: 'c:catAx' | 'c:valAx' | 'c:serAx', id: string, cross: string, pos: string, grid: boolean, title?: string): string =>
  `<${tag}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${grid ? '<c:majorGridlines/>' : ''}${title ? titleXml(title) : ''}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${tag === 'c:valAx' ? '<c:crossBetween val="between"/>' : tag === 'c:catAx' ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>' : ''}</${tag}>`;

export const chartPart = (a: ChartAtom, dataRel: string): string => {
  const kind: ChartKind = FALLBACK[a.chart] ?? a.chart;
  const A = '111111111'; const B = '222222222'; const C = '333333333';
  const ids = `<c:axId val="${A}"/><c:axId val="${B}"/>`;
  const grid = !a.noGrid;
  const horizontal = kind === 'bar';
  const catVal = axis('c:catAx', A, B, horizontal ? 'l' : 'b', false, a.xTitle) + axis('c:valAx', B, A, horizontal ? 'b' : 'l', grid, a.yTitle);
  const valVal = axis('c:valAx', A, B, 'b', false, a.xTitle) + axis('c:valAx', B, A, 'l', grid, a.yTitle);
  const grouping = a.percent ? 'percentStacked' : a.stacked ? 'stacked' : kind === 'line' || kind === 'area' ? 'standard' : 'clustered';
  const bubble = kind === 'bubble';
  const list = bubble ? [a.series[0]!].filter(Boolean) : a.series;
  const sers = (k: ChartKind, from = 0, to = list.length) => list.slice(from, to).map((s, i) => serXml(a, s, i + from, k, bubble ? a.series[1] : undefined)).join('');
  let plot: string;
  switch (kind) {
    case 'pie': plot = `<c:pieChart><c:varyColors val="1"/>${sers('pie')}<c:firstSliceAng val="0"/></c:pieChart>`; break;
    case 'doughnut': plot = `<c:doughnutChart><c:varyColors val="1"/>${sers('doughnut')}<c:firstSliceAng val="0"/><c:holeSize val="${a.chart === 'sunburst' ? 25 : 58}"/></c:doughnutChart>`; break;
    case 'line': plot = `<c:lineChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers('line')}<c:marker val="1"/>${ids}</c:lineChart>${catVal}`; break;
    case 'area': plot = `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers('area')}${ids}</c:areaChart>${catVal}`; break;
    case 'scatter': plot = `<c:scatterChart><c:scatterStyle val="${a.smooth ? 'smoothMarker' : 'lineMarker'}"/><c:varyColors val="0"/>${sers('scatter')}${ids}</c:scatterChart>${valVal}`; break;
    case 'bubble': plot = `<c:bubbleChart><c:varyColors val="0"/>${sers('bubble')}<c:bubbleScale val="100"/><c:showNegBubbles val="0"/>${ids}</c:bubbleChart>${valVal}`; break;
    case 'radar': case 'radarFilled': plot = `<c:radarChart><c:radarStyle val="${kind === 'radarFilled' ? 'filled' : 'marker'}"/><c:varyColors val="0"/>${sers(kind)}${ids}</c:radarChart>${catVal}`; break;
    case 'stock': plot = `<c:stockChart>${sers('stock', 0, 3)}<c:hiLowLines/>${ids}</c:stockChart>${catVal}`; break;
    case 'surface': plot = `<c:surfaceChart><c:wireframe val="0"/>${sers('surface')}<c:axId val="${A}"/><c:axId val="${B}"/><c:axId val="${C}"/></c:surfaceChart>${axis('c:catAx', A, B, 'b', false)}${axis('c:valAx', B, A, 'l', grid)}${axis('c:serAx', C, B, 'b', false)}`; break;
    case 'combo': {
      const last = Math.max(1, list.length - 1);
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers('column', 0, last)}<c:gapWidth val="60"/>${ids}</c:barChart>${list.length > 1 ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers('line', last)}<c:marker val="1"/>${ids}</c:lineChart>` : ''}${catVal}`;
      break;
    }
    default: plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers(kind)}<c:gapWidth val="60"/>${a.stacked || a.percent ? '<c:overlap val="100"/>' : ''}${ids}</c:barChart>${catVal}`;
  }
  const title = a.title ? `${titleXml(a.title)}<c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legend = a.legend === 'none' ? '' : `<c:legend><c:legendPos val="${a.legend ?? 'b'}"/><c:overlay val="0"/></c:legend>`;
  const own = FALLBACK[a.chart] || a.markers === false || a.noGrid
    ? `<c:extLst><c:ext uri="${OWN}" xmlns:cd="${OWN}"><cd:chart${FALLBACK[a.chart] ? ` kind="${a.chart}" data="${attr(JSON.stringify({ categories: a.categories, series: a.series }))}"` : ''}${a.markers === false ? ' markers="0"' : ''}${a.noGrid ? ' noGrid="1"' : ''}/></c:ext></c:extLst>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS['c']}" xmlns:a="${NS['a']}" xmlns:r="${NS['r']}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:externalData r:id="${dataRel}"><c:autoUpdate val="0"/></c:externalData>${own}</c:chartSpace>`;
};

// A small workbook holding the chart's numbers, so the data stays editable elsewhere.
export const chartWorkbook = (a: ChartAtom): Uint8Array => {
  const str = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeText(v)}</t></is></c>`;
  const head = `<row r="1">${a.series.map((s, i) => str(`${col(i)}1`, s.name)).join('')}</row>`;
  const rows = a.categories.map((c, k) => `<row r="${k + 2}">${str(`A${k + 2}`, c)}${a.series.map((s, i) => `<c r="${col(i)}${k + 2}"><v>${s.values[k] ?? 0}</v></c>`).join('')}</row>`).join('');
  const hd = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return zipSync({
    '[Content_Types].xml': strToU8(`${hd}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`${hd}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS['r']}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`${hd}<workbook xmlns="${main}" xmlns:r="${NS['r']}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${hd}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS['r']}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`${hd}<worksheet xmlns="${main}"><sheetData>${head}${rows}</sheetData></worksheet>`),
  });
};

export const parseDiagram = (x: XNode, theme: Theme): DiagramShape[] => {
  const out: DiagramShape[] = [];
  for (const sp of kids(find(x, 'dsp:spTree'), 'dsp:sp')) {
    const pr = kid(sp, 'dsp:spPr');
    const xf = kid(pr, 'a:xfrm');
    const off = kid(xf, 'a:off');
    const ext = kid(xf, 'a:ext');
    if (!off || !ext) continue;
    const style = kid(sp, 'dsp:style');
    const body = kid(sp, 'dsp:txBody');
    const size = Number(find(body, 'a:rPr')?.attrs['sz'] ?? find(body, 'a:defRPr')?.attrs['sz'] ?? 0);
    out.push({
      x: Number(off.attrs['x'] ?? 0) / 12700, y: Number(off.attrs['y'] ?? 0) / 12700,
      w: Number(ext.attrs['cx'] ?? 0) / 12700, h: Number(ext.attrs['cy'] ?? 0) / 12700,
      prst: kid(pr, 'a:prstGeom')?.attrs['prst'] ?? 'rect',
      fill: drawingColor(kid(pr, 'a:solidFill'), theme) ?? (kid(pr, 'a:noFill') ? undefined : drawingColor(kid(style, 'a:fillRef'), theme)),
      stroke: drawingColor(kid(kid(pr, 'a:ln'), 'a:solidFill'), theme) ?? drawingColor(kid(style, 'a:lnRef'), theme),
      text: kids(body, 'a:p').map((p) => allText(p, 'a:t')).filter(Boolean).join(' ') || undefined,
      color: drawingColor(find(find(body, 'a:rPr'), 'a:solidFill'), theme) ?? drawingColor(kid(style, 'a:fontRef'), theme),
      size: size ? size / 100 : undefined,
    });
  }
  return out;
};

// Grouped drawings hold shapes in their own coordinates, sometimes nested groups inside groups.
export const parseGroup = (group: XNode, theme: Theme): DiagramShape[] => {
  const out: DiagramShape[] = [];
  const num = (n: XNode | undefined, a: string): number => Number(n?.attrs[a] ?? 0);
  const walk = (g: XNode, sx: number, sy: number, dx: number, dy: number) => {
    const xf = kid(kid(g, 'wpg:grpSpPr'), 'a:xfrm');
    const ext = kid(xf, 'a:ext'); const ch = kid(xf, 'a:chExt'); const off = kid(xf, 'a:off'); const co = kid(xf, 'a:chOff');
    const kx = sx * (num(ext, 'cx') / (num(ch, 'cx') || num(ext, 'cx') || 1));
    const ky = sy * (num(ext, 'cy') / (num(ch, 'cy') || num(ext, 'cy') || 1));
    const ox = dx + num(off, 'x') * sx - num(co, 'x') * kx;
    const oy = dy + num(off, 'y') * sy - num(co, 'y') * ky;
    for (const c of kids(g)) {
      if (c.name === 'wpg:grpSp') walk(c, kx, ky, ox, oy);
      if (c.name !== 'wps:wsp') continue;
      const pr = kid(c, 'wps:spPr');
      const x = kid(pr, 'a:xfrm');
      const o = kid(x, 'a:off'); const e = kid(x, 'a:ext');
      if (!o || !e) continue;
      const style = kid(c, 'wps:style');
      const ln = kid(pr, 'a:ln');
      const body = find(c, 'w:txbxContent');
      const size = find(body, 'w:sz')?.attrs['w:val'];
      const color = find(body, 'w:color')?.attrs['w:val'];
      out.push({
        x: (ox + num(o, 'x') * kx) / 12700, y: (oy + num(o, 'y') * ky) / 12700, w: (num(e, 'cx') * kx) / 12700, h: (num(e, 'cy') * ky) / 12700,
        prst: kid(pr, 'a:prstGeom')?.attrs['prst'] ?? 'rect',
        fill: kid(pr, 'a:noFill') ? undefined : drawingColor(kid(pr, 'a:solidFill'), theme) ?? drawingColor(kid(style, 'a:fillRef'), theme),
        stroke: kid(ln, 'a:noFill') ? undefined : drawingColor(kid(ln, 'a:solidFill'), theme) ?? drawingColor(kid(style, 'a:lnRef'), theme),
        text: body ? kids(body, 'w:p').map((p) => allText(p, 'w:t')).filter(Boolean).join(' ') || undefined : undefined,
        color: color && color !== 'auto' ? `#${color}` : '#000000',
        size: size ? Number(size) / 2 : undefined,
      });
    }
  };
  walk(group, 1, 1, 0, 0);
  return out;
};
