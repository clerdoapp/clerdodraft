// Builds the sample documents in examples/. Run with: npm run examples
import { mkdirSync, writeFileSync } from 'node:fs';
import { blankDoc } from '../src/core/defaults';
import type { Atom, ChartAtom, Doc, Paragraph, Run, RunProps } from '../src/core/model';
import { ATOM_CHAR, para, textRun } from '../src/core/model';
import { writeDocx } from '../src/docx';
import { diagramAtom } from '../src/features/diagrams';
import { buildTemplate } from '../src/features/templateLibrary';
import * as edit from '../src/cli/edit';

const out = 'examples';
mkdirSync(out, { recursive: true });
const save = (name: string, doc: Doc) => { writeFileSync(`${out}/${name}`, writeDocx(doc)); console.log(`examples/${name}`); };
const atom = (a: Atom, props: RunProps = {}): Run => ({ text: ATOM_CHAR, props, atom: a });
const add = (doc: Doc, ...blocks: Paragraph[]) => { doc.blocks.splice(doc.blocks.length - 1, 0, ...blocks); };
const chart = (c: Partial<ChartAtom> & Pick<ChartAtom, 'chart'>): ChartAtom => ({ kind: 'chart', title: '', categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Sales', values: [42, 55, 61, 78] }, { name: 'Costs', values: [30, 34, 39, 41] }], width: 440, height: 240, wrap: 'inline', legend: 'b', ...c });

// A tour of what the app can put on a page.
const tour = blankDoc();
tour.properties = { ...tour.properties, title: 'ClerdoDraft feature tour', creator: 'Clerdo' };
edit.insertMarkdown(tour, '# A tour of ClerdoDraft\n\nThis document was made with the command-line tool. Open it in ClerdoDraft, or any other word processor, to see each part.');
add(tour, para([textRun('Text effects', { size: 36, bold: true, glow: { color: '#7aa2ff', size: 8 }, color: '2347FF' })], { align: 'center' }));
add(tour, para([textRun('Gradient fill', { size: 28, bold: true, gradient: ['#2347ff', '#e0457b'] }), textRun(' · '), textRun('Outline', { size: 28, bold: true, outline: true, lineColor: '#2347ff' }), textRun(' · '), textRun('Reflection', { size: 28, bold: true, reflect: true, color: '0F6E56' })], { align: 'center' }));
edit.insertMarkdown(tour, '## Charts');
add(tour, para([atom(chart({ chart: 'column', title: 'Sales and costs' }))], { align: 'center' }));
add(tour, para([atom(chart({ chart: 'doughnut', title: 'Where the time goes', categories: ['Writing', 'Review', 'Layout', 'Meetings'], series: [{ name: 'Hours', values: [18, 7, 5, 4] }], width: 300, height: 220 }))], { align: 'center' }));
edit.insertMarkdown(tour, '## Diagrams');
add(tour, para([atom(diagramAtom('process', 'Draft\nReview\nApprove\nPublish', '#2347ff'))], { align: 'center' }));
add(tour, para([atom(diagramAtom('cycle', 'Plan\nWrite\nCheck\nShare', '#0f6e56'))], { align: 'center' }));
edit.insertMarkdown(tour, '## Shapes and equations');
add(tour, para([
  atom({ kind: 'shape', shape: 'star5', width: 72, height: 72, fill: '#FFC83D', stroke: '#B07C00', strokeWidth: 1, wrap: 'inline' }), textRun(' '),
  atom({ kind: 'shape', shape: 'heart', width: 72, height: 64, fill: '#E0457B', wrap: 'inline' }), textRun(' '),
  atom({ kind: 'shape', shape: 'cloudCallout', width: 110, height: 72, fill: '#DCE6FF', stroke: '#2347FF', strokeWidth: 1, wrap: 'inline' }), textRun(' '),
  atom({ kind: 'shape', shape: 'rightArrow', width: 96, height: 48, fill: '#0F6E56', wrap: 'inline' }),
], { align: 'center' }));
add(tour, para([atom({ kind: 'equation', source: 'x = (-b ± √(b^2 - 4ac))/(2a)', display: true })], { align: 'center' }));
edit.insertMarkdown(tour, '## Tables and lists\n\n| Feature | Where | Offline |\n|---|---|---|\n| Spelling | Review | Yes |\n| Word book | Review | Yes |\n| Working together | Share | Device to device |\n\n1. Write the first draft\n2. Ask for comments\n   - from the team\n   - from a reader\n3. Publish\n\n## Right to left\n');
add(tour, para([textRun('يدعم ClerdoDraft الكتابة من اليمين إلى اليسار، مع تدقيق إملائي للعربية وواجهة عربية كاملة.', { rtl: true, font: 'Noto Naskh Arabic', size: 14 })], { bidi: true }));
edit.insertMarkdown(tour, '## Review');
edit.insertParagraphs(tour, [{ text: 'Tracked changes and comments travel with the file, so a reviewer sees exactly what changed.' }]);
const reviewAt = tour.blocks.length - 2;
edit.replace(tour, 'exactly', 'precisely', { index: reviewAt, trackAuthor: 'Sara' });
edit.addComment(tour, reviewAt, 'Nice and short.', 'Omar', 'travel with the file');
save('feature-tour.docx', tour);

// A report with numbers.
const report = buildTemplate('report')!;
add(report, para([atom(chart({ chart: 'line', title: 'Monthly visitors', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [{ name: '2025', values: [12, 14, 13, 17, 19, 22] }, { name: '2026', values: [15, 18, 21, 24, 27, 31] }], markers: true }))], { align: 'center' }));
save('quarterly-report.docx', report);

// Templates that show other kinds of document.
for (const [id, name] of [['arabicLetter', 'arabic-letter.docx'], ['resumeModern', 'resume.docx'], ['newsletter', 'newsletter.docx'], ['paper', 'research-paper.docx'], ['invoice', 'invoice.docx'], ['brochure', 'brochure.docx']] as const) save(name, buildTemplate(id)!);

// Mail merge: a letter with fields and a guest list.
const merge = (name: string): Run => atom({ kind: 'field', field: 'merge', instr: ` MERGEFIELD ${name} `, result: `«${name}»` });
const invite = blankDoc();
invite.blocks = [
  para([textRun('You are invited', { size: 28, bold: true, color: '2347FF' })], { style: 'Title' }),
  para([textRun('Dear '), merge('Name'), textRun(',')]),
  para([textRun('Please join us for the launch of ClerdoDraft in '), merge('City'), textRun(' on '), merge('Date'), textRun('. We kept a seat for you at table '), merge('Table'), textRun('.')]),
  para([textRun('With best wishes,')]),
  para([textRun('The Clerdo team')]),
  invite.blocks[invite.blocks.length - 1]!,
];
save('invitation.docx', invite);
writeFileSync(`${out}/guests.csv`, 'Name,City,Date,Table\nSara Ali,Riyadh,12 December,4\nOmar Haddad,Jeddah,14 December,2\nLina Nasser,Amman,16 December,7\n');
console.log('examples/guests.csv');
