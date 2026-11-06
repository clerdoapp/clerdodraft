import { blankDoc } from '../core/defaults';
import { type Doc, type ParaProps, type Revision, type RunProps, type Section, type Selection, type StoryId, newId } from '../core/model';
import { backspace, deleteForward, deleteSelection, insertAtom, insertContent, insertText, mapRunsInSelection, propsAt, setRunProps, splitParagraph, type EditContext, type EditResult } from '../core/ops';
import { collapsed, docStart, findPara, isCollapsed, paraLength, storyBlocks } from '../core/tree';
import type { Atom, Block } from '../core/model';
import { layoutDocument } from '../layout/paginate';
import type { Layout, Measurer } from '../layout/types';

export type ViewMode = 'print' | 'web' | 'read' | 'outline' | 'draft';
export type MarkupMode = 'all' | 'simple' | 'none' | 'original';

export interface ViewState {
  zoom: number;
  mode: ViewMode;
  markup: MarkupMode;
  showMarks: boolean;
  showRuler: boolean;
  showGrid: boolean;
  pane: string | null; // id of the open side pane
  focus: boolean;
  theme: 'light' | 'dark' | 'system';
  printing: boolean;
  webWidth: number; // points available in web view
  reader?: boolean;
  split?: boolean;
  twoUp?: boolean;
  mergeRow?: Record<string, string> | null; // recipient shown in place of merge fields
}

const mergeName = (instr: string): string => /MERGEFIELD\s+"?([^"\s]+)"?/i.exec(instr)?.[1] ?? '';

// Paragraph ids stay the same, so the caret and selection keep working during a preview.
const withMergeValues = (doc: Doc, row: Record<string, string>): Doc => {
  const fill = (blocks: Block[]): Block[] => blocks.map((b) => {
    if (b.type === 'p') return b.runs.some((r) => r.atom?.kind === 'field' && r.atom.field === 'merge') ? { ...b, runs: b.runs.map((r) => (r.atom?.kind === 'field' && r.atom.field === 'merge' ? { ...r, atom: { ...r.atom, result: row[mergeName(r.atom.instr)] ?? '' } } : r)) } : b;
    if (b.type === 'tbl') return { ...b, rows: b.rows.map((x) => ({ ...x, cells: x.cells.map((c) => ({ ...c, blocks: fill(c.blocks) })) })) };
    return b;
  });
  return { ...doc, blocks: fill(doc.blocks) };
};

export interface FileState {
  name: string;
  handle: unknown; // FileSystemFileHandle or a desktop path
  password?: string; // set while the file is protected; never stored
  dirty: boolean;
  lastSaved?: number;
}

export interface DialogState {
  id: string;
  props?: Record<string, unknown>;
}

interface Snapshot {
  doc: Doc;
  sel: Selection;
}

type Listener = () => void;

const AUTHOR_KEY = 'clerdodraft.author';

const readAuthor = (): string => {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? 'ClerdoDraft user';
  } catch {
    return 'ClerdoDraft user';
  }
};

export class EditorStore {
  doc: Doc = blankDoc();
  sel: Selection = collapsed(docStart(this.doc));
  layout: Layout = { pages: [], lineIndex: new Map(), boxes: new Map() };
  view: ViewState = { zoom: 1, mode: 'print', markup: 'all', showMarks: false, showRuler: true, showGrid: false, pane: null, focus: false, theme: 'system', printing: false, webWidth: 700 };
  file: FileState = { name: 'Untitled document', handle: null, dirty: false };
  dialog: DialogState | null = null;
  pending: RunProps | null = null; // formatting chosen at a caret, applied to the next typed text
  author = readAuthor();
  formatBrush: { run: RunProps; para?: ParaProps; once: boolean } | null = null;
  toast: string | null = null;
  version = 0;
  proof: import('../features/proof').Proofer | null = null;
  menu: { x: number; y: number; pos: import('../core/model').Pos } | null = null;
  onTyped: ((text: string) => void) | null = null;

  private bodyPos: Selection['focus'] | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastTyping = 0;
  private listeners = new Set<Listener>();
  readonly measurer: Measurer;

  constructor(measurer: Measurer) {
    this.measurer = measurer;
    this.relayout();
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  relayout(): void {
    const m = this.view.markup;
    this.layout = layoutDocument(this.viewDoc(), this.measurer, { showDeleted: m === 'all' || m === 'original', showHidden: this.view.showMarks });
  }

  // Web and draft views lay the same document out on one long, seamless strip.
  private viewDoc(): Doc {
    const base = this.view.mergeRow ? withMergeValues(this.doc, this.view.mergeRow) : this.doc;
    const mode = this.view.mode;
    if (mode !== 'web' && mode !== 'draft') return base;
    const strip = (s: Section): Section => ({
      ...s,
      pageHeight: 14400,
      headers: {}, footers: {}, breakType: 'continuous', pageBorders: undefined,
      marginTop: 18, marginBottom: 18,
      ...(mode === 'web' ? { pageWidth: this.view.webWidth + 36, marginLeft: 18, marginRight: 18, columns: { count: 1, space: 0 } } : {}),
    });
    return { ...base, section: strip(base.section), blocks: base.blocks.map((b) => (b.type === 'p' && b.section ? { ...b, section: strip(b.section) } : b)) };
  }

  remeasure(): void {
    (this.measurer as { invalidate?: () => void }).invalidate?.();
    this.styleTouch();
    this.relayout();
    this.emit();
  }

  // Layout results are cached by style table identity; replacing it drops stale measurements.
  private styleTouch(): void {
    this.doc = { ...this.doc, styles: { ...this.doc.styles } };
  }

  get revision(): Revision {
    return { id: newId(), author: this.author, date: new Date().toISOString() };
  }

  get ctx(): EditContext {
    return this.doc.settings.trackChanges ? { track: this.revision } : {};
  }

  get readOnly(): boolean {
    return this.view.mode === 'read' || this.doc.settings.protection?.kind === 'readOnly';
  }

  setAuthor(name: string): void {
    this.author = name;
    try {
      localStorage.setItem(AUTHOR_KEY, name);
    } catch {
      /* private mode: the name lasts for this session */
    }
    this.emit();
  }

  private push(group: boolean): void {
    const now = Date.now();
    if (group && now - this.lastTyping < 900) {
      this.lastTyping = now;
      return;
    }
    this.lastTyping = group ? now : 0;
    this.undoStack.push({ doc: this.doc, sel: this.sel });
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack = [];
  }

  // The one way a document changes.
  commit(next: EditResult | Doc, opts: { group?: boolean; sel?: Selection } = {}): void {
    const res = 'doc' in next ? next : { doc: next, sel: opts.sel ?? this.sel };
    if (res.doc === this.doc && res.sel === this.sel) return;
    if (res.doc !== this.doc) {
      this.push(!!opts.group);
      this.file = { ...this.file, dirty: true };
    }
    this.doc = res.doc;
    this.sel = this.validSel(res.sel);
    this.pending = null;
    this.relayout();
    this.emit();
  }

  private validSel(sel: Selection): Selection {
    const fix = (p: Selection['anchor']) => {
      const q = findPara(this.doc, p);
      if (q) return { ...p, offset: Math.min(p.offset, paraLength(q)) };
      return docStart(this.doc, storyBlocks(this.doc, p.story).length ? p.story : 'body');
    };
    return { anchor: fix(sel.anchor), focus: fix(sel.focus) };
  }

  setSel(sel: Selection): void {
    if (this.sel.focus.story === 'body') this.bodyPos = this.sel.focus;
    this.sel = this.validSel(sel);
    this.pending = null;
    this.emit();
  }

  setView(patch: Partial<ViewState>): void {
    const relayout = 'mergeRow' in patch || patch.markup !== undefined || patch.showMarks !== undefined || patch.mode !== undefined || patch.webWidth !== undefined;
    this.view = { ...this.view, ...patch };
    if (relayout) this.relayout();
    this.emit();
  }

  openDialog(id: string, props?: Record<string, unknown>): void {
    this.dialog = { id, props };
    this.emit();
  }

  closeDialog(): void {
    this.dialog = null;
    this.emit();
  }

  togglePane(id: string): void {
    this.setView({ pane: this.view.pane === id ? null : id });
  }

  notify(message: string): void {
    this.toast = message;
    this.emit();
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = null;
        this.emit();
      }
    }, 3200);
  }

  load(doc: Doc, file: Partial<FileState> = {}): void {
    this.doc = doc;
    this.sel = collapsed(docStart(doc));
    this.undoStack = [];
    this.redoStack = [];
    this.file = { name: 'Untitled document', handle: null, dirty: false, ...file };
    this.relayout();
    this.emit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo = (): void => {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push({ doc: this.doc, sel: this.sel });
    this.doc = s.doc;
    this.sel = s.sel;
    this.lastTyping = 0;
    this.file = { ...this.file, dirty: true };
    this.relayout();
    this.emit();
  };

  redo = (): void => {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push({ doc: this.doc, sel: this.sel });
    this.doc = s.doc;
    this.sel = s.sel;
    this.file = { ...this.file, dirty: true };
    this.relayout();
    this.emit();
  };

  // Typing and basic editing.
  typeText(text: string): void {
    if (this.readOnly || !text) return;
    const base = this.pending ? { ...propsAt(this.doc, this.sel.focus), ...this.pending } : undefined;
    this.commit(insertText(this.doc, this.sel, text, base, this.ctx), { group: isCollapsed(this.sel) && !/\s/.test(text) });
    this.onTyped?.(text);
  }

  enter(): void {
    if (this.readOnly) return;
    this.commit(splitParagraph(this.doc, this.sel, this.ctx));
  }

  backspace(byWord = false): void {
    if (this.readOnly) return;
    this.commit(backspace(this.doc, this.sel, this.ctx, byWord), { group: true });
  }

  deleteForward(byWord = false): void {
    if (this.readOnly) return;
    this.commit(deleteForward(this.doc, this.sel, this.ctx, byWord), { group: true });
  }

  deleteSelection(): void {
    if (this.readOnly) return;
    this.commit(deleteSelection(this.doc, this.sel, this.ctx));
  }

  insertAtom(atom: Atom, props?: RunProps): void {
    if (this.readOnly) return;
    this.commit(insertAtom(this.doc, this.sel, atom, props ?? propsAt(this.doc, this.sel.focus), this.ctx));
  }

  insertContent(blocks: Block[]): void {
    if (this.readOnly) return;
    this.commit(insertContent(this.doc, this.sel, blocks, this.ctx));
  }

  formatRun(patch: RunProps): void {
    if (isCollapsed(this.sel)) {
      this.pending = { ...this.pending, ...patch };
      this.emit();
      return;
    }
    const rev = this.doc.settings.trackChanges ? this.revision : undefined;
    if (rev) this.commit(mapRunsInSelection(this.doc, this.sel, (r) => ({ ...r, props: { ...r.props, ...patch }, ...(r.ins || r.del ? {} : { fmtRev: r.fmtRev ?? { rev, old: r.props } }) })));
    else this.commit(setRunProps(this.doc, this.sel, patch));
  }

  enterStory(story: StoryId): void {
    if (story === this.sel.focus.story) return;
    if (story === 'body' && this.bodyPos) {
      this.setSel(collapsed(this.bodyPos));
      return;
    }
    this.setSel(collapsed(docStart(this.doc, story)));
  }
}
