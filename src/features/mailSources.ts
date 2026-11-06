import { strFromU8, unzipSync } from 'fflate';
import { kid, kids, parseXml, textOf, type XNode } from '../docx/xml';
import { decodeText } from '../formats/text';
import type { MailData } from './mailReview';

const table = (rows: string[][]): MailData => {
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  const columns = (clean.shift() ?? []).map((c, i) => c.trim() || `Column ${i + 1}`);
  return { columns, rows: clean.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) };
};

const colIndex = (ref: string): number => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? 'A') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

const readXlsx = (bytes: Uint8Array): MailData => {
  const files = unzipSync(bytes);
  const text = (p: string) => (files[p] ? strFromU8(files[p]!) : '');
  const shared = kids(parseXml(text('xl/sharedStrings.xml') || '<sst/>'), 'si').map((si) => textOf(si));
  const rels = kids(parseXml(text('xl/_rels/workbook.xml.rels') || '<Relationships/>'));
  const first = kids(kid(parseXml(text('xl/workbook.xml')), 'sheets'), 'sheet')[0];
  const rid = first?.attrs['r:id'];
  const target = rels.find((r) => r.attrs['Id'] === rid)?.attrs['Target'] ?? 'worksheets/sheet1.xml';
  const sheet = parseXml(text(`xl/${target.replace(/^\/?xl\//, '')}`));
  const out: string[][] = [];
  for (const row of kids(kid(sheet, 'sheetData'), 'row')) {
    const cells: string[] = [];
    for (const c of kids(row, 'c')) {
      const t = c.attrs['t'];
      const v = textOf(kid(c, 'v'));
      cells[colIndex(c.attrs['r'] ?? 'A1')] = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? textOf(kid(c, 'is')) : v;
    }
    out.push(Array.from(cells, (x) => x ?? ''));
  }
  return table(out);
};

const readOds = (bytes: Uint8Array): MailData => {
  const files = unzipSync(bytes);
  const doc = parseXml(strFromU8(files['content.xml']!));
  const find = (n: XNode, name: string): XNode | undefined => { for (const c of kids(n)) { if (c.name === name) return c; const f = find(c, name); if (f) return f; } return undefined; };
  const t = find(doc, 'table:table');
  const out: string[][] = [];
  for (const row of kids(t, 'table:table-row')) {
    const cells: string[] = [];
    for (const c of kids(row).filter((x) => x.name === 'table:table-cell' || x.name === 'table:covered-table-cell')) {
      const n = Math.min(Number(c.attrs['table:number-columns-repeated'] ?? 1), 50);
      for (let i = 0; i < n; i++) cells.push(kids(c, 'text:p').map(textOf).join('\n'));
    }
    out.push(cells);
    if (out.length > 100000) break;
  }
  return table(out);
};

const readDelimited = (text: string, sep: string): MailData => {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return table(rows);
};

const readVcf = (text: string): MailData => {
  const cards = text.replace(/\r\n[ \t]/g, '').split(/BEGIN:VCARD/i).slice(1);
  const columns = ['Name', 'First name', 'Last name', 'Organization', 'Title', 'Email', 'Phone', 'Street', 'City', 'Region', 'Postal code', 'Country'];
  const rows = cards.map((c) => {
    const get = (k: string) => new RegExp(`^${k}[;:][^\\n]*`, 'im').exec(c)?.[0].replace(/^[^:]*:/, '').trim() ?? '';
    const [last = '', first = ''] = get('N').split(';');
    const adr = get('ADR').split(';');
    return { Name: get('FN'), 'First name': first, 'Last name': last, Organization: get('ORG').replace(/;/g, ' '), Title: get('TITLE'), Email: get('EMAIL'), Phone: get('TEL'), Street: adr[2] ?? '', City: adr[3] ?? '', Region: adr[4] ?? '', 'Postal code': adr[5] ?? '', Country: adr[6] ?? '' };
  });
  return { columns, rows };
};

const readJson = (text: string): MailData => {
  const v = JSON.parse(text) as unknown;
  const list = Array.isArray(v) ? v : Array.isArray((v as { rows?: unknown }).rows) ? (v as { rows: unknown[] }).rows : [];
  const objects = list.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
  const columns = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  return { columns, rows: objects.map((o) => Object.fromEntries(columns.map((c) => [c, o[c] == null ? '' : String(o[c])]))) };
};

export const MAIL_TYPES = '.csv,.tsv,.txt,.xlsx,.ods,.json,.vcf,text/csv';

export const readMailSource = (bytes: Uint8Array, name: string): MailData => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xlsx' || ext === 'xlsm') return readXlsx(bytes);
  if (ext === 'ods') return readOds(bytes);
  const text = decodeText(bytes).replace(/^﻿/, '');
  if (ext === 'json') return readJson(text);
  if (ext === 'vcf' || /^BEGIN:VCARD/i.test(text)) return readVcf(text);
  const head = text.slice(0, 2000);
  const sep = ext === 'tsv' || (head.split('\t').length > head.split(',').length) ? '\t' : head.split(';').length > head.split(',').length ? ';' : ',';
  return readDelimited(text, sep);
};
