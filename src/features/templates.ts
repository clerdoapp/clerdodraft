import { register } from '../editor/commands';
import { buildTemplate, TEMPLATES } from './templateLibrary';
import type { EditorStore } from '../editor/store';

export const registerTemplates = (): void => {
  register(
    ...TEMPLATES.map((t) => ({ id: `tpl.${t.id}`, label: t.name, group: 'File', run: (s: EditorStore) => { const d = buildTemplate(t.id); if (d) s.load(d, { name: t.name }); } })),
    { id: 'file.templates', label: 'All templates', group: 'File', run: (s) => s.openDialog('templates') },
    { id: 'page.setup', label: 'Custom page setup', group: 'Page', run: (s) => s.openDialog('pageSetup') },
    { id: 'page.watermark', label: 'Watermark', group: 'Page', run: (s) => s.openDialog('watermark') },
    { id: 'page.border', label: 'Page border', group: 'Page', run: (s) => s.openDialog('pageBorder') },
    { id: 'page.lineNumbers', label: 'Line numbers', group: 'Page', run: (s) => s.openDialog('lineNumbers') },
  );
};
