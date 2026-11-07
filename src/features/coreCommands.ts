import { newId, para, type Doc, type ParaProps, type RunProps, type Section } from '../core/model';
import { applyStyle, changeCase, clearRunProps, createTable, insertBlocksAfter, propsAt, resolveRevisions, setParaProps, sortParagraphs, sortTable, tableOps, textToTable, updateTable } from '../core/ops';
import { collapsed, docEnd, docStart, findPara, isCollapsed, orderedSel, paraLength, runAt, selectedParas, selectedText, sliceRuns, updatePara } from '../core/tree';
import { effectivePara, effectiveRun } from '../core/styles';
import { register, type Command } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { download, newDocument, openFile, saveFile } from './files';
import { exportHtml, exportMarkdown, exportText, printDocument } from './exports';
import { insertImageFile, selectedAtom } from './images';

export const currentRun = (s: EditorStore): RunProps => {
  const pos = orderedSel(s.doc, s.sel)[0];
  const p = findPara(s.doc, pos);
  if (!p) return {};
  const eff = effectivePara(s.doc, p.props);
  const off = isCollapsed(s.sel) ? pos.offset : pos.offset + 1;
  const base = runAt(p, off)?.props ?? p.markProps ?? {};
  return effectiveRun(s.doc, eff, { ...base, ...s.pending });
};

export const currentPara = (s: EditorStore): ParaProps => {
  const p = findPara(s.doc, s.sel.focus);
  return p ? effectivePara(s.doc, p.props) : {};
};

const toggle = (key: keyof RunProps) => (s: EditorStore) => s.formatRun({ [key]: !currentRun(s)[key] });
const para_ = (s: EditorStore, patch: ParaProps | ((p: ParaProps) => ParaProps)) => s.commit(setParaProps(s.doc, s.sel, patch));
const sizeStep = (s: EditorStore, d: number) => s.formatRun({ size: Math.max(1, (currentRun(s).size ?? 11) + d) });
const align = (a: ParaProps['align']): Partial<Command> => ({ run: (s) => para_(s, { align: a }), active: (s) => (currentPara(s).align ?? 'left') === a });

const BULLETS = ['•', '◦', '▪'];

export const ensureList = (doc: Doc, kind: 'bullet' | 'number' | 'outline'): { doc: Doc; numId: string } => {
  const id = newId();
  const fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
  const levels = Array.from({ length: 9 }, (_, i) => {
    const ind = { indentLeft: 36 * (i + 1), firstLine: -18 };
    if (kind === 'bullet') return { start: 1, format: 'bullet', text: BULLETS[i % 3]!, align: 'left' as const, suffix: 'tab' as const, paraProps: ind };
    if (kind === 'outline') return { start: 1, format: 'decimal', text: Array.from({ length: i + 1 }, (_, k) => `%${k + 1}`).join('.'), align: 'left' as const, suffix: 'tab' as const, paraProps: { indentLeft: 36 + 18 * i, firstLine: -36 } };
    return { start: 1, format: fmts[i % 3]!, text: `%${i + 1}.`, align: 'left' as const, suffix: 'tab' as const, paraProps: ind };
  });
  return {
    numId: id,
    doc: { ...doc, numbering: { abstracts: { ...doc.numbering.abstracts, [id]: { id, levels, multiLevelType: 'multilevel' } }, instances: { ...doc.numbering.instances, [id]: { id, abstractId: id } } } },
  };
};

const toggleList = (s: EditorStore, kind: 'bullet' | 'number' | 'outline'): void => {
  const cur = currentPara(s).numbering;
  if (cur && cur.numId !== '0') {
    s.commit(setParaProps(s.doc, s.sel, (p) => { const { numbering: _n, indentLeft: _i, firstLine: _f, ...rest } = p; return rest; }));
    return;
  }
  const { doc, numId } = ensureList(s.doc, kind);
  s.commit(setParaProps(doc, s.sel, { numbering: { numId, level: 0 } }));
};

const levelChange = (s: EditorStore, d: number): void => {
  const cur = currentPara(s);
  if (cur.numbering && cur.numbering.numId !== '0') {
    const { numId, level } = cur.numbering;
    para_(s, { numbering: { numId, level: Math.max(0, Math.min(8, level + d)) } });
  } else para_(s, (p) => ({ ...p, indentLeft: Math.max(0, (cur.indentLeft ?? 0) + d * 36) }));
};

const setSection = (s: EditorStore, patch: Partial<Section>): void => {
  const doc = s.doc;
  s.commit({ ...doc, section: { ...doc.section, ...patch }, blocks: doc.blocks.map((b) => (b.type === 'p' && b.section ? { ...b, section: { ...b.section, ...patch } } : b)) });
};

export { setSection };

export const pickFile = (accept: string, fn: (f: File) => void): void => {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = accept;
  i.onchange = () => { const f = i.files?.[0]; if (f) fn(f); };
  i.click();
};

const tableCmd = (id: string, label: string, fn: (t: Parameters<typeof tableOps.insertRow>[0], r: number, c: number) => ReturnType<typeof tableOps.deleteRow>): Command => ({
  id, label, group: 'Table',
  enabled: (s) => inTable(s),
  run: (s) => s.commit(updateTable(s.doc, s.sel.focus.story, s.sel.focus.para, fn)),
});

declare const __APP_VERSION__: string;

const checkForUpdates = async (s: EditorStore): Promise<void> => {
  try {
    const r = await fetch(`https://api.github.com/repos/${import.meta.env.VITE_RELEASE_REPO}/releases/latest`);
    if (!r.ok) throw new Error();
    const j = (await r.json()) as { tag_name?: string; html_url?: string };
    const latest = (j.tag_name ?? '').replace(/^v/, '');
    if (!latest || latest === __APP_VERSION__) { s.notify(`ClerdoDraft ${__APP_VERSION__} is up to date.`); return; }
    s.notify(`ClerdoDraft ${latest} is available.`);
    if (j.html_url?.startsWith('https://github.com/')) window.open(j.html_url, '_blank', 'noopener');
  } catch {
    s.notify("Couldn't check for updates. Try again when you're online.");
  }
};

export const inTable = (s: EditorStore): boolean => {
  const b = s.doc;
  const hit = { found: false };
  const walk = (list: typeof b.blocks) => {
    for (const x of list) if (x.type === 'tbl') for (const r of x.rows) for (const c of r.cells) {
      if (c.blocks.some((k) => k.id === s.sel.focus.para)) hit.found = true;
      walk(c.blocks);
    }
  };
  walk(b.blocks);
  return hit.found;
};

export const registerCoreCommands = (): void => {
  register(
    { id: 'file.new', label: 'New document', group: 'File', keys: 'mod+alt+n', run: newDocument },
    { id: 'file.open', label: 'Open a document', group: 'File', keys: 'mod+o', run: (s) => void openFile(s) },
    { id: 'file.save', label: 'Save', group: 'File', keys: 'mod+s', run: (s) => void saveFile(s) },
    { id: 'file.saveAs', label: 'Save a copy', group: 'File', keys: 'mod+shift+s f12', run: (s) => void saveFile(s, true) },
    { id: 'file.print', label: 'Print or save as PDF', group: 'File', keys: 'mod+p', run: printDocument },
    { id: 'file.html', label: 'Export as web page', group: 'File', run: exportHtml },
    { id: 'file.md', label: 'Export as Markdown', group: 'File', run: exportMarkdown },
    { id: 'file.txt', label: 'Export as plain text', group: 'File', run: exportText },
    {
      id: 'file.updates', label: 'Check for updates', group: 'File',
      enabled: () => !!import.meta.env.VITE_RELEASE_REPO,
      run: (s) => void checkForUpdates(s),
    },
    { id: 'obj.settings', label: 'Picture settings', group: 'Insert', enabled: (s) => !!selectedAtom(s), run: (s) => s.openDialog('picture') },
    { id: 'help.about', label: 'About ClerdoDraft', group: 'Help', run: (s) => s.openDialog('about') },
    { id: 'file.properties', label: 'Document details', group: 'File', run: (s) => s.openDialog('properties') },

    { id: 'edit.undo', label: 'Undo', group: 'Edit', keys: 'mod+z', run: (s) => s.undo(), enabled: (s) => s.canUndo },
    { id: 'edit.redo', label: 'Redo', group: 'Edit', keys: 'mod+y mod+shift+z', run: (s) => s.redo(), enabled: (s) => s.canRedo },
    { id: 'edit.selectAll', label: 'Select everything', group: 'Edit', keys: 'mod+a', run: (s) => s.setSel({ anchor: docStart(s.doc, s.sel.focus.story), focus: docEnd(s.doc, s.sel.focus.story) }) },
    { id: 'edit.find', label: 'Find', group: 'Edit', keys: 'mod+f', run: (s) => s.setView({ pane: 'find' }) },
    { id: 'edit.replace', label: 'Find and replace', group: 'Edit', keys: 'mod+h', run: (s) => s.setView({ pane: 'find' }) },
    { id: 'edit.goto', label: 'Go to page', group: 'Edit', keys: 'mod+g f5', run: (s) => s.openDialog('goto') },
    { id: 'edit.palette', label: 'Search commands', group: 'Edit', keys: 'mod+/', run: (s) => s.openDialog('palette') },
    { id: 'edit.pasteText', label: 'Paste as plain text', group: 'Edit', keys: 'mod+shift+v', run: (s) => void navigator.clipboard.readText().then((t) => s.typeText(t)).catch(() => s.notify('Paste blocked by the browser. Use the keyboard paste.')) },
    { id: 'edit.brush', label: 'Copy formatting', group: 'Edit', run: (s) => { s.formatBrush = s.formatBrush ? null : { run: findPara(s.doc, s.sel.focus) ? runProps(s) : {}, para: findPara(s.doc, s.sel.focus)?.props, once: true }; s.emit(); }, active: (s) => !!s.formatBrush },

    { id: 'fmt.bold', label: 'Bold', group: 'Text', keys: 'mod+b', run: toggle('bold'), active: (s) => !!currentRun(s).bold },
    { id: 'fmt.italic', label: 'Italic', group: 'Text', keys: 'mod+i', run: toggle('italic'), active: (s) => !!currentRun(s).italic },
    { id: 'fmt.underline', label: 'Underline', group: 'Text', keys: 'mod+u', run: (s) => { const on = currentRun(s).underline; s.formatRun({ underline: on && on !== 'none' ? 'none' : 'single' }); }, active: (s) => { const u = currentRun(s).underline; return !!u && u !== 'none'; } },
    { id: 'fmt.dunderline', label: 'Double underline', group: 'Text', keys: 'mod+shift+d', run: (s) => s.formatRun({ underline: currentRun(s).underline === 'double' ? 'none' : 'double' }) },
    { id: 'fmt.strike', label: 'Strikethrough', group: 'Text', run: toggle('strike'), active: (s) => !!currentRun(s).strike },
    { id: 'fmt.super', label: 'Superscript', group: 'Text', keys: 'mod+shift+=', run: (s) => s.formatRun({ vertAlign: currentRun(s).vertAlign === 'super' ? undefined : 'super' }), active: (s) => currentRun(s).vertAlign === 'super' },
    { id: 'fmt.sub', label: 'Subscript', group: 'Text', keys: 'mod+=', run: (s) => s.formatRun({ vertAlign: currentRun(s).vertAlign === 'sub' ? undefined : 'sub' }), active: (s) => currentRun(s).vertAlign === 'sub' },
    { id: 'fmt.smallCaps', label: 'Small capitals', group: 'Text', keys: 'mod+shift+k', run: toggle('smallCaps') },
    { id: 'fmt.caps', label: 'All capitals', group: 'Text', keys: 'mod+shift+a', run: toggle('caps') },
    { id: 'fmt.hidden', label: 'Hidden text', group: 'Text', keys: 'mod+shift+h', run: toggle('hidden') },
    { id: 'fmt.grow', label: 'Larger text', group: 'Text', keys: 'mod+] mod+shift+.', run: (s) => sizeStep(s, 1) },
    { id: 'fmt.shrink', label: 'Smaller text', group: 'Text', keys: 'mod+[ mod+shift+,', run: (s) => sizeStep(s, -1) },
    { id: 'fmt.clear', label: 'Clear formatting', group: 'Text', keys: 'mod+space', run: (s) => { if (isCollapsed(s.sel)) { s.pending = {}; s.emit(); } else s.commit(clearRunProps(s.doc, s.sel)); } },
    { id: 'fmt.upper', label: 'UPPERCASE', group: 'Text', run: (s) => s.commit(changeCase(s.doc, s.sel, 'upper')) },
    { id: 'fmt.lower', label: 'lowercase', group: 'Text', run: (s) => s.commit(changeCase(s.doc, s.sel, 'lower')) },
    { id: 'fmt.title', label: 'Capitalize Each Word', group: 'Text', run: (s) => s.commit(changeCase(s.doc, s.sel, 'title')) },
    { id: 'fmt.sentence', label: 'Sentence case', group: 'Text', run: (s) => s.commit(changeCase(s.doc, s.sel, 'sentence')) },
    { id: 'fmt.toggleCase', label: 'tOGGLE cASE', group: 'Text', keys: 'shift+f3', run: (s) => s.commit(changeCase(s.doc, s.sel, 'toggle')) },
    { id: 'fmt.font', label: 'Text settings', group: 'Text', keys: 'mod+d', run: (s) => s.openDialog('font') },

    { id: 'par.left', label: 'Align left', group: 'Paragraph', keys: 'mod+l', ...align('left') } as Command,
    { id: 'par.center', label: 'Center', group: 'Paragraph', keys: 'mod+e', ...align('center') } as Command,
    { id: 'par.right', label: 'Align right', group: 'Paragraph', keys: 'mod+r', ...align('right') } as Command,
    { id: 'par.justify', label: 'Justify', group: 'Paragraph', keys: 'mod+j', ...align('justify') } as Command,
    { id: 'par.indent', label: 'Indent more', group: 'Paragraph', keys: 'mod+m', run: (s) => levelChange(s, 1) },
    { id: 'par.outdent', label: 'Indent less', group: 'Paragraph', keys: 'mod+shift+m', run: (s) => levelChange(s, -1) },
    { id: 'par.hanging', label: 'Hanging indent', group: 'Paragraph', keys: 'mod+t', run: (s) => para_(s, (p) => ({ ...p, indentLeft: 36, firstLine: -36 })) },
    { id: 'par.single', label: 'Single line spacing', group: 'Paragraph', keys: 'mod+1', run: (s) => para_(s, { lineSpacing: { rule: 'auto', value: 1 } }) },
    { id: 'par.onehalf', label: '1.5 line spacing', group: 'Paragraph', keys: 'mod+5', run: (s) => para_(s, { lineSpacing: { rule: 'auto', value: 1.5 } }) },
    { id: 'par.double', label: 'Double line spacing', group: 'Paragraph', keys: 'mod+2', run: (s) => para_(s, { lineSpacing: { rule: 'auto', value: 2 } }) },
    { id: 'par.bullets', label: 'Bulleted list', group: 'Paragraph', keys: 'mod+shift+l', run: (s) => toggleList(s, 'bullet') },
    { id: 'par.numbers', label: 'Numbered list', group: 'Paragraph', run: (s) => toggleList(s, 'number') },
    { id: 'par.outline', label: 'Multilevel list', group: 'Paragraph', run: (s) => toggleList(s, 'outline') },
    { id: 'par.rtl', label: 'Right-to-left paragraph', group: 'Paragraph', run: (s) => para_(s, { bidi: !currentPara(s).bidi }), active: (s) => !!currentPara(s).bidi },
    { id: 'par.settings', label: 'Paragraph settings', group: 'Paragraph', run: (s) => s.openDialog('paragraph') },
    { id: 'par.border', label: 'Paragraph border', group: 'Paragraph', run: (s) => s.openDialog('paraBorder') },
    { id: 'tbl.cell', label: 'Cell color and border', group: 'Table', enabled: (s) => inTable(s), run: (s) => s.openDialog('cell') },
    { id: 'par.sortAsc', label: 'Sort A to Z', group: 'Paragraph', run: (s) => s.commit(sortParagraphs(s.doc, s.sel, false)) },
    { id: 'par.sortDesc', label: 'Sort Z to A', group: 'Paragraph', run: (s) => s.commit(sortParagraphs(s.doc, s.sel, true)) },
    { id: 'par.marks', label: 'Show formatting marks', group: 'Paragraph', keys: 'mod+shift+8', run: (s) => s.setView({ showMarks: !s.view.showMarks }), active: (s) => s.view.showMarks },
    ...[1, 2, 3].map((n) => ({ id: `style.h${n}`, label: `Heading ${n}`, group: 'Styles', keys: `mod+alt+${n}`, run: (s: EditorStore) => s.commit(applyStyle(s.doc, s.sel, `Heading${n}`)) })),
    { id: 'style.normal', label: 'Normal text', group: 'Styles', keys: 'mod+shift+n', run: (s) => s.commit(applyStyle(s.doc, s.sel, 'Normal')) },
    { id: 'style.manage', label: 'Manage styles', group: 'Styles', run: (s) => s.togglePane('styles') },

    { id: 'ins.pageBreak', label: 'Page break', group: 'Insert', run: (s) => s.typeText('\f') },
    { id: 'ins.columnBreak', label: 'Column break', group: 'Insert', keys: 'mod+shift+enter', run: (s) => s.typeText('\v') },
    { id: 'ins.lineBreak', label: 'Line break', group: 'Insert', run: (s) => s.typeText('\n') },
    { id: 'ins.picture', label: 'Picture from this device', group: 'Insert', run: (s) => pickFile('image/*', (f) => void insertImageFile(s, f)) },
    { id: 'ins.table', label: 'Table', group: 'Insert', run: (s) => s.openDialog('table') },
    {
      id: 'ins.textToTable', label: 'Turn text into a table', group: 'Table', enabled: (s) => !isCollapsed(s.sel),
      run: (s) => {
        const ps = selectedParas(s.doc, s.sel);
        const sec = s.doc.section;
        const t = textToTable(ps, sec.pageWidth - sec.marginLeft - sec.marginRight);
        let d = insertBlocksAfter(s.doc, s.sel.focus.story, ps[ps.length - 1]!.id, [t]);
        for (const p of ps.slice(1)) d = updatePara(d, s.sel.focus.story, p.id, (q) => q);
        s.commit(d);
      },
    },
    { id: 'pane.nav', label: 'Document outline', group: 'View', run: (s) => s.togglePane('outline'), active: (s) => s.view.pane === 'outline' },
    tableCmd('tbl.rowAbove', 'Add row above', (t, r) => tableOps.insertRow(t, r, false)),
    tableCmd('tbl.rowBelow', 'Add row below', (t, r) => tableOps.insertRow(t, r, true)),
    tableCmd('tbl.colLeft', 'Add column left', (t, r, c) => tableOps.insertColumn(t, r, c, false)),
    tableCmd('tbl.colRight', 'Add column right', (t, r, c) => tableOps.insertColumn(t, r, c, true)),
    tableCmd('tbl.delRow', 'Remove row', (t, r) => tableOps.deleteRow(t, r)),
    tableCmd('tbl.delCol', 'Remove column', (t, r, c) => tableOps.deleteColumn(t, r, c)),
    tableCmd('tbl.merge', 'Merge with next cell', (t, r, c) => tableOps.mergeRight(t, r, c)),
    tableCmd('tbl.split', 'Split cell', (t, r, c) => tableOps.splitCell(t, r, c)),
    tableCmd('tbl.delete', 'Remove table', () => []),
    tableCmd('tbl.toText', 'Turn table into text', (t) => tableOps.toText(t)),
    tableCmd('tbl.sortAsc', 'Sort rows by this column', (t, _r, c) => sortTable(t, c, false, !!t.rows[0]?.props.header)),
    tableCmd('tbl.header', 'Repeat as header row', (t, r) => ({ ...t, rows: t.rows.map((x, i) => (i === r ? { ...x, props: { ...x.props, header: !x.props.header } } : x)) })),

    { id: 'rev.track', label: 'Track changes', group: 'Review', keys: 'mod+shift+e', run: (s) => s.commit({ ...s.doc, settings: { ...s.doc.settings, trackChanges: !s.doc.settings.trackChanges } }), active: (s) => !!s.doc.settings.trackChanges },
    { id: 'rev.acceptAll', label: 'Accept all changes', group: 'Review', run: (s) => s.commit(resolveRevisions(s.doc, 'body', true)) },
    { id: 'rev.rejectAll', label: 'Reject all changes', group: 'Review', run: (s) => s.commit(resolveRevisions(s.doc, 'body', false)) },
    { id: 'rev.accept', label: 'Accept selected changes', group: 'Review', run: (s) => s.commit(resolveRevisions(s.doc, s.sel.focus.story, true, s.sel)) },
    { id: 'rev.reject', label: 'Reject selected changes', group: 'Review', run: (s) => s.commit(resolveRevisions(s.doc, s.sel.focus.story, false, s.sel)) },
    { id: 'rev.changes', label: 'Changes list', group: 'Review', run: (s) => s.togglePane('changes'), active: (s) => s.view.pane === 'changes' },
    { id: 'rev.comments', label: 'Comments', group: 'Review', run: (s) => s.togglePane('comments'), active: (s) => s.view.pane === 'comments' },
    { id: 'rev.count', label: 'Word count', group: 'Review', run: (s) => s.openDialog('count') },
    {
      id: 'rev.read', label: 'Read aloud', group: 'Review',
      run: (s) => {
        void import('./speech').then((sp) => {
          if (sp.isSpeaking()) { sp.stopSpeaking(); return; }
          if (!sp.canSpeak()) { s.notify('Reading aloud is not available here.'); return; }
          const text = isCollapsed(s.sel) ? s.doc.blocks.map((b) => (b.type === 'p' ? b.runs.filter((r) => !r.del && !r.atom).map((r) => r.text).join('') : '')).join('\n') : selectedText(s.doc, s.sel);
          sp.speakBlocks(text.split('\n'), { onDone: (ok) => { if (!ok) s.notify("This text couldn't be read aloud. Check that the system has a voice for its language."); } });
        });
      },
    },

    { id: 'view.print', label: 'Page view', group: 'View', run: (s) => s.setView({ mode: 'print', focus: false }), active: (s) => s.view.mode === 'print' },
    { id: 'view.read', label: 'Reading view', group: 'View', run: (s) => s.setView({ mode: 'read', focus: true }), active: (s) => s.view.mode === 'read' },
    { id: 'view.web', label: 'Web view', group: 'View', run: (s) => s.setView({ mode: 'web', focus: false }), active: (s) => s.view.mode === 'web' },
    { id: 'view.draft', label: 'Draft view', group: 'View', run: (s) => s.setView({ mode: 'draft', focus: false }), active: (s) => s.view.mode === 'draft' },
    { id: 'view.exit', label: 'Leave focus', group: 'View', keys: 'mod+shift+f', run: (s) => s.setView({ mode: 'print', focus: !s.view.focus }) },
    { id: 'view.ruler', label: 'Ruler', group: 'View', run: (s) => s.setView({ showRuler: !s.view.showRuler }), active: (s) => s.view.showRuler },
    { id: 'view.zoomIn', label: 'Zoom in', group: 'View', run: (s) => s.setView({ zoom: Math.min(5, +(s.view.zoom + 0.1).toFixed(2)) }) },
    { id: 'view.zoomOut', label: 'Zoom out', group: 'View', run: (s) => s.setView({ zoom: Math.max(0.25, +(s.view.zoom - 0.1).toFixed(2)) }) },
    { id: 'view.zoom100', label: 'Actual size', group: 'View', keys: 'mod+0', run: (s) => s.setView({ zoom: 1 }) },
    { id: 'view.dark', label: 'Switch light and dark', group: 'View', run: (s) => s.setView({ theme: document.documentElement.getAttribute('data-theme') === 'dark' || (s.view.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark' }) },
  );
  void createTable; void para; void collapsed; void paraLength; void sliceRuns; void propsAt; void download;
};

const runProps = (s: EditorStore): RunProps => {
  const pos = orderedSel(s.doc, s.sel)[0];
  const p = findPara(s.doc, pos);
  return (p && runAt(p, pos.offset + 1)?.props) ?? {};
};
