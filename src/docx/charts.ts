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

export type ChartData = Pick<ChartAtom, 'chart' | 'stacked' | 'title' | 'categories' | 'series'>;

export const parseChart = (x: XNode, theme: Theme): ChartData | null => {
  const chart = kid(x, 'c:chart');
  const plot = kid(chart, 'c:plotArea');
  if (!plot) return null;
  const pick = (...names: string[]) => { for (const n of names) { const f = kid(plot, n); if (f) return f; } return undefined; };
  const bar = pick('c:barChart', 'c:bar3DChart');
  const line = pick('c:lineChart', 'c:line3DChart');
  const area = pick('c:areaChart', 'c:area3DChart');
  const pie = pick('c:pieChart', 'c:pie3DChart');
  const ring = pick('c:doughnutChart');
  const node = bar ?? line ?? area ?? pie ?? ring;
  if (!node) return null;
  const kind: ChartKind = bar ? (kid(bar, 'c:barDir')?.attrs['val'] === 'bar' ? 'bar' : 'column') : line ? 'line' : area ? 'area' : pie ? 'pie' : 'doughnut';
  const sers = kids(node, 'c:ser');
  if (!sers.length) return null;
  let categories: string[] = [];
  const series: ChartSeries[] = sers.map((s, i) => {
    const vals = points(find(kid(s, 'c:val'), 'c:numCache'));
    const cats = points(find(kid(s, 'c:cat'), 'c:strCache') ?? find(kid(s, 'c:cat'), 'c:numCache'));
    const n = Math.max(0, ...vals.keys(), ...cats.keys()) + 1;
    if (!categories.length) categories = Array.from({ length: n }, (_, k) => cats.get(k) ?? String(k + 1));
    return {
      name: textOf(find(kid(s, 'c:tx'), 'c:v')) || `Series ${i + 1}`,
      values: Array.from({ length: categories.length }, (_, k) => Number(vals.get(k) ?? 0) || 0),
      color: drawingColor(kid(kid(s, 'c:spPr'), 'a:solidFill'), theme),
    };
  });
  const grouping = kid(node, 'c:grouping')?.attrs['val'];
  const title = allText(kid(chart, 'c:title'), 'a:t');
  return { chart: kind, stacked: grouping === 'stacked' || grouping === 'percentStacked' || undefined, title: title || undefined, categories, series };
};

const col = (i: number): string => String.fromCharCode(66 + i);

const fill = (c?: string): string => (c ? `<c:spPr><a:solidFill><a:srgbClr val="${c.slice(1).toUpperCase()}"/></a:solidFill></c:spPr>` : '');

const serXml = (a: ChartAtom, s: ChartSeries, i: number): string => {
  const n = a.categories.length;
  const cats = a.categories.map((c, k) => `<c:pt idx="${k}"><c:v>${escapeText(c)}</c:v></c:pt>`).join('');
  const vals = a.categories.map((_, k) => `<c:pt idx="${k}"><c:v>${s.values[k] ?? 0}</c:v></c:pt>`).join('');
  const round = a.chart === 'pie' || a.chart === 'doughnut';
  const marker = a.chart === 'line' ? '<c:marker><c:symbol val="circle"/></c:marker>' : '';
  const invert = a.chart === 'column' || a.chart === 'bar' ? '<c:invertIfNegative val="0"/>' : '';
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>Sheet1!$${col(i)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${escapeText(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${round ? '' : fill(s.color)}${invert}${marker}<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$${col(i)}$2:$${col(i)}$${n + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals}</c:numCache></c:numRef></c:val></c:ser>`;
};

export const chartPart = (a: ChartAtom, dataRel: string): string => {
  const sers = a.series.map((s, i) => serXml(a, s, i)).join('');
  const axes = '<c:axId val="111111111"/><c:axId val="222222222"/>';
  const grouping = a.stacked ? 'stacked' : 'clustered';
  const horizontal = a.chart === 'bar';
  const axisXml = `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  let plot: string;
  switch (a.chart) {
    case 'pie': plot = `<c:pieChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/></c:pieChart>`; break;
    case 'doughnut': plot = `<c:doughnutChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`; break;
    case 'line': plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axes}</c:lineChart>${axisXml}`; break;
    case 'area': plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${axes}</c:areaChart>${axisXml}`; break;
    default: plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="60"/>${a.stacked ? '<c:overlap val="100"/>' : ''}${axes}</c:barChart>${axisXml}`;
  }
  const title = a.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeText(a.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS['c']}" xmlns:a="${NS['a']}" xmlns:r="${NS['r']}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:externalData r:id="${dataRel}"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
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
