import type { Atom, BorderLine, Doc, DrawingAtom, Id, Paragraph, Run, RunProps, Section, StoryId, Align } from '../core/model';

export interface FontSpec {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
}

export interface FontMetrics {
  ascent: number;
  descent: number;
}

export interface Measurer {
  width(text: string, font: FontSpec): number;
  metrics(font: FontSpec): FontMetrics;
}

export interface Frag {
  kind: 'text' | 'tab' | 'atom' | 'mark';
  from: number;
  to: number;
  text: string;
  width: number;
  run?: Run;
  eff: RunProps;
  font: FontSpec;
  atom?: Atom;
  leader?: string;
}

export interface Line {
  para: Id;
  from: number;
  to: number;
  frags: Frag[];
  indent: number; // text start relative to the column, before alignment
  textWidth: number; // excluding trailing spaces
  avail: number;
  height: number;
  ascent: number;
  descent: number;
  wordSpacing: number;
  align: Align;
  rtl: boolean;
  label?: { text: string; x: number; width: number; advance?: number; eff: RunProps; font: FontSpec };
  breakAfter?: 'page' | 'column';
  noteRefs?: { kind: 'footnote' | 'endnote'; id: string }[];
  floats?: DrawingAtom[];
  isLast: boolean;
  dy?: number; // pushed down by a top-and-bottom wrap
}

export interface PlacedLine extends Line {
  story: StoryId;
  x: number; // left of the text box of the line
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  top?: BorderLine;
  right?: BorderLine;
  bottom?: BorderLine;
  left?: BorderLine;
}

export interface PlacedFloat {
  atom: DrawingAtom;
  para: Id;
  story: StoryId;
  offset: number;
  x: number;
  y: number;
  w: number;
  h: number;
  behind: boolean;
}

export interface Laid {
  lines: PlacedLine[];
  boxes: Box[];
  height: number;
}

export interface Page {
  index: number;
  number: string; // formatted display number
  section: Section;
  sectionIndex: number;
  width: number;
  height: number;
  body: Laid;
  header?: Laid & { story: StoryId };
  footer?: Laid & { story: StoryId };
  notes: PlacedLine[];
  noteBoxes: Box[];
  noteSeparator?: { x: number; y: number; w: number };
  floats: PlacedFloat[];
  lineNumbers: { x: number; y: number; n: number; size: number }[];
  columnRules: { x: number; y: number; h: number }[];
  wordsBefore?: number;
}

export interface LayoutOptions {
  showDeleted: boolean; // show deletions as struck text
  showHidden: boolean;
}

export interface FieldContext {
  page?: string;
  numPages?: number;
  section?: number;
}

export interface LayoutEnv {
  doc: Doc;
  m: Measurer;
  opts: LayoutOptions;
  noteNumber: (kind: 'footnote' | 'endnote', id: string) => string;
  field: FieldContext;
}

export interface ParaLayout {
  para: Paragraph;
  lines: Line[];
  spaceBefore: number;
  spaceAfter: number;
  keepNext: boolean;
  keepLines: boolean;
  pageBreakBefore: boolean;
  widowControl: boolean;
  contextual: boolean;
  style?: string;
  shading?: string;
  borders?: import('../core/model').ParaBorders;
  indentL: number;
  indentR: number;
  volatile: boolean;
}

export interface Layout {
  pages: Page[];
  lineIndex: Map<Id, { page: number; line: PlacedLine }[]>;
  boxes: Map<string, Laid>; // laid out text of shapes, relative to the shape's text area
}
