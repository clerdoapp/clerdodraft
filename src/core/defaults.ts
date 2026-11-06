import { defaultSection, para, type Doc, type ParaProps, type RunProps, type Style, type Styles } from './model';

const st = (id: string, name: string, kind: Style['kind'], extra: Partial<Style> = {}): Style => ({ id, name, kind, ...extra });

const heading = (level: number, size: number, color: string, before: number, after: number): Style =>
  st(`Heading${level}`, `Heading ${level}`, 'paragraph', {
    basedOn: 'Normal',
    next: 'Normal',
    quick: true,
    uiPriority: level + 1,
    para: { keepNext: true, keepLines: true, spaceBefore: before, spaceAfter: after, outlineLevel: level - 1 },
    run: { size, color, bold: level >= 3 ? false : undefined, font: 'Calibri Light' },
  });

export const defaultStyles = (): Styles => {
  const list: Style[] = [
    st('Normal', 'Normal', 'paragraph', { isDefault: true, quick: true, uiPriority: 0 }),
    st('DefaultParagraphFont', 'Default Paragraph Font', 'character', { isDefault: true, hidden: true }),
    st('TableNormal', 'Normal Table', 'table', {
      isDefault: true,
      hidden: true,
      table: { props: { cellMargins: { top: 0, bottom: 0, left: 5.4, right: 5.4 } } },
    }),
    st('NoSpacing', 'No Spacing', 'paragraph', { basedOn: 'Normal', quick: true, uiPriority: 1, para: { spaceAfter: 0, lineSpacing: { rule: 'auto', value: 1 } } }),
    st('Title', 'Title', 'paragraph', { basedOn: 'Normal', next: 'Normal', quick: true, uiPriority: 10, para: { spaceAfter: 4, contextualSpacing: true, lineSpacing: { rule: 'auto', value: 1 } }, run: { size: 28, font: 'Calibri Light', spacing: -0.5 } }),
    st('Subtitle', 'Subtitle', 'paragraph', { basedOn: 'Normal', next: 'Normal', quick: true, uiPriority: 11, run: { size: 14, color: '#595959', spacing: 0.75 } }),
    heading(1, 20, '#1f3a8a', 18, 4),
    heading(2, 16, '#1f3a8a', 8, 4),
    heading(3, 14, '#1f3a8a', 8, 4),
    heading(4, 12, '#1f3a8a', 4, 2),
    heading(5, 11, '#1f3a8a', 4, 2),
    heading(6, 11, '#404040', 2, 0),
    st('Quote', 'Quote', 'paragraph', { basedOn: 'Normal', next: 'Normal', quick: true, uiPriority: 29, para: { indentLeft: 36, indentRight: 36, spaceBefore: 8, align: 'center' }, run: { italic: true, color: '#404040' } }),
    st('IntenseQuote', 'Intense Quote', 'paragraph', { basedOn: 'Normal', next: 'Normal', quick: true, uiPriority: 30, para: { indentLeft: 36, indentRight: 36, spaceBefore: 18, spaceAfter: 18, align: 'center', borders: { top: { style: 'single', width: 0.75, color: '#2347ff', space: 10 }, bottom: { style: 'single', width: 0.75, color: '#2347ff', space: 10 } } }, run: { italic: true, color: '#2347ff' } }),
    st('ListParagraph', 'List Paragraph', 'paragraph', { basedOn: 'Normal', quick: true, uiPriority: 34, para: { indentLeft: 36, contextualSpacing: true } }),
    st('Caption', 'Caption', 'paragraph', { basedOn: 'Normal', next: 'Normal', uiPriority: 35, para: { spaceAfter: 10, lineSpacing: { rule: 'auto', value: 1 } }, run: { italic: true, size: 9, color: '#404040' } }),
    st('TOCHeading', 'TOC Heading', 'paragraph', { basedOn: 'Heading1', next: 'Normal', uiPriority: 39, para: { outlineLevel: 9 } }),
    st('TOC1', 'TOC 1', 'paragraph', { basedOn: 'Normal', next: 'Normal', uiPriority: 39, para: { spaceAfter: 5 } }),
    st('TOC2', 'TOC 2', 'paragraph', { basedOn: 'Normal', next: 'Normal', uiPriority: 39, para: { spaceAfter: 5, indentLeft: 11 } }),
    st('TOC3', 'TOC 3', 'paragraph', { basedOn: 'Normal', next: 'Normal', uiPriority: 39, para: { spaceAfter: 5, indentLeft: 22 } }),
    st('Header', 'Header', 'paragraph', { basedOn: 'Normal', uiPriority: 99, para: { spaceAfter: 0, lineSpacing: { rule: 'auto', value: 1 }, tabs: [{ pos: 234, kind: 'center' }, { pos: 468, kind: 'right' }] } }),
    st('Footer', 'Footer', 'paragraph', { basedOn: 'Normal', uiPriority: 99, para: { spaceAfter: 0, lineSpacing: { rule: 'auto', value: 1 }, tabs: [{ pos: 234, kind: 'center' }, { pos: 468, kind: 'right' }] } }),
    st('FootnoteText', 'Footnote Text', 'paragraph', { basedOn: 'Normal', uiPriority: 99, para: { spaceAfter: 0, lineSpacing: { rule: 'auto', value: 1 } }, run: { size: 10 } }),
    st('EndnoteText', 'Endnote Text', 'paragraph', { basedOn: 'Normal', uiPriority: 99, para: { spaceAfter: 0, lineSpacing: { rule: 'auto', value: 1 } }, run: { size: 10 } }),
    st('FootnoteReference', 'Footnote Reference', 'character', { uiPriority: 99, run: { vertAlign: 'super' } }),
    st('EndnoteReference', 'Endnote Reference', 'character', { uiPriority: 99, run: { vertAlign: 'super' } }),
    st('Strong', 'Strong', 'character', { quick: true, uiPriority: 22, run: { bold: true } }),
    st('Emphasis', 'Emphasis', 'character', { quick: true, uiPriority: 20, run: { italic: true } }),
    st('Hyperlink', 'Hyperlink', 'character', { uiPriority: 99, run: { color: '#2347ff', underline: 'single' } }),
    st('TableGrid', 'Table Grid', 'table', {
      basedOn: 'TableNormal',
      uiPriority: 39,
      table: {
        props: {
          borders: {
            top: { style: 'single', width: 0.5 },
            bottom: { style: 'single', width: 0.5 },
            left: { style: 'single', width: 0.5 },
            right: { style: 'single', width: 0.5 },
            insideH: { style: 'single', width: 0.5 },
            insideV: { style: 'single', width: 0.5 },
          },
        },
      },
    }),
  ];
  const run: RunProps = { font: 'Calibri', fontCs: 'Arial', size: 11, lang: 'en-US' };
  const paragraph: ParaProps = { spaceAfter: 8, lineSpacing: { rule: 'auto', value: 1.08 }, widowControl: true };
  return { docDefaults: { run, para: paragraph }, styles: Object.fromEntries(list.map((s) => [s.id, s])) };
};

export const blankDoc = (): Doc => ({
  blocks: [para()],
  section: defaultSection(),
  styles: defaultStyles(),
  numbering: { abstracts: {}, instances: {} },
  headers: {},
  footers: {},
  footnotes: {},
  endnotes: {},
  comments: {},
  media: {},
  theme: { majorFont: 'Calibri Light', minorFont: 'Calibri' },
  settings: { defaultTabStop: 36 },
  properties: {},
});
