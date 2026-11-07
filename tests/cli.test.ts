import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankDoc } from '../src/core/defaults';
import { readDocx } from '../src/docx';
import * as edit from '../src/cli/edit';
import { handle } from '../src/cli/mcp';
import { readDocFile, writeDocFile } from '../src/cli/io';
import { main } from '../src/cli/main';
import { toMarkdown } from '../src/formats/plain';

const call = async (name: string, args: Record<string, unknown>) => {
  const r = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, 'test')) as { content: { text: string }[]; isError?: boolean };
  if (r.isError) throw new Error(r.content[0]!.text);
  const t = r.content[0]!.text;
  try { return JSON.parse(t); } catch { return t; }
};

describe('editing without the editor', () => {
  it('builds a document from markdown, edits it and keeps formatting', () => {
    const d = blankDoc();
    edit.insertMarkdown(d, '# Plan\n\nWe meet in **March** and *April*.\n\n1. One\n2. Two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
    const o = edit.outline(d);
    expect(o.map((b) => b.kind)).toEqual(expect.arrayContaining(['heading 1', 'paragraph', 'list item', 'table 2×2']));
    expect(edit.replace(d, 'march', 'May')).toBe(1);
    const p = edit.paraAt(d, 1);
    expect(p.runs.find((r) => r.text === 'May')?.props.bold).toBe(true);
    expect(edit.find(d, 'two').length).toBe(1);
    expect(edit.formatText(d, 1, { color: 'ff0000' }, 'April')).toBe(1);
    expect(toMarkdown(d)).toContain('1. One\n2. Two');
  });

  it('records replacements as tracked changes and resolves them', () => {
    const d = blankDoc();
    edit.insertParagraphs(d, [{ text: 'The old name stays.' }]);
    edit.replace(d, 'old', 'new', { trackAuthor: 'Sara' });
    expect(edit.info(d).trackedChanges).toBe(2);
    expect(edit.resolveAll(d, true)).toBe(2);
    expect(edit.readBlocks(d)).toContain('The new name stays.');
  });

  it('adds comments to text inside a paragraph', () => {
    const d = blankDoc();
    edit.insertParagraphs(d, [{ text: 'Check this figure please.' }]);
    edit.addComment(d, 0, 'Is it right?', 'Omar', 'figure');
    expect(edit.listComments(d)).toEqual([expect.objectContaining({ author: 'Omar', text: 'Is it right?', on: 'figure' })]);
  });

  it('explains wrong indexes and styles', () => {
    const d = blankDoc();
    expect(() => edit.paraAt(d, 9)).toThrow(/no block 9/);
    expect(() => edit.insertParagraphs(d, [{ text: 'x', style: 'Nope' }])).toThrow(/no style/);
  });
});

describe('agent server', () => {
  it('lists tools and edits a document end to end', async () => {
    const list = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'test')) as { tools: { name: string }[] };
    expect(list.tools.length).toBeGreaterThanOrEqual(18);
    const { doc } = await call('new_document', { template: 'memo' });
    await call('insert_markdown', { doc, markdown: '## Decisions\n\n- Ship on **Monday**' });
    await call('insert_table', { doc, rows: [['Owner', 'Task'], ['Sara', 'Release notes']] });
    const found = await call('find_text', { doc, text: 'Monday' });
    expect(found.length).toBe(1);
    await call('add_comment', { doc, index: found[0].index, text: 'Confirm', on: 'Monday' });
    const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
    const path = join(dir, 'memo.docx');
    await call('save_document', { doc, path });
    const back = readDocx(new Uint8Array(readFileSync(path)));
    expect(Object.keys(back.comments).length).toBe(1);
    expect(back.blocks.some((b) => b.type === 'tbl')).toBe(true);
    await expect(call('get_outline', { doc: 'missing' })).rejects.toThrow(/No open document/);
  });
});

describe('command line', () => {
  it('converts between formats and opens files with a password', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-'));
    const src = join(dir, 'in.md');
    writeFileSync(src, '# Hello «name»\n\nDear «name», welcome to «city».\n');
    for (const f of ['docx', 'odt', 'rtf', 'html', 'txt']) expect(await main(['convert', src, join(dir, `out.${f}`)])).toBe(0);
    const html = await readDocFile(join(dir, 'out.html'));
    expect(edit.outline(html)[0]!.kind).toBe('heading 1');
    const d = await readDocFile(join(dir, 'out.docx'));
    await writeDocFile(d, join(dir, 'locked.docx'), { password: 'pw' });
    await expect(readDocFile(join(dir, 'locked.docx'))).rejects.toThrow(/password/);
    expect(edit.readBlocks(await readDocFile(join(dir, 'locked.docx'), 'pw'))).toContain('Hello');
  });
});

describe('contributor names', () => {
  it('reads only the fields people chose, ignoring comments', async () => {
    const { parsePeople } = await import('../src/features/credits');
    const p = parsePeople('# header\n[people.sara-a]\nreal_name = "Sara \\"S\\" Ali" # mine\ndisplay_name = "Sara"\n\n[people.omar]\nsync_github_name = true\nother = "x"\n');
    expect(p).toEqual({ 'sara-a': { real_name: 'Sara "S" Ali', display_name: 'Sara' }, omar: { sync_github_name: true } });
  });
});

describe('reading aloud', () => {
  it('splits long text into short pieces and picks the language from the script', async () => {
    const { speechPieces, speechLang } = await import('../src/features/speech');
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const pieces = speechPieces(long);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.every((p) => p.length <= 180)).toBe(true);
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toBe(long);
    expect(speechPieces('word '.repeat(100)).every((p) => p.length <= 180)).toBe(true);
    expect(speechLang('مرحبا بكم', 'en')).toBe('ar');
    expect(speechLang('Hello', 'en-GB')).toBe('en-GB');
  });
});
