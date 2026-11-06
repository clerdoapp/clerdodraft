// ClerdoDraft document model. All lengths are points unless noted. Documents are immutable:
// every edit produces a new tree that shares unchanged nodes, which gives undo and layout caching.

export type Id = string;

let counter = 0;
export const newId = (): Id => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

export type UnderlineKind = 'single' | 'double' | 'thick' | 'dotted' | 'dashed' | 'wave' | 'words';

export interface BorderLine {
  style: string; // single, double, dotted, dashed, thick, nil...
  width: number;
  color?: string;
  space?: number;
}

export interface RunProps {
  charStyle?: string;
  font?: string;
  fontCs?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: UnderlineKind | 'none';
  underlineColor?: string;
  strike?: boolean;
  doubleStrike?: boolean;
  color?: string; // #rrggbb
  highlight?: string; // #rrggbb
  shading?: string;
  caps?: boolean;
  smallCaps?: boolean;
  vertAlign?: 'super' | 'sub';
  spacing?: number;
  position?: number;
  scale?: number; // percent
  hidden?: boolean;
  rtl?: boolean;
  lang?: string;
  outline?: boolean;
  shadow?: boolean;
  emboss?: boolean;
  imprint?: boolean;
  border?: BorderLine;
}

export type Align = 'left' | 'center' | 'right' | 'justify' | 'distribute';
export type LineRule = 'auto' | 'exact' | 'atLeast';

export interface TabStop {
  pos: number;
  kind: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear';
  leader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'middleDot' | 'heavy';
}

export interface ParaBorders {
  top?: BorderLine;
  bottom?: BorderLine;
  left?: BorderLine;
  right?: BorderLine;
  between?: BorderLine;
}

export interface ParaProps {
  style?: string;
  align?: Align;
  indentLeft?: number;
  indentRight?: number;
  firstLine?: number; // negative means hanging
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: { rule: LineRule; value: number }; // auto: multiple; exact/atLeast: points
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  outlineLevel?: number;
  numbering?: { numId: string; level: number };
  tabs?: TabStop[];
  borders?: ParaBorders;
  shading?: string;
  bidi?: boolean;
  contextualSpacing?: boolean;
  suppressLineNumbers?: boolean;
  suppressHyphenation?: boolean;
  dropCap?: { kind: 'drop' | 'margin'; lines: number };
}

export interface Revision {
  id: string;
  author: string;
  date: string; // ISO 8601
}

export type WrapKind = 'inline' | 'square' | 'tight' | 'through' | 'topBottom' | 'behind' | 'front';

export interface FloatPlacement {
  relH: 'page' | 'margin' | 'column' | 'character';
  relV: 'page' | 'margin' | 'paragraph' | 'line';
  x: number;
  y: number;
  alignH?: 'left' | 'center' | 'right';
  alignV?: 'top' | 'center' | 'bottom';
  distL?: number;
  distR?: number;
  distT?: number;
  distB?: number;
}

export interface ImageAtom {
  kind: 'image';
  media: string; // key in doc.media
  width: number;
  height: number;
  alt?: string;
  wrap: WrapKind;
  float?: FloatPlacement;
  rotation?: number;
}

export type FieldKind = 'page' | 'numpages' | 'date' | 'time' | 'author' | 'title' | 'section' | 'seq' | 'ref' | 'merge' | 'other';

export interface FieldAtom {
  kind: 'field';
  field: FieldKind;
  instr: string; // full field code, e.g. "PAGE \* MERGEFORMAT"
  result: string; // cached result
  locked?: boolean;
}

export interface NoteRefAtom {
  kind: 'footnote' | 'endnote';
  id: string;
}

export interface EquationAtom {
  kind: 'equation';
  source: string; // linear text form shown and edited in the app
  omml?: string; // original m:oMath xml, kept verbatim when untouched
  display?: boolean;
}

export interface ShapeAtom {
  kind: 'shape';
  shape: string; // rect, roundRect, ellipse, line, arrow, textbox...
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textId?: string; // key in doc.boxes when the shape holds text
  wrap: WrapKind;
  float?: FloatPlacement;
  xml?: string; // original drawing xml when imported
}

export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut';

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartAtom {
  kind: 'chart';
  chart: ChartKind;
  stacked?: boolean;
  title?: string;
  categories: string[];
  series: ChartSeries[];
  width: number;
  height: number;
  alt?: string;
  wrap: WrapKind;
  float?: FloatPlacement;
  xml?: string; // original drawing, used until the chart is edited
}

export type DrawingAtom = ImageAtom | ShapeAtom | ChartAtom;

export interface DiagramShape {
  x: number;
  y: number;
  w: number;
  h: number;
  prst: string;
  fill?: string;
  stroke?: string;
  text?: string;
  color?: string;
  size?: number;
}

export interface CheckboxAtom {
  kind: 'checkbox';
  checked: boolean;
}

// Content we do not model yet. Kept verbatim so saving never loses it.
export interface RawAtom {
  kind: 'raw';
  xml: string;
  label: string;
  width?: number;
  height?: number;
  shapes?: DiagramShape[]; // drawn in place of the label when the file includes a drawing
}

export type Atom = ImageAtom | FieldAtom | NoteRefAtom | EquationAtom | ShapeAtom | ChartAtom | CheckboxAtom | RawAtom;

export const ATOM_CHAR = '￼';

// In run text: \t tab, \n line break, \f page break, \v column break.
// An atom run has text === ATOM_CHAR. Paragraph offsets count UTF-16 units over all runs.
export interface Run {
  text: string;
  props: RunProps;
  atom?: Atom;
  link?: { href?: string; anchor?: string; tooltip?: string };
  ins?: Revision;
  del?: Revision;
  fmtRev?: { rev: Revision; old: RunProps }; // tracked formatting change
  comments?: string[];
}

export interface Bookmark {
  name: string;
  start: number;
  end: number;
}

export interface Paragraph {
  type: 'p';
  id: Id;
  props: ParaProps;
  runs: Run[];
  markProps?: RunProps; // formatting of the paragraph mark, used when empty
  bookmarks?: Bookmark[];
  section?: Section; // a section ends with this paragraph
  markIns?: Revision; // tracked paragraph split
  markDel?: Revision; // tracked paragraph merge
  tocEntry?: boolean; // generated by a table of contents
  generated?: 'bibliography' | 'figures' | 'index' | 'authorities'; // rebuilt by Refresh
}

export interface CellProps {
  width?: number;
  gridSpan?: number;
  vMerge?: 'restart' | 'continue';
  vAlign?: 'top' | 'center' | 'bottom';
  borders?: TableBorders;
  shading?: string;
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
  textDirection?: string;
}

export interface TableCell {
  id: Id;
  props: CellProps;
  blocks: Block[]; // always at least one paragraph
}

export interface RowProps {
  height?: number;
  heightRule?: 'auto' | 'exact' | 'atLeast';
  header?: boolean;
  cantSplit?: boolean;
}

export interface TableRow {
  id: Id;
  props: RowProps;
  cells: TableCell[];
}

export interface TableBorders {
  top?: BorderLine;
  bottom?: BorderLine;
  left?: BorderLine;
  right?: BorderLine;
  insideH?: BorderLine;
  insideV?: BorderLine;
}

export interface TableProps {
  style?: string;
  width?: { value: number; unit: 'pt' | 'pct' | 'auto' };
  align?: 'left' | 'center' | 'right';
  indent?: number;
  borders?: TableBorders;
  cellMargins?: { top?: number; bottom?: number; left?: number; right?: number };
  fixedLayout?: boolean;
  rtl?: boolean;
  look?: { firstRow?: boolean; lastRow?: boolean; firstColumn?: boolean; lastColumn?: boolean; noHBand?: boolean; noVBand?: boolean };
}

export interface Table {
  type: 'tbl';
  id: Id;
  props: TableProps;
  grid: number[];
  rows: TableRow[];
}

// A block-level element we do not model yet; written back verbatim.
export interface RawBlock {
  type: 'raw';
  id: Id;
  xml: string;
  label: string;
}

export type Block = Paragraph | Table | RawBlock;

export interface HeaderFooterRefs {
  default?: string;
  first?: string;
  even?: string;
}

export interface Section {
  pageWidth: number;
  pageHeight: number;
  landscape?: boolean;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gutter?: number;
  headerDistance: number;
  footerDistance: number;
  columns: { count: number; space: number; separator?: boolean; widths?: { w: number; space: number }[] };
  breakType?: 'nextPage' | 'continuous' | 'evenPage' | 'oddPage' | 'nextColumn';
  headers: HeaderFooterRefs;
  footers: HeaderFooterRefs;
  titlePage?: boolean;
  pageNumbers?: { start?: number; format?: string };
  lineNumbers?: { countBy: number; start?: number; distance?: number; restart?: string };
  pageBorders?: ParaBorders;
  vAlign?: 'top' | 'center' | 'both' | 'bottom';
  bidi?: boolean;
}

export interface NumberingLevel {
  start: number;
  format: string; // decimal, bullet, lowerLetter, upperLetter, lowerRoman, upperRoman, arabicAbjad, none...
  text: string; // e.g. "%1.%2."
  align?: 'left' | 'center' | 'right';
  suffix?: 'tab' | 'space' | 'nothing';
  paraProps?: ParaProps;
  runProps?: RunProps;
  restartAfter?: number;
  legal?: boolean;
}

export interface AbstractNumbering {
  id: string;
  levels: NumberingLevel[];
  multiLevelType?: string;
}

export interface NumberingInstance {
  id: string;
  abstractId: string;
  overrides?: Record<number, { start?: number; level?: NumberingLevel }>;
}

export interface Numbering {
  abstracts: Record<string, AbstractNumbering>;
  instances: Record<string, NumberingInstance>;
}

export interface Style {
  id: string;
  name: string;
  kind: 'paragraph' | 'character' | 'table' | 'numbering';
  basedOn?: string;
  next?: string;
  link?: string;
  isDefault?: boolean;
  quick?: boolean; // shown in the style gallery
  uiPriority?: number;
  hidden?: boolean;
  para?: ParaProps;
  run?: RunProps;
  table?: {
    props?: TableProps;
    cell?: CellProps;
    conditions?: Record<string, { run?: RunProps; para?: ParaProps; cell?: CellProps }>;
  };
}

export interface Styles {
  docDefaults: { run: RunProps; para: ParaProps };
  styles: Record<string, Style>;
  latent?: string; // original w:latentStyles xml, preserved
}

export interface Comment {
  id: string;
  author: string;
  initials?: string;
  date: string;
  blocks: Block[];
  parent?: string; // threaded reply
  resolved?: boolean;
  reactions?: { author: string; kind: string }[];
}

export interface Note {
  id: string;
  blocks: Block[];
  kind?: 'normal' | 'separator' | 'continuationSeparator';
}

export interface MediaItem {
  mime: string;
  data: Uint8Array;
  name?: string;
}

export interface Theme {
  majorFont?: string;
  minorFont?: string;
  majorFontCs?: string;
  minorFontCs?: string;
  colors?: Record<string, string>;
}

export interface DocSettings {
  trackChanges?: boolean;
  evenAndOddHeaders?: boolean;
  defaultTabStop: number;
  compatibilityMode?: number;
  autoHyphenation?: boolean;
  mirrorMargins?: boolean;
  citationStyle?: string;
  pageColor?: string;
  watermark?: { text?: string; image?: string; color?: string; diagonal?: boolean };
  protection?: { kind: 'readOnly' | 'comments' | 'trackedChanges' | 'forms'; hash?: string; salt?: string };
  footnotePosition?: 'pageBottom' | 'beneathText' | 'sectEnd' | 'docEnd';
  endnotePosition?: 'sectEnd' | 'docEnd';
}

export interface DocProperties {
  title?: string;
  subject?: string;
  creator?: string;
  keywords?: string;
  description?: string;
  lastModifiedBy?: string;
  created?: string;
  modified?: string;
  category?: string;
}

// Parts of an imported package that the writer copies through unchanged.
export interface PreservedPackage {
  parts: Record<string, Uint8Array>;
  documentRels: { id: string; type: string; target: string; external?: boolean }[];
  contentTypes?: string;
  rootAttrs?: string;
}

export interface Source {
  tag: string;
  type: string; // Book, JournalArticle, InternetSite, Report, Misc
  title: string;
  authors: string[]; // "Last, First"
  year?: string;
  publisher?: string;
  city?: string;
  journal?: string;
  url?: string;
}

export interface Doc {
  blocks: Block[];
  section: Section; // the final section
  styles: Styles;
  numbering: Numbering;
  headers: Record<string, Block[]>;
  footers: Record<string, Block[]>;
  footnotes: Record<string, Note>;
  endnotes: Record<string, Note>;
  comments: Record<string, Comment>;
  boxes?: Record<string, Block[]>; // text held by shapes
  media: Record<string, MediaItem>;
  theme: Theme;
  settings: DocSettings;
  properties: DocProperties;
  sources?: Source[];
  preserved?: PreservedPackage;
}

export type StoryId = 'body' | `hdr:${string}` | `ftr:${string}` | `fn:${string}` | `en:${string}` | `cmt:${string}` | `box:${string}`;

export interface Pos {
  story: StoryId;
  para: Id;
  offset: number;
}

export interface Selection {
  anchor: Pos;
  focus: Pos;
}

export const para = (runs: Run[] = [], props: ParaProps = {}): Paragraph => ({ type: 'p', id: newId(), props, runs });

export const textRun = (text: string, props: RunProps = {}): Run => ({ text, props });

export const LETTER = { w: 612, h: 792 };
export const A4 = { w: 595.3, h: 841.9 };

export const defaultSection = (): Section => ({
  pageWidth: LETTER.w,
  pageHeight: LETTER.h,
  marginTop: 72,
  marginBottom: 72,
  marginLeft: 72,
  marginRight: 72,
  headerDistance: 36,
  footerDistance: 36,
  columns: { count: 1, space: 36 },
  headers: {},
  footers: {},
});
