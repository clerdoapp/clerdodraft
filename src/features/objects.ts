import { newId, para, textRun, type Block, type Doc, type ImageAtom, type RunProps, type Table, type TableCell } from '../core/model';
import { insertBlocksAfter, setParaProps, updateTable } from '../core/ops';
import { findPara, flatten, paraText, storyBlocks, updatePara, walkParagraphs } from '../core/tree';
import { register } from '../editor/commands';
import { cellOf } from '../editor/interaction';
import type { EditorStore } from '../editor/store';
import { currentPara, ensureList, inTable, pickFile } from './coreCommands';
import { readAny } from './files';
import { insertImageFile, selectedAtom } from './images';
import { formulaResult } from './tableFormula';

export interface SavedBlock { name: string; text: string; blocks?: unknown[] }
const BLOCK_KEY = 'clerdodraft.blocks';
export const savedBlocks = (): SavedBlock[] => { try { return JSON.parse(localStorage.getItem(BLOCK_KEY) ?? '[]') as SavedBlock[]; } catch { return []; } };
export const storeBlocks = (list: SavedBlock[]): void => { try { localStorage.setItem(BLOCK_KEY, JSON.stringify(list)); } catch { /* kept for this session only */ } };

// The desktop app fetches through its own process, so pictures from any site work there.
export const pictureFromWeb = async (s: EditorStore, url: string): Promise<void> => {
  if (!/^https:\/\//i.test(url)) { s.notify('Use a web address that starts with https://'); return; }
  try {
    const bridge = (window as unknown as { clerdo?: { fetchImage?: (u: string) => Promise<{ data: Uint8Array; type: string } | null> } }).clerdo;
    let blob: Blob;
    if (bridge?.fetchImage) {
      const r = await bridge.fetchImage(url);
      if (!r) throw new Error('bad');
      blob = new Blob([r.data as BlobPart], { type: r.type });
    } else {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) throw new Error('bad');
      blob = await r.blob();
    }
    if (!/^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(blob.type)) throw new Error('bad');
    await insertBlob(s, blob, decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'picture'));
  } catch {
    s.notify("That picture couldn't be loaded. Save it to your device and add it from there.");
  }
};

const EMBED: Record<string, [string, string, string]> = {
  xlsx: ['Excel.Sheet.12', 'Spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xlsm: ['Excel.SheetMacroEnabled.12', 'Spreadsheet', 'application/vnd.ms-excel.sheet.macroEnabled.12'],
  docx: ['Word.Document.12', 'Document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  docm: ['Word.DocumentMacroEnabled.12', 'Document', 'application/vnd.ms-word.document.macroEnabled.12'],
  pptx: ['PowerPoint.Show.12', 'Presentation', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  pptm: ['PowerPoint.ShowMacroEnabled.12', 'Presentation', 'application/vnd.ms-powerpoint.presentation.macroEnabled.12'],
};

const fileCard = async (title: string, file: string): Promise<Uint8Array> => {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f6fb'; g.fillRect(0, 0, 384, 256);
  g.strokeStyle = '#c5cbe0'; g.lineWidth = 4; g.strokeRect(2, 2, 380, 252);
  g.fillStyle = '#2347ff'; g.beginPath(); g.moveTo(152, 40); g.lineTo(212, 40); g.lineTo(236, 64); g.lineTo(236, 140); g.lineTo(152, 140); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.font = '700 22px "Carlito", sans-serif'; g.textAlign = 'center'; g.fillText(file.split('.').pop()!.toUpperCase(), 194, 104);
  g.fillStyle = '#1b1c20'; g.font = '600 24px "Carlito", sans-serif'; g.fillText(title, 192, 186);
  g.fillStyle = '#5c6378'; g.font = '20px "Carlito", sans-serif'; g.fillText(file.length > 32 ? `${file.slice(0, 30)}…` : file, 192, 218);
  return new Uint8Array(await (await canvasBlob(c)).arrayBuffer());
};

export const embedFile = async (s: EditorStore, f: File): Promise<void> => {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  const known = EMBED[ext];
  const id = newId();
  const bytes = new Uint8Array(await f.arrayBuffer());
  let data: Uint8Array = bytes;
  let file = `embeddings/Embedded_${id}.${ext}`;
  let kind: [string, string, string] = known ?? ['Package', 'File', 'application/vnd.openxmlformats-officedocument.oleObject'];
  if (!known) {
    // Other files are wrapped in a package object.
    try { data = (await import('../formats/olePackage')).makePackage(f.name, bytes); } catch (e) { s.notify(e instanceof Error ? e.message : "This file couldn't be embedded."); return; }
    file = `embeddings/oleObject_${id}.bin`;
    kind = ['Package', 'File', 'application/vnd.openxmlformats-officedocument.oleObject'];
  }
  const preview = `media/embedded_${id}.png`;
  const media = { ...s.doc.media, [file]: { mime: kind[2], data, name: f.name }, [preview]: { mime: 'image/png', data: await fileCard(kind[1], f.name), name: 'preview.png' } };
  s.doc = { ...s.doc, media };
  s.insertAtom({ kind: 'raw', xml: '', label: kind[1], width: 144, height: 96, object: { name: kind[1], progId: kind[0], file, preview } }, {});
};

const openEmbedded = (s: EditorStore): void => {
  const a = selectedAtom(s);
  if (a?.kind !== 'raw' || !a.object?.file) return;
  const item = s.doc.media[a.object.file];
  if (!item) return;
  const name = item.name ?? a.object.file.split('/').pop() ?? 'embedded';
  void (async () => {
    const files = await import('./files');
    const inner = /\.bin$/i.test(a.object!.file!) ? (await import('../formats/olePackage')).readPackage(item.data) : null;
    if (inner) files.download(inner.data as BlobPart, inner.name, 'application/octet-stream');
    else files.download(item.data as BlobPart, name, item.mime);
  })();
};

export const insertBlob = async (s: EditorStore, blob: Blob, name: string): Promise<void> => insertImageFile(s, new File([blob], name, { type: blob.type }));

const canvasBlob = (c: HTMLCanvasElement): Promise<Blob> => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be made.'))), 'image/png'));

export const canvasToDoc = async (s: EditorStore, c: HTMLCanvasElement, name: string): Promise<void> => insertBlob(s, await canvasBlob(c), name);

const screenshot = async (s: EditorStore): Promise<void> => {
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => requestAnimationFrame(r));
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    await canvasToDoc(s, c, 'screenshot.png');
  } catch (e) {
    if ((e as DOMException).name !== 'NotAllowedError') s.notify('Screen capture is not available here.');
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
};

export const insertVideo = async (s: EditorStore, url: string, title: string): Promise<void> => {
  if (!/^https:\/\//i.test(url)) { s.notify('Use a link that starts with https://'); return; }
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 540;
  const g = c.getContext('2d')!;
  g.fillStyle = '#161a2b';
  g.fillRect(0, 0, 960, 540);
  g.fillStyle = '#2347ff';
  g.beginPath();
  g.arc(480, 240, 72, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(456, 200);
  g.lineTo(456, 280);
  g.lineTo(522, 240);
  g.closePath();
  g.fill();
  g.font = '600 30px "Carlito", sans-serif';
  g.textAlign = 'center';
  g.fillText((title || 'Video').slice(0, 60), 480, 380);
  g.font = '22px "Carlito", sans-serif';
  g.fillStyle = '#aab2d0';
  g.fillText(new URL(url).hostname, 480, 420);
  const data = new Uint8Array(await (await canvasBlob(c)).arrayBuffer());
  const key = `media/${newId()}.png`;
  const atom: ImageAtom = { kind: 'image', media: key, width: 360, height: 202.5, wrap: 'inline', alt: title || 'Video link' };
  s.doc = { ...s.doc, media: { ...s.doc.media, [key]: { mime: 'image/png', data, name: 'video.png' } } };
  s.insertAtom(atom, {});
  const pos = s.sel.focus;
  s.commit(updatePara(s.doc, pos.story, pos.para, (q) => ({ ...q, runs: q.runs.map((r) => (r.atom === atom ? { ...r, link: { href: url } } : r)) })));
};

const followingList = (s: EditorStore, numId: string): string[] => {
  const list = flatten(storyBlocks(s.doc, s.sel.focus.story)).paras;
  const at = list.findIndex((p) => p.id === s.sel.focus.para);
  const out: string[] = [];
  for (let i = at; i < list.length; i++) {
    const n = list[i]!.props.numbering;
    if (n?.numId === numId) out.push(list[i]!.id);
    else if (i > at && list[i]!.runs.length) break;
  }
  return out;
};

export const restartList = (s: EditorStore, start: number): void => {
  const num = currentPara(s).numbering;
  const inst = num ? s.doc.numbering.instances[num.numId] : undefined;
  if (!num || !inst) { s.notify('Click inside a numbered list first.'); return; }
  const id = newId();
  let doc = { ...s.doc, numbering: { ...s.doc.numbering, instances: { ...s.doc.numbering.instances, [id]: { id, abstractId: inst.abstractId, overrides: { [num.level]: { start } } } } } };
  for (const pid of followingList(s, num.numId)) doc = updatePara(doc, s.sel.focus.story, pid, (q) => ({ ...q, props: { ...q.props, numbering: { numId: id, level: q.props.numbering!.level } } }));
  s.commit(doc);
};

export const setBullet = (s: EditorStore, char: string): void => {
  const { doc, numId } = ensureList(s.doc, 'bullet');
  const inst = doc.numbering.instances[numId]!;
  const abs = doc.numbering.abstracts[inst.abstractId]!;
  const levels = abs.levels.map((l, i) => (i === 0 ? { ...l, text: char, runProps: { font: 'Calibri' } } : l));
  s.commit(setParaProps({ ...doc, numbering: { ...doc.numbering, abstracts: { ...doc.numbering.abstracts, [abs.id]: { ...abs, levels } } } }, s.sel, { numbering: { numId, level: 0 } }));
};

export const TEXT_ART: { id: string; name: string; props: RunProps }[] = [
  { id: 'bold', name: 'Bold color', props: { bold: true, color: '#2347ff', shadow: true } },
  { id: 'outline', name: 'Outline', props: { bold: true, outline: true, color: '#c00000' } },
  { id: 'raised', name: 'Raised', props: { bold: true, emboss: true } },
  { id: 'pressed', name: 'Pressed', props: { bold: true, imprint: true } },
  { id: 'glow', name: 'Glow', props: { bold: true, color: '#1f2a44', glow: { color: '#ffd43b', size: 8 } } },
  { id: 'reflect', name: 'Reflection', props: { bold: true, color: '#2347ff', reflect: true } },
  { id: 'sunset', name: 'Sunset gradient', props: { bold: true, gradient: ['#ff6b6b', '#f59f00'] } },
  { id: 'ocean', name: 'Ocean gradient', props: { bold: true, gradient: ['#1c7ed6', '#12b886'] } },
  { id: 'night', name: 'Night gradient', props: { bold: true, gradient: ['#5f3dc4', '#c2255c'] } },
  { id: 'metal', name: 'Metal', props: { bold: true, gradient: ['#dee2e6', '#495057'], lineColor: '#343a40' } },
  { id: 'neon', name: 'Neon', props: { bold: true, color: '#ffffff', glow: { color: '#20c997', size: 10 }, lineColor: '#0ca678' } },
  { id: 'shadowed', name: 'Deep shadow', props: { bold: true, color: '#c92a2a', shadow: true, reflect: true } },
];

export const insertTextArt = (s: EditorStore, text: string, style: string, size: number): void => {
  const art = TEXT_ART.find((a) => a.id === style) ?? TEXT_ART[0]!;
  const p = para([textRun(text, { ...art.props, size })], { align: 'center' });
  s.commit(insertBlocksAfter(s.doc, s.sel.focus.story, s.sel.focus.para, [p]));
};

export const insertFormula = (s: EditorStore, formula: string): void => {
  const f = `=${formula.trim().replace(/^=/, '')}`;
  const cell = cellOf(s);
  const result = cell ? formulaResult(f, cell.table, cell.r, cell.c) : '!Error';
  s.insertAtom({ kind: 'field', field: 'other', instr: ` ${f} `, result });
};

const cellText = (c: TableCell): string => [...walkParagraphs(c.blocks)].map(paraText).join(' ');

const fitColumns = (t: Table): Table => {
  const total = t.grid.reduce((a, b) => a + b, 0);
  const longest = t.grid.map((_, c) => Math.max(4, ...t.rows.map((r) => Math.min(60, cellText(r.cells[c] ?? { id: '', props: {}, blocks: [] }).length))));
  const sum = longest.reduce((a, b) => a + b, 0);
  const grid = longest.map((n) => (n / sum) * total);
  return { ...t, grid, rows: t.rows.map((r) => ({ ...r, cells: r.cells.map((c, i) => ({ ...c, props: { ...c.props, width: grid[i] } })) })) };
};

const evenColumns = (t: Table): Table => {
  const w = t.grid.reduce((a, b) => a + b, 0) / t.grid.length;
  return { ...t, grid: t.grid.map(() => w), rows: t.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, props: { ...c.props, width: w * (c.props.gridSpan ?? 1) } })) })) };
};

const turnCell = (t: Table, row: number, cell: number): Table => ({
  ...t,
  rows: t.rows.map((r, i) => (i !== row ? r : { ...r, cells: r.cells.map((c, k) => {
    if (k !== cell) return c;
    const next = !c.props.textDirection ? 'btLr' : c.props.textDirection === 'btLr' ? 'tbRl' : undefined;
    return { ...c, props: { ...c.props, textDirection: next } };
  }) })),
});

const tableChange = (s: EditorStore, fn: (t: Table, row: number, cell: number) => Table): void => s.commit(updateTable(s.doc, s.sel.focus.story, s.sel.focus.para, fn));

const splitTable = (s: EditorStore): void => {
  const cell = cellOf(s);
  if (!cell || cell.r === 0) { s.notify('Click in a lower row first.'); return; }
  const blocks = s.doc.blocks;
  const at = blocks.indexOf(cell.table);
  if (at < 0) { s.notify('This table is inside another one.'); return; }
  const top: Table = { ...cell.table, rows: cell.table.rows.slice(0, cell.r) };
  const bottom: Table = { ...cell.table, id: newId(), rows: cell.table.rows.slice(cell.r) };
  s.commit({ ...s.doc, blocks: [...blocks.slice(0, at), top, para(), bottom, ...blocks.slice(at + 1)] });
};

// Lists from the other document get new ids so they can't collide with lists here.
const insertFromFile = async (s: EditorStore, f: File): Promise<void> => {
  const incoming = await readAny(new Uint8Array(await f.arrayBuffer()), f.name);
  const map = new Map<string, string>();
  const abstracts = { ...s.doc.numbering.abstracts };
  const instances = { ...s.doc.numbering.instances };
  for (const [id, inst] of Object.entries(incoming.numbering.instances)) {
    const nid = newId();
    const aid = `${nid}a`;
    const abs = incoming.numbering.abstracts[inst.abstractId];
    if (abs) abstracts[aid] = { ...abs, id: aid };
    instances[nid] = { ...inst, id: nid, abstractId: aid };
    map.set(id, nid);
  }
  const fix = (b: Block): Block => {
    if (b.type === 'p') return { ...b, id: newId(), section: undefined, props: b.props.numbering ? { ...b.props, numbering: { ...b.props.numbering, numId: map.get(b.props.numbering.numId) ?? b.props.numbering.numId } } : b.props };
    if (b.type === 'tbl') return { ...b, id: newId(), rows: b.rows.map((r) => ({ ...r, id: newId(), cells: r.cells.map((c) => ({ ...c, id: newId(), blocks: c.blocks.map(fix) })) })) };
    return b;
  };
  const styles = { ...incoming.styles.styles, ...s.doc.styles.styles };
  const doc: Doc = { ...s.doc, media: { ...s.doc.media, ...incoming.media }, numbering: { abstracts, instances }, styles: { ...s.doc.styles, styles } };
  s.commit(insertBlocksAfter(doc, s.sel.focus.story, s.sel.focus.para, incoming.blocks.map(fix)));
};

export const registerObjects = (): void => {
  register(
    { id: 'file.sign', label: 'Signatures', group: 'File', run: (s) => s.togglePane('signatures'), active: (s) => s.view.pane === 'signatures' },
    { id: 'share.together', label: 'Work together', group: 'File', run: (s) => s.togglePane('together'), active: (s) => s.view.pane === 'together' },
    { id: 'share.link', label: 'Share as a link', group: 'File', run: (s) => void import('./share').then((m) => m.shareLink(s)) },
    { id: 'view.uiLang', label: 'العربية / English', group: 'View', run: () => { void import('../ui/i18n').then((m) => m.setUiLang(m.uiLang() === 'ar' ? 'en' : 'ar')); } },
    { id: 'obj.draw', label: 'Draw on this picture', group: 'Insert', enabled: (s) => selectedAtom(s)?.kind === 'image', run: (s) => s.openDialog('draw', { edit: true }) },
    { id: 'ins.object', label: 'Embed a file', group: 'Insert', run: (s) => pickFile('', (f) => void embedFile(s, f)) },
    { id: 'obj.openEmbedded', label: 'Open the embedded file', group: 'Insert', enabled: (s) => { const a = selectedAtom(s); return a?.kind === 'raw' && !!a.object?.file; }, run: openEmbedded },
    { id: 'ins.icons', label: 'Icons', group: 'Insert', run: (s) => s.openDialog('icons') },
    { id: 'ins.webPicture', label: 'Picture from a web address', group: 'Insert', run: (s) => s.openDialog('webPicture') },
    { id: 'ins.diagram', label: 'Diagram', group: 'Insert', run: (s) => s.openDialog('diagram') },
    { id: 'ins.control', label: 'Fill-in field', group: 'Insert', run: (s) => s.openDialog('control') },
    { id: 'ins.blocks', label: 'Saved text', group: 'Insert', run: (s) => s.togglePane('blocks'), active: (s) => s.view.pane === 'blocks' },
    { id: 'ins.file', label: 'Text from a file', group: 'Insert', run: (s) => pickFile('.docx,.odt,.rtf,.md,.html,.txt,.doc', (f) => void insertFromFile(s, f)) },
    { id: 'obj.equation', label: 'Edit equation', group: 'Insert', enabled: (s) => selectedAtom(s)?.kind === 'equation', run: (s) => s.openDialog('equation') },
    { id: 'obj.picture', label: 'Crop and adjust picture', group: 'Insert', enabled: (s) => selectedAtom(s)?.kind === 'image', run: (s) => s.openDialog('pictureFix') },
    { id: 'obj.control', label: 'Change value', group: 'Insert', enabled: (s) => selectedAtom(s)?.kind === 'control', run: (s) => s.openDialog('controlValue') },
    { id: 'tbl.fit', label: 'Fit columns to text', group: 'Table', enabled: inTable, run: (s) => tableChange(s, fitColumns) },
    { id: 'tbl.even', label: 'Even out columns', group: 'Table', enabled: inTable, run: (s) => tableChange(s, evenColumns) },
    { id: 'tbl.dir', label: 'Turn cell text', group: 'Table', enabled: inTable, run: (s) => tableChange(s, turnCell) },
    { id: 'tbl.splitTable', label: 'Split table here', group: 'Table', enabled: inTable, run: splitTable },
    { id: 'view.twoUp', label: 'Pages side by side', group: 'View', run: (s) => s.setView({ twoUp: !s.view.twoUp }), active: (s) => !!s.view.twoUp },
    { id: 'help.keys', label: 'Keyboard shortcuts', group: 'Help', keys: 'f1', run: (s) => s.openDialog('keys') },
    { id: 'ins.draw', label: 'Draw with a pen', group: 'Insert', run: (s) => s.openDialog('draw') },
    { id: 'ins.video', label: 'Online video or audio', group: 'Insert', run: (s) => s.openDialog('video') },
    { id: 'ins.screenshot', label: 'Screenshot', group: 'Insert', enabled: () => !!navigator.mediaDevices?.getDisplayMedia, run: (s) => void screenshot(s) },
    { id: 'ins.textArt', label: 'Text art', group: 'Insert', run: (s) => s.openDialog('textArt') },
    { id: 'par.dropCap', label: 'Large first letter', group: 'Paragraph', run: (s) => s.openDialog('dropCap') },
    { id: 'par.restart', label: 'Restart numbering', group: 'Paragraph', run: (s) => s.openDialog('listStart') },
    { id: 'par.bullet', label: 'Choose a bullet', group: 'Paragraph', run: (s) => s.openDialog('bullet') },
    { id: 'tbl.formula', label: 'Formula', group: 'Table', enabled: inTable, run: (s) => s.openDialog('formula') },
    { id: 'page.facing', label: 'Facing pages', group: 'Page', run: (s) => s.commit({ ...s.doc, settings: { ...s.doc.settings, mirrorMargins: !s.doc.settings.mirrorMargins || undefined } }), active: (s) => !!s.doc.settings.mirrorMargins },
    { id: 'page.vAlign', label: 'Align text on the page', group: 'Page', run: (s) => s.openDialog('pageAlign') },
    { id: 'rev.language', label: 'Language of the text', group: 'Review', run: (s) => s.openDialog('language') },
    { id: 'file.versions', label: 'Version history', group: 'File', run: (s) => s.togglePane('versions'), active: (s) => s.view.pane === 'versions' },
    { id: 'view.split', label: 'Split view', group: 'View', run: (s) => s.setView({ split: !s.view.split }), active: (s) => !!s.view.split },
    { id: 'view.grid', label: 'Gridlines', group: 'View', run: (s) => s.setView({ showGrid: !s.view.showGrid }), active: (s) => s.view.showGrid },
    { id: 'view.newWindow', label: 'New window', group: 'View', run: () => {
      const bridge = (window as unknown as { clerdo?: { newWindow?: () => void } }).clerdo;
      if (bridge?.newWindow) bridge.newWindow();
      else window.open(`${location.pathname}?new=1`, '_blank', 'noopener');
    } },
  );
};

void findPara;
