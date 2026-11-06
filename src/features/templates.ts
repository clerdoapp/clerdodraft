import { blankDoc } from '../core/defaults';
import { para, textRun } from '../core/model';
import { register } from '../editor/commands';
import type { EditorStore } from '../editor/store';

const p = (t: string, style?: string) => para(t ? [textRun(t)] : [], style ? { style } : {});

const use = (s: EditorStore, name: string, blocks: ReturnType<typeof p>[]) => s.load({ ...blankDoc(), blocks }, { name });

export const registerTemplates = (): void => {
  register(
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
