import { useState, type ReactNode } from 'react';
import {
  Square, RectangleVertical, RectangleHorizontal, Maximize2, Minimize2, Columns3, Rows2, Rows3, Rows4, EyeOff, FileClock, MessagesSquare, File, AlignCenter, ChartColumn, SquarePen, AlignJustify, AlignLeft, AlignRight, Bold, BookOpen, Bookmark, CaseSensitive, CheckSquare, Columns2, Eraser, Eye, FilePlus2, FileText, FolderOpen, Highlighter, Image, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, ListTree, Mail, MessageSquare, Minus, PanelLeftClose, PenLine, Pilcrow, Plus, Printer, Quote, Save, ScanText, Sigma, Strikethrough, Subscript, Superscript, Table2, Type, Underline, type LucideIcon,
} from 'lucide-react';
import { command, prettyKeys, run } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { applyStyle } from '../core/ops';
import { currentPara, currentRun, setSection, inTable } from '../features/coreCommands';
import { A4, LETTER } from '../core/model';
import { cssFamily } from '../layout/measure';
import { FontPicker } from './FontPicker';
import { TEMPLATES } from '../features/templateLibrary';
import { isOutlineOnly, SHAPE_COUNT, SHAPE_GROUPS, shapePath } from '../core/shapes';
import { insertShape } from '../features/insert';
import { COMMAND_ICONS } from './commandIcons';

const ShapeGallery = ({ store }: { store: EditorStore }) => (
  <div className="shapegal">
    {SHAPE_GROUPS.map(([title, list]) => (
      <div key={title}>
        <h4>{title}</h4>
        <div className="shapegrid">
          {list.map(([id, label]) => (
            <button key={id} title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={() => insertShape(store, id)}>
              <svg viewBox="-2 -2 28 24" width="26" height="22"><path d={shapePath(id, 24, 20)} fill={isOutlineOnly(id) ? 'none' : 'currentColor'} fillOpacity={0.18} stroke="currentColor" strokeWidth={1.2} fillRule="evenodd" /></svg>
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);
import { applySpacing, applyTheme, SPACINGS, THEMES } from '../features/themes';

const S = 1.9;

interface Tool {
  id: string;
  icon?: LucideIcon;
  label?: string;
}

const Btn = ({ store, t, iconOnly }: { store: EditorStore; t: Tool; iconOnly?: boolean }) => {
  const c = command(t.id);
  if (!c) return null;
  const on = c.active?.(store);
  const enabled = c.enabled?.(store) ?? true;
  const Icon = t.icon ?? COMMAND_ICONS[t.id] ?? Square;
  const label = t.label ?? c.label;
  // Every button is a picture with a short label under it; the full name is in the tooltip.
  return (
    <button className={`tile${on ? ' on' : ''}${iconOnly ? ' small' : ''}`} disabled={!enabled} aria-pressed={on} title={c.keys ? `${label} (${prettyKeys(c.keys)})` : label}
      onMouseDown={(e) => e.preventDefault()} onClick={() => run(store, t.id)}>
      <Icon size={iconOnly ? 17 : 19} strokeWidth={S} aria-hidden="true" /><span>{label}</span>
    </button>
  );
};

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="group"><h3>{title}</h3>{children}</section>
);

const Icons = ({ store, tools }: { store: EditorStore; tools: Tool[] }) => <div className="tiles small">{tools.map((t) => <Btn key={t.id} store={store} t={t} iconOnly />)}</div>;
const List_ = ({ store, tools }: { store: EditorStore; tools: Tool[] }) => <div className="tiles">{tools.map((t) => <Btn key={t.id} store={store} t={t} />)}</div>;
const ids = (...x: string[]): Tool[] => x.map((id) => ({ id }));

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const SWATCHES = ['#000000', '#404040', '#7f7f7f', '#c00000', '#e36c0a', '#bf9000', '#2e7d32', '#00838f', '#2347ff', '#6a1b9a'];
const MARKERS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffb74d', '#c0c0c0'];

const FontControls = ({ store }: { store: EditorStore }) => {
  const r = currentRun(store);
  return (
    <div className="fontctl">
      <FontPicker store={store} value={r.font} onPick={(f) => store.formatRun({ font: f, fontCs: f })} />
      <button className="tool icon" aria-label="Smaller text" onClick={() => run(store, 'fmt.shrink')}><Minus size={14} strokeWidth={S} /></button>
      <select aria-label="Size" value={SIZES.includes(r.size ?? 11) ? r.size : ''} onChange={(e) => store.formatRun({ size: Number(e.target.value) })}>
        {!SIZES.includes(r.size ?? 11) && <option value="">{r.size}</option>}
        {SIZES.map((f) => <option key={f}>{f}</option>)}
      </select>
      <button className="tool icon" aria-label="Larger text" onClick={() => run(store, 'fmt.grow')}><Plus size={14} strokeWidth={S} /></button>
    </div>
  );
};

const Swatches = ({ colors, label, onPick, clear }: { colors: string[]; label: string; onPick: (c: string | undefined) => void; clear: string }) => (
  <div className="swatches" role="group" aria-label={label}>
    <button className="sw none" title={clear} aria-label={clear} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(undefined)} />
    {colors.map((c) => <button key={c} className="sw" title={c} aria-label={`${label} ${c}`} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)} />)}
  </div>
);

const StyleGallery = ({ store }: { store: EditorStore }) => {
  const list = Object.values(store.doc.styles.styles).filter((s) => s.kind === 'paragraph' && s.quick).sort((a, b) => (a.uiPriority ?? 99) - (b.uiPriority ?? 99)).slice(0, 12);
  const cur = currentPara(store).style;
  return (
    <div className="styles">
      {list.map((s) => (
        <button key={s.id} className={`stylechip${cur === s.id ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => store.commit(applyStyle(store.doc, store.sel, s.id))}>{s.name}</button>
      ))}
    </div>
  );
};

const PageControls = ({ store }: { store: EditorStore }) => {
  const sec = store.doc.section;
  const isA4 = Math.abs(Math.min(sec.pageWidth, sec.pageHeight) - A4.w) < 3;
  const size = (p: { w: number; h: number }) => setSection(store, sec.landscape ? { pageWidth: p.h, pageHeight: p.w } : { pageWidth: p.w, pageHeight: p.h });
  const margin = (m: number) => setSection(store, { marginTop: m, marginBottom: m, marginLeft: m, marginRight: m });
  const orient = (land: boolean) => { if (land !== !!sec.landscape) setSection(store, { landscape: land || undefined, pageWidth: sec.pageHeight, pageHeight: sec.pageWidth }); };
  const col = (n: number) => setSection(store, { columns: { ...sec.columns, count: n } });
  const seg = (items: [string, boolean, () => void, LucideIcon][]) => <div className="seg">{items.map(([l, on, f, I]) => <button key={l} className={`pick${on ? ' on' : ''}`} aria-pressed={on} onClick={f}><I size={16} strokeWidth={S} aria-hidden="true" />{l}</button>)}</div>;
  return (
    <>
      <Group title="Size">{seg([['Letter', !isA4, () => size(LETTER), FileText], ['A4', isA4, () => size(A4), File]])}</Group>
      <Group title="Direction">{seg([['Tall', !sec.landscape, () => orient(false), RectangleVertical], ['Wide', !!sec.landscape, () => orient(true), RectangleHorizontal]])}</Group>
      <Group title="Margins">{seg([['Narrow', sec.marginLeft === 36, () => margin(36), Maximize2], ['Medium', sec.marginLeft === 54, () => margin(54), Square], ['Wide', sec.marginLeft === 72, () => margin(72), Minimize2]])}<List_ store={store} tools={[{ id: 'page.setup', label: 'Custom page setup' }]} /></Group>
      <Group title="Columns">{seg([1, 2, 3].map((n) => [String(n), sec.columns.count === n, () => col(n), [RectangleVertical, Columns2, Columns3][n - 1]!] as [string, boolean, () => void, LucideIcon]))}</Group>
      <Group title="Breaks"><List_ store={store} tools={ids('ins.pageBreak', 'ins.columnBreak', 'ins.nextPage', 'ins.continuous')} /></Group>
      <Group title="Theme">
        <div className="themes">{THEMES.map((t) => <button key={t.id} title={`${t.heading} and ${t.body}`} onClick={() => applyTheme(store, t)}><i style={{ background: t.color }} /><span style={{ fontFamily: cssFamily(t.heading) }}>{t.name}</span></button>)}</div>
        <div className="seg">{SPACINGS.map((p, i) => { const I = [Rows4, Rows3, Rows2][i] ?? Rows3; return <button key={p.id} className="pick" onClick={() => applySpacing(store, p.id)}><I size={16} strokeWidth={S} aria-hidden="true" />{p.name}</button>; })}</div>
      </Group>
      <Group title="Page look">
        <Swatches label="Page color" clear="White page" colors={['#fff8e1', '#e8f5e9', '#e3f2fd', '#f3e5f5', '#eeeeee']} onPick={(c) => store.commit({ ...store.doc, settings: { ...store.doc.settings, pageColor: c } })} />
        <List_ store={store} tools={ids('page.watermark', 'page.border', 'page.lineNumbers', 'page.hyphen', 'page.facing', 'page.vAlign')} />
      </Group>
    </>
  );
};

interface Section_ {
  id: string;
  label: string;
  icon: LucideIcon;
  body: (s: EditorStore) => ReactNode;
}

const SECTIONS: Section_[] = [
  {
    id: 'doc', label: 'Doc', icon: FileText,
    body: (s) => (
      <>
        <Group title="Document"><List_ store={s} tools={[{ id: 'file.new', icon: FilePlus2 }, { id: 'file.open', icon: FolderOpen }, { id: 'file.save', icon: Save }, { id: 'file.saveAs' }, { id: 'file.versions' }, { id: 'file.protect' }, { id: 'file.sign' }, { id: 'file.properties' }, { id: 'help.keys' }, { id: 'file.updates' }, { id: 'help.about' }]} /></Group>
        <Group title="Start from"><List_ store={s} tools={[{ id: 'file.templates', label: `All templates (${TEMPLATES.length})` }, { id: 'tpl.letter' }, { id: 'tpl.resume' }, { id: 'tpl.report' }, { id: 'tpl.invoice' }]} /></Group>
        <Group title="Together"><List_ store={s} tools={ids('share.together', 'share.link')} /></Group>
        <Group title="Share out"><List_ store={s} tools={[{ id: 'file.print', icon: Printer }, { id: 'file.html' }, { id: 'file.md' }, { id: 'file.txt' }, { id: 'file.odt' }, { id: 'file.rtf' }]} /></Group>
      </>
    ),
  },
  {
    id: 'write', label: 'Write', icon: PenLine,
    body: (s) => (
      <>
        <Group title="Style"><StyleGallery store={s} /><List_ store={s} tools={ids('style.manage')} /></Group>
        <Group title="Text">
          <FontControls store={s} />
          <Icons store={s} tools={[{ id: 'fmt.bold', icon: Bold }, { id: 'fmt.italic', icon: Italic }, { id: 'fmt.underline', icon: Underline }, { id: 'fmt.strike', icon: Strikethrough }, { id: 'fmt.super', icon: Superscript }, { id: 'fmt.sub', icon: Subscript }, { id: 'fmt.clear', icon: Eraser }]} />
          <label className="mini"><Type size={13} strokeWidth={S} /> Color</label>
          <Swatches label="Text color" clear="Automatic color" colors={SWATCHES} onPick={(c) => s.formatRun({ color: c })} />
          <label className="mini"><Highlighter size={13} strokeWidth={S} /> Marker</label>
          <Swatches label="Marker" clear="No marker" colors={MARKERS} onPick={(c) => s.formatRun({ highlight: c })} />
          <List_ store={s} tools={[{ id: 'fmt.font', label: 'More text settings' }, { id: 'edit.brush', label: 'Copy formatting' }]} />
        </Group>
        <Group title="Change case"><div className="seg wrap">{[['ABC', 'fmt.upper'], ['abc', 'fmt.lower'], ['Abc', 'fmt.title'], ['Sentence', 'fmt.sentence']].map(([l, id]) => <button key={id} onMouseDown={(e) => e.preventDefault()} onClick={() => run(s, id!)}>{l}</button>)}</div></Group>
        <Group title="Paragraph">
          <Icons store={s} tools={[{ id: 'par.left', icon: AlignLeft }, { id: 'par.center', icon: AlignCenter }, { id: 'par.right', icon: AlignRight }, { id: 'par.justify', icon: AlignJustify }, { id: 'par.outdent', icon: IndentDecrease }, { id: 'par.indent', icon: IndentIncrease }, { id: 'par.marks', icon: Pilcrow }]} />
          <Icons store={s} tools={[{ id: 'par.bullets', icon: List }, { id: 'par.numbers', icon: ListOrdered }, { id: 'par.outline', icon: ListTree }, { id: 'par.rtl', icon: CaseSensitive, label: 'Right-to-left paragraph' }]} />
          <div className="seg">{[['1', 'par.single'], ['1.5', 'par.onehalf'], ['2', 'par.double']].map(([l, id]) => <button key={id} title={command(id!)?.label} onMouseDown={(e) => e.preventDefault()} onClick={() => run(s, id!)}>{l}</button>)}</div>
          <List_ store={s} tools={[{ id: 'par.settings', label: 'More paragraph settings' }, { id: 'par.border' }, { id: 'par.dropCap' }, { id: 'par.restart' }, { id: 'par.bullet' }, { id: 'par.sortAsc' }]} />
        </Group>
        <Group title="Edit"><List_ store={s} tools={ids('edit.find', 'edit.goto', 'edit.selectAll')} /></Group>
      </>
    ),
  },
  {
    id: 'add', label: 'Add', icon: Plus,
    body: (s) => (
      <>
        <Group title="Objects"><List_ store={s} tools={[{ id: 'ins.table', icon: Table2 }, { id: 'ins.picture', icon: Image }, { id: 'ins.chart', icon: ChartColumn }, { id: 'ins.textbox', icon: SquarePen }, { id: 'ins.equation', icon: Sigma }, { id: 'ins.symbol' }, { id: 'ins.emoji' }, { id: 'ins.checkbox', icon: CheckSquare }, { id: 'ins.icons' }, { id: 'ins.object' }, { id: 'ins.webPicture' }, { id: 'ins.diagram' }, { id: 'ins.draw' }, { id: 'ins.video' }, { id: 'ins.screenshot' }, { id: 'ins.textArt' }, { id: 'ins.control' }, { id: 'ins.blocks' }, { id: 'ins.file' }]} /></Group>
        {inTable(s) && <Group title="This table"><List_ store={s} tools={ids('tbl.formula', 'tbl.fit', 'tbl.even', 'tbl.dir', 'tbl.splitTable', 'tbl.cell', 'tbl.rowAbove', 'tbl.rowBelow', 'tbl.colLeft', 'tbl.colRight', 'tbl.merge', 'tbl.split', 'tbl.delRow', 'tbl.delCol', 'tbl.header', 'tbl.sortAsc', 'tbl.toText', 'tbl.delete')} /></Group>}
        <Group title={`Shapes (${SHAPE_COUNT})`}><ShapeGallery store={s} /></Group>
        <Group title="Text"><List_ store={s} tools={[{ id: 'ins.link', icon: Link2 }, { id: 'ins.bookmark', icon: Bookmark }, { id: 'ins.date' }, { id: 'ins.time' }, { id: 'ins.textToTable' }]} /></Group>
        <Group title="Page parts"><List_ store={s} tools={ids('ins.cover', 'ins.header', 'ins.footer', 'ins.pageNum', 'ins.pageNumTop')} /></Group>
      </>
    ),
  },
  { id: 'page', label: 'Page', icon: Columns2, body: (s) => <PageControls store={s} /> },
  {
    id: 'refs', label: 'Sources', icon: Quote,
    body: (s) => (
      <>
        <Group title="Contents"><List_ store={s} tools={ids('ins.toc', 'ref.figures', 'ins.refresh')} /></Group>
        <Group title="Notes"><List_ store={s} tools={ids('ins.footnote', 'ins.endnote')} /></Group>
        <Group title="Citations"><List_ store={s} tools={ids('ref.sources', 'ref.cite', 'ref.bibliography', 'ref.style')} /></Group>
        <Group title="Links inside the document"><List_ store={s} tools={ids('ins.caption', 'ref.cross')} /></Group>
        <Group title="Index"><List_ store={s} tools={ids('ref.mark', 'ref.index')} /></Group>
        <Group title="Legal"><List_ store={s} tools={ids('ref.markAuth', 'ref.authorities')} /></Group>
      </>
    ),
  },
  {
    id: 'review', label: 'Review', icon: MessageSquare,
    body: (s) => (
      <>
        <Group title="Changes"><List_ store={s} tools={ids('rev.track', 'rev.changes', 'rev.accept', 'rev.reject', 'rev.acceptAll', 'rev.rejectAll', 'rev.compare')} /></Group>
        <Group title="Comments"><List_ store={s} tools={ids('ins.comment', 'rev.comments')} /></Group>
        <Group title="Check"><List_ store={s} tools={ids('rev.spell', 'rev.thesaurus', 'rev.translate', 'rev.language', 'rev.proofToggle', 'rev.autocorrect', 'rev.words', 'rev.count', 'rev.a11y', 'rev.read', 'rev.dictate', 'rev.protect', 'rev.allowEdit')} /></Group>
      </>
    ),
  },
  { id: 'mail', label: 'Mail', icon: Mail, body: (s) => <Group title="Personal copies"><List_ store={s} tools={ids('mail.source', 'mail.pane', 'mail.merge', 'mail.envelope', 'mail.labels')} /></Group> },
  {
    id: 'view', label: 'View', icon: Eye,
    body: (s) => (
      <>
        <Group title="Show"><List_ store={s} tools={[{ id: 'view.print', icon: ScanText }, { id: 'view.read', icon: BookOpen }, { id: 'view.reader' }, { id: 'view.web' }, { id: 'view.draft' }, { id: 'pane.nav', icon: ListTree }, { id: 'par.marks' }, { id: 'view.ruler' }, { id: 'view.grid' }, { id: 'view.twoUp' }, { id: 'view.split' }, { id: 'view.newWindow' }]} /></Group>
        <Group title="Markup"><div className="seg wrap">{([['All', 'all', MessagesSquare], ['Simple', 'simple', MessageSquare], ['None', 'none', EyeOff], ['Original', 'original', FileClock]] as const).map(([l, m, I]) => <button key={m} className={`pick${s.view.markup === m ? ' on' : ''}`} aria-pressed={s.view.markup === m} onClick={() => s.setView({ markup: m })}><I size={16} strokeWidth={S} aria-hidden="true" />{l}</button>)}</div></Group>
        <Group title="Screen"><List_ store={s} tools={ids('view.zoomIn', 'view.zoomOut', 'view.zoom100', 'view.dark', 'view.uiLang')} /></Group>
      </>
    ),
  },
];

export const Rail = ({ store }: { store: EditorStore }) => {
  const [open, setOpen] = useState<string | null>(() => (matchMedia('(pointer: coarse)').matches ? null : 'write'));
  const cur = SECTIONS.find((s) => s.id === open);
  return (
    <>
      <nav className="rail" aria-label="Tools">
        {SECTIONS.map((s) => (
          <button key={s.id} className={open === s.id ? 'on' : ''} aria-pressed={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <s.icon size={19} strokeWidth={S} /><span>{s.label}</span>
          </button>
        ))}
      </nav>
      {cur && (
        <aside className="toolpanel" aria-label={cur.label}>
          <div className="phead"><h2>{cur.label}</h2><button className="ico" aria-label="Close panel" onClick={() => setOpen(null)}><PanelLeftClose size={16} strokeWidth={S} /></button></div>
          <div className="pbody">{cur.body(store)}</div>
        </aside>
      )}
    </>
  );
};
