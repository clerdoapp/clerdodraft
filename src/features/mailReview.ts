import { selectedParas, updatePara } from '../core/tree';
import { MAIL_TYPES, readMailSource } from './mailSources';
import { ATOM_CHAR, newId, para, type Block, type Doc, type Paragraph, type Revision } from '../core/model';
import { paraText } from '../core/tree';
import { readDocx, writeDocx } from '../docx';
import { register } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { download } from './files';
import { pickFile } from './coreCommands';

export interface MailData {
  columns: string[];
  rows: Record<string, string>[];
}

// One merge source per open window; the fields themselves are saved in the document.
export const mail: { data: MailData | null; preview: number | null; rule: MailRule | null } = { data: null, preview: null, rule: null };

export interface MailRule { column: string; op: 'is' | 'not' | 'has' | 'more' | 'less'; value: string }

export const passes = (row: Record<string, string>, r: MailRule | null): boolean => {
  if (!r?.column) return true;
  const v = (row[r.column] ?? '').trim();
  const w = r.value.trim();
  switch (r.op) {
    case 'is': return v.toLowerCase() === w.toLowerCase();
    case 'not': return v.toLowerCase() !== w.toLowerCase();
    case 'has': return v.toLowerCase().includes(w.toLowerCase());
    case 'more': return Number(v) > Number(w);
    case 'less': return Number(v) < Number(w);
  }
};

export const recipients = (): Record<string, string>[] => (mail.data?.rows ?? []).filter((r) => passes(r, mail.rule));

export const parseCsv = (text: string): MailData => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x)) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x)) rows.push(row); }
  const columns = (rows.shift() ?? []).map((c) => c.trim());
  return { columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) };
};

export const mergeField = (name: string): string => /MERGEFIELD\s+"?([^"\s]+)"?/i.exec(name)?.[1] ?? '';

const fillBlocks = (blocks: Block[], row: Record<string, string>): Block[] =>
  blocks.map((b) => {
    if (b.type === 'p') return { ...b, id: newId(), runs: b.runs.map((r) => (r.atom?.kind === 'field' && r.atom.field === 'merge' ? { text: row[mergeField(r.atom.instr)] ?? '', props: r.props } : r)).filter((r) => r.text) };
    if (b.type === 'tbl') return { ...b, id: newId(), rows: b.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, blocks: fillBlocks(c.blocks, row) })) })) };
    return b;
  });

export const mergeDocument = (doc: Doc, data: MailData, rows = data.rows): Doc => {
  const blocks: Block[] = [];
  rows.forEach((row, i) => {
    const part = fillBlocks(doc.blocks, row);
    blocks.push(...part);
    if (i < rows.length - 1) blocks.push(para([{ text: '\f', props: {} }]));
  });
  return { ...doc, blocks };
};

const diffLines = (a: string[], b: string[]): { op: 'same' | 'del' | 'ins'; ai?: number; bi?: number }[] => {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: { op: 'same' | 'del' | 'ins'; ai?: number; bi?: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: 'same', ai: i, bi: j }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ op: 'del', ai: i++ });
    else out.push({ op: 'ins', bi: j++ });
  }
  while (i < n) out.push({ op: 'del', ai: i++ });
  while (j < m) out.push({ op: 'ins', bi: j++ });
  return out;
};

const wordDiff = (oldP: Paragraph, newP: Paragraph, rev: Revision): Paragraph => {
  const tok = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const a = tok(paraText(oldP));
  const b = tok(paraText(newP));
  const ops = diffLines(a, b);
  const runs = ops.map((o) => (o.op === 'same' ? { text: a[o.ai!]!, props: {} } : o.op === 'del' ? { text: a[o.ai!]!, props: {}, del: rev } : { text: b[o.bi!]!, props: {}, ins: rev }));
  return { ...newP, id: newId(), runs };
};

// Compares paragraph text and shows the differences as tracked changes in the current document.
export const compareWith = (doc: Doc, other: Doc, author: string): Doc => {
  const rev: Revision = { id: newId(), author, date: new Date().toISOString() };
  const ours = doc.blocks.filter((b): b is Paragraph => b.type === 'p');
  const theirs = other.blocks.filter((b): b is Paragraph => b.type === 'p');
  const ops = diffLines(ours.map(paraText), theirs.map(paraText));
  const out: Block[] = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k]!;
    const next = ops[k + 1];
    if (o.op === 'same') out.push(ours[o.ai!]!);
    else if (o.op === 'del' && next?.op === 'ins') { out.push(wordDiff(ours[o.ai!]!, theirs[next.bi!]!, rev)); k++; }
    else if (o.op === 'del') out.push({ ...ours[o.ai!]!, runs: ours[o.ai!]!.runs.map((r) => ({ ...r, del: rev })) });
    else out.push({ ...theirs[o.bi!]!, id: newId(), runs: theirs[o.bi!]!.runs.map((r) => ({ ...r, ins: rev })) });
  }
  return { ...doc, blocks: out.length ? out : doc.blocks };
};

const ENVELOPE = { w: 684, h: 297 };

export const makeEnvelope = (s: EditorStore, to: string, from: string): void => {
  const lines = (t: string, x: number) => t.split('\n').map((l) => para([{ text: l, props: {} }], { spaceAfter: 0, indentLeft: x }));
  const blocks: Block[] = [...lines(from, 0), para([], { spaceAfter: 72 }), ...lines(to, 250)];
  s.load({ ...s.doc, blocks, preserved: undefined, section: { ...s.doc.section, pageWidth: ENVELOPE.w, pageHeight: ENVELOPE.h, landscape: true, marginTop: 28, marginBottom: 28, marginLeft: 28, marginRight: 28, headers: {}, footers: {} } }, { name: 'Envelope' });
};

export const makeLabels = (s: EditorStore, text: string, across: number, down: number): void => {
  const sec = s.doc.section;
  const width = sec.pageWidth - sec.marginLeft - sec.marginRight;
  const h = (sec.pageHeight - sec.marginTop - sec.marginBottom) / down;
  const cell = () => ({ id: newId(), props: { width: width / across }, blocks: text.split('\n').map((l) => para([{ text: l, props: {} }], { spaceAfter: 0 })) });
  const t: Block = {
    type: 'tbl', id: newId(), props: { width: { value: width, unit: 'pt' }, fixedLayout: true }, grid: Array.from({ length: across }, () => width / across),
    rows: Array.from({ length: down }, () => ({ id: newId(), props: { height: h - 1, heightRule: 'exact' as const }, cells: Array.from({ length: across }, cell) })),
  };
  s.load({ ...s.doc, blocks: [t, para()], preserved: undefined }, { name: 'Labels' });
};

export const registerMailReview = (): void => {
  register(
    { id: 'mail.source', label: 'Choose a recipient list', group: 'Mail', run: (s) => pickFile(MAIL_TYPES, (f) => void f.arrayBuffer().then((b) => { try { mail.data = readMailSource(new Uint8Array(b), f.name); } catch { s.notify("This list couldn't be read."); return; } s.notify(`${mail.data.rows.length} recipients, ${mail.data.columns.length} fields.`); s.setView({ pane: 'mail' }); })) },
    { id: 'mail.pane', label: 'Mail merge', group: 'Mail', run: (s) => s.togglePane('mail'), active: (s) => s.view.pane === 'mail' },
    { id: 'mail.envelope', label: 'Envelope', group: 'Mail', run: (s) => s.openDialog('envelope') },
    { id: 'mail.labels', label: 'Labels', group: 'Mail', run: (s) => s.openDialog('labels') },
    {
      id: 'mail.merge', label: 'Finish merge as a new file', group: 'Mail',
      enabled: () => recipients().length > 0,
      run: (s) => download(writeDocx(mergeDocument(s.doc, mail.data!, recipients())) as BlobPart, `${s.file.name} merged.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    },
    {
      id: 'rev.compare', label: 'Compare with another document', group: 'Review',
      run: (s) => pickFile('.docx', (f) => void f.arrayBuffer().then((b) => {
        try { s.commit(compareWith(s.doc, readDocx(new Uint8Array(b)), s.author)); s.setView({ pane: 'changes' }); } catch (e) { s.notify(e instanceof Error ? e.message : "That file couldn't be read."); }
      })),
    },
    { id: 'rev.allowEdit', label: 'Allow changes here when read-only', group: 'Review', run: (s) => { const ids = new Set(selectedParas(s.doc, s.sel).map((p) => p.id)); const on = !selectedParas(s.doc, s.sel).every((p) => p.editable); let d = s.doc; for (const id of ids) d = updatePara(d, s.sel.focus.story, id, (q) => ({ ...q, editable: on || undefined })); s.commit(d); }, active: (s) => selectedParas(s.doc, s.sel).every((p) => p.editable) },
    { id: 'rev.protect', label: 'Read-only mode', group: 'Review', run: (s) => s.commit({ ...s.doc, settings: { ...s.doc.settings, protection: s.doc.settings.protection ? undefined : { kind: 'readOnly' } } }), active: (s) => !!s.doc.settings.protection },
    {
      id: 'rev.a11y', label: 'Accessibility check', group: 'Review',
      run: (s) => s.openDialog('a11y'),
    },
    {
      id: 'rev.dictate', label: 'Dictate', group: 'Review',
      run: (s) => {
        const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
        const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
        if (!C) { s.notify('Dictation is not available in this browser.'); return; }
        const r = new C();
        r.onresult = (e) => s.typeText(`${e.results[0][0].transcript} `);
        r.onerror = () => s.notify('Dictation stopped.');
        r.start();
        s.notify('Listening…');
      },
    },
  );
  void ATOM_CHAR;
};

interface SR {
  onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
  onerror: () => void;
  start(): void;
}
