import { blankDoc } from '../core/defaults';
import { para, textRun, type Block, type Doc } from '../core/model';
import { createTable } from '../core/ops';
import { register } from '../editor/commands';
import type { EditorStore } from '../editor/store';

const p = (t: string, style?: string) => para(t ? [textRun(t)] : [], style ? { style } : {});

const use2 = (s: EditorStore, name: string, doc: Doc) => s.load(doc, { name });

const use = (s: EditorStore, name: string, blocks: Block[]) => s.load({ ...blankDoc(), blocks }, { name });

const table = (rows: string[][]): Block => {
  const t = createTable(rows.length, rows[0]!.length, 468);
  return { ...t, rows: t.rows.map((r, i) => ({ ...r, cells: r.cells.map((c, k) => ({ ...c, blocks: [para([textRun(rows[i]![k]!, i === 0 ? { bold: true } : {})])] })) })) };
};
const today = (): string => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const registerTemplates = (): void => {
  register(
    { id: 'tpl.invoice', label: 'Invoice', group: 'File', run: (s) => use(s, 'Invoice', [p('Invoice', 'Title'), p('Your business name'), p('Your address'), p(`Date: ${today()}`), p('Invoice number: 001'), p(''), p('Bill to', 'Heading2'), p('Customer name'), p('Customer address'), p(''), table([['Item', 'Quantity', 'Price', 'Total'], ['Description', '1', '0.00', '0.00'], ['Description', '1', '0.00', '0.00'], ['', '', 'Total', '0.00']]), p(''), p('Thank you for your business.')]) },
    { id: 'tpl.cover', label: 'Cover letter', group: 'File', run: (s) => use(s, 'Cover letter', [p('Your name', 'Title'), p('City · Phone · Email', 'Subtitle'), p(today()), p(''), p('Dear hiring manager,'), p('Say which role you are applying for and why it interests you.'), p('Describe one or two things you have done that fit the role.'), p('Close by saying when you can talk.'), p(''), p('Sincerely,'), p('Your name')]) },
    { id: 'tpl.agenda', label: 'Agenda', group: 'File', run: (s) => use(s, 'Agenda', [p('Meeting agenda', 'Title'), p(today(), 'Subtitle'), table([['Time', 'Topic', 'Lead'], ['9:00', 'Welcome', ''], ['9:15', 'Updates', ''], ['9:45', 'Decisions', ''], ['10:15', 'Next steps', '']])]) },
    { id: 'tpl.essay', label: 'Essay', group: 'File', run: (s) => use(s, 'Essay', [p('Essay title', 'Title'), p('Your name · Course · Date', 'Subtitle'), p('Introduction', 'Heading1'), p('State your main idea here.'), p('Argument', 'Heading1'), p('Give your reasons and evidence.'), p('Conclusion', 'Heading1'), p('Bring your points together.')]) },
    { id: 'tpl.plan', label: 'Project plan', group: 'File', run: (s) => use(s, 'Project plan', [p('Project plan', 'Title'), p('Goal', 'Heading1'), p('What this project will achieve.'), p('Timeline', 'Heading1'), table([['Stage', 'Owner', 'Start', 'End'], ['Plan', '', '', ''], ['Build', '', '', ''], ['Review', '', '', ''], ['Finish', '', '', '']]), p(''), p('Risks', 'Heading1'), p('What could go wrong, and what you will do about it.')]) },
    { id: 'tpl.newsletter', label: 'Newsletter', group: 'File', run: (s) => { const d = blankDoc(); use2(s, 'Newsletter', { ...d, section: { ...d.section, columns: { count: 2, space: 24, separator: true } }, blocks: [p('Newsletter title', 'Title'), p('Main story', 'Heading1'), p('Start with your biggest news of the month.'), p('Second story', 'Heading1'), p('Add another story here.'), p('Dates to remember', 'Heading1'), p('List upcoming events.')] }); } },
    { id: 'tpl.letter', label: 'Letter', group: 'File', run: (s) => use(s, 'Letter', [p('Your name'), p('Your address'), p(''), p(new Date().toLocaleDateString()), p(''), p('Dear reader,'), p('Write your message here.'), p('Sincerely,'), p(''), p('Your name')]) },
    { id: 'tpl.report', label: 'Report', group: 'File', run: (s) => use(s, 'Report', [p('Report title', 'Title'), p('A short summary line', 'Subtitle'), p('Summary', 'Heading1'), p('State the main finding first.'), p('Background', 'Heading1'), p('Explain what led to this work.'), p('Findings', 'Heading1'), p('Describe what you found.'), p('Next steps', 'Heading1'), p('List what happens now.')]) },
    { id: 'tpl.resume', label: 'Résumé', group: 'File', run: (s) => use(s, 'Résumé', [p('Your name', 'Title'), p('City · Phone · Email', 'Subtitle'), p('Experience', 'Heading1'), p('Role, Company, Years'), p('What you achieved, with numbers.'), p('Education', 'Heading1'), p('Degree, School, Year'), p('Skills', 'Heading1'), p('Your main skills.')]) },
    { id: 'tpl.notes', label: 'Meeting notes', group: 'File', run: (s) => use(s, 'Meeting notes', [p('Meeting notes', 'Title'), p(new Date().toLocaleDateString(), 'Subtitle'), p('Attendees', 'Heading2'), p(''), p('Decisions', 'Heading2'), p(''), p('Actions', 'Heading2'), p('')]) },
    { id: 'page.setup', label: 'Custom page setup', group: 'Page', run: (s) => s.openDialog('pageSetup') },
    { id: 'page.watermark', label: 'Watermark', group: 'Page', run: (s) => s.openDialog('watermark') },
    { id: 'page.border', label: 'Page border', group: 'Page', run: (s) => s.openDialog('pageBorder') },
    { id: 'page.lineNumbers', label: 'Line numbers', group: 'Page', run: (s) => s.openDialog('lineNumbers') },
  );
};
