import { createInterface } from 'node:readline';
import { blankDoc } from '../core/defaults';
import type { Doc, RunProps } from '../core/model';
import { TEMPLATES, buildTemplate } from '../features/templateLibrary';
import * as edit from './edit';
import { FORMATS, readDocFile, writeDocFile } from './io';

// A Model Context Protocol server over standard input and output, so AI agents can read and edit documents.

const PROTOCOL = '2025-06-18';

interface Tool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

const open = new Map<string, { doc: Doc; path?: string }>();
let counter = 0;

const docArg = { doc: { type: 'string', description: 'Document id returned by open_document or new_document.' } };
const indexArg = (what = 'Block index from get_outline.') => ({ type: 'integer', minimum: 0, description: what });
const afterArg = { after: { type: 'integer', minimum: -1, description: 'Insert after this block index. -1 puts it at the start; leave it out to add at the end.' } };

const get = (args: Record<string, unknown>) => {
  const id = String(args['doc'] ?? '');
  const hit = open.get(id);
  if (!hit) throw new edit.EditError(`No open document "${id}". Open one with open_document or new_document.`);
  return hit;
};
const num = (v: unknown, name: string): number => { if (typeof v !== 'number' || !Number.isInteger(v)) throw new edit.EditError(`${name} must be a whole number.`); return v; };
const opt = (v: unknown): number | undefined => (v === undefined || v === null ? undefined : num(v, 'after'));
const str = (v: unknown, name: string): string => { if (typeof v !== 'string') throw new edit.EditError(`${name} must be text.`); return v; };

const keep = (doc: Doc, path?: string): string => { const id = `doc${++counter}`; open.set(id, { doc, path }); return id; };

const summary = (id: string) => {
  const { doc, path } = open.get(id)!;
  return { doc: id, path, ...edit.info(doc), blocks: doc.blocks.length };
};

const runPatch = (a: Record<string, unknown>): RunProps => {
  const p: RunProps = {};
  if (typeof a['bold'] === 'boolean') p.bold = a['bold'];
  if (typeof a['italic'] === 'boolean') p.italic = a['italic'];
  if (typeof a['underline'] === 'boolean') p.underline = a['underline'] ? 'single' : undefined;
  if (typeof a['strike'] === 'boolean') p.strike = a['strike'];
  if (typeof a['color'] === 'string') p.color = a['color'].replace(/^#/, '');
  if (typeof a['highlight'] === 'string') p.highlight = a['highlight'];
  if (typeof a['size'] === 'number') p.size = a['size'];
  if (typeof a['font'] === 'string') p.font = a['font'];
  return p;
};

export const TOOLS: Tool[] = [
  {
    name: 'open_document',
    description: 'Open a document from disk (.docx, .doc, .odt, .rtf, .pdf, .md, .html or .txt). Returns its id and a summary.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, password: { type: 'string', description: 'Only for password-protected .docx files.' } }, required: ['path'] },
    run: async (a) => summary(keep(await readDocFile(str(a['path'], 'path'), a['password'] as string | undefined), String(a['path']))),
  },
  {
    name: 'new_document',
    description: 'Start a new document, empty or from a template (see list_templates).',
    inputSchema: { type: 'object', properties: { template: { type: 'string', description: 'Template id.' } } },
    run: (a) => {
      const t = a['template'] ? buildTemplate(String(a['template'])) : blankDoc();
      if (!t) throw new edit.EditError(`There is no template "${String(a['template'])}". Use list_templates.`);
      return summary(keep(t));
    },
  },
  {
    name: 'list_templates',
    description: 'List the templates new_document can start from.',
    inputSchema: { type: 'object', properties: {} },
    run: () => TEMPLATES.map((t) => ({ id: t.id, name: t.name, group: t.group })),
  },
  {
    name: 'get_outline',
    description: 'List every block of the main text with its index, kind (heading, paragraph, list item, table), style and the start of its text. Use the indexes with the other tools.',
    inputSchema: { type: 'object', properties: { ...docArg }, required: ['doc'] },
    run: (a) => edit.outline(get(a).doc),
  },
  {
    name: 'read_document',
    description: 'Read the full text of a range of blocks, each line starting with its index.',
    inputSchema: { type: 'object', properties: { ...docArg, from: indexArg('First block, 0 by default.'), to: indexArg('Last block, the end by default.') }, required: ['doc'] },
    run: (a) => { const d = get(a).doc; return edit.readBlocks(d, (a['from'] as number) ?? 0, (a['to'] as number) ?? d.blocks.length - 1); },
  },
  {
    name: 'document_info',
    description: 'Word count, paragraphs, tables, pictures, comments, tracked changes, fonts and properties.',
    inputSchema: { type: 'object', properties: { ...docArg }, required: ['doc'] },
    run: (a) => edit.info(get(a).doc),
  },
  {
    name: 'find_text',
    description: 'Find text anywhere in the main text, including tables. Returns the block index and the surrounding text of each match.',
    inputSchema: { type: 'object', properties: { ...docArg, text: { type: 'string' }, match_case: { type: 'boolean' } }, required: ['doc', 'text'] },
    run: (a) => edit.find(get(a).doc, str(a['text'], 'text'), !!a['match_case']),
  },
  {
    name: 'replace_text',
    description: 'Replace text, keeping the formatting around it. Set track_author to record the change as a tracked change by that person.',
    inputSchema: { type: 'object', properties: { ...docArg, find: { type: 'string' }, replace: { type: 'string' }, all: { type: 'boolean', description: 'Replace every match, not just the first.' }, match_case: { type: 'boolean' }, index: indexArg('Only replace inside this block.'), track_author: { type: 'string' } }, required: ['doc', 'find', 'replace'] },
    run: (a) => ({ replaced: edit.replace(get(a).doc, str(a['find'], 'find'), str(a['replace'], 'replace'), { all: !!a['all'], matchCase: !!a['match_case'], index: a['index'] as number | undefined, trackAuthor: a['track_author'] as string | undefined }) }),
  },
  {
    name: 'insert_markdown',
    description: 'Insert content written in Markdown: # headings, lists, tables, **bold**, *italic* and links become real document formatting. The best way to add longer content.',
    inputSchema: { type: 'object', properties: { ...docArg, markdown: { type: 'string' }, ...afterArg }, required: ['doc', 'markdown'] },
    run: (a) => edit.insertMarkdown(get(a).doc, str(a['markdown'], 'markdown'), opt(a['after'])),
  },
  {
    name: 'insert_paragraphs',
    description: 'Insert paragraphs, each with an optional style (for example "Heading 1", "Title", "Quote") and alignment.',
    inputSchema: {
      type: 'object',
      properties: { ...docArg, ...afterArg, paragraphs: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, style: { type: 'string' }, bold: { type: 'boolean' }, italic: { type: 'boolean' }, align: { enum: ['left', 'center', 'right', 'both'] } }, required: ['text'] } } },
      required: ['doc', 'paragraphs'],
    },
    run: (a) => ({ at: edit.insertParagraphs(get(a).doc, a['paragraphs'] as edit.NewParagraph[], opt(a['after'])) }),
  },
  {
    name: 'insert_table',
    description: 'Insert a table from rows of cell text. The first row is a header row unless header is false.',
    inputSchema: { type: 'object', properties: { ...docArg, ...afterArg, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } }, header: { type: 'boolean' } }, required: ['doc', 'rows'] },
    run: (a) => ({ at: edit.insertTable(get(a).doc, a['rows'] as string[][], opt(a['after']), a['header'] !== false) }),
  },
  {
    name: 'update_paragraph',
    description: 'Change the text, style or alignment of one paragraph.',
    inputSchema: { type: 'object', properties: { ...docArg, index: indexArg(), text: { type: 'string' }, style: { type: 'string' }, align: { enum: ['left', 'center', 'right', 'both'] } }, required: ['doc', 'index'] },
    run: (a) => { edit.updateParagraph(get(a).doc, num(a['index'], 'index'), { text: a['text'] as string | undefined, style: a['style'] as string | undefined, align: a['align'] as never }); return { ok: true }; },
  },
  {
    name: 'format_text',
    description: 'Format a whole block, or only the given text inside it: bold, italic, underline, strike, color (hex), highlight (yellow, green, cyan…), size in points, font.',
    inputSchema: { type: 'object', properties: { ...docArg, index: indexArg(), find: { type: 'string' }, match_case: { type: 'boolean' }, bold: { type: 'boolean' }, italic: { type: 'boolean' }, underline: { type: 'boolean' }, strike: { type: 'boolean' }, color: { type: 'string' }, highlight: { type: 'string' }, size: { type: 'number' }, font: { type: 'string' } }, required: ['doc', 'index'] },
    run: (a) => ({ changed: edit.formatText(get(a).doc, num(a['index'], 'index'), runPatch(a), a['find'] as string | undefined, !!a['match_case']) }),
  },
  {
    name: 'delete_blocks',
    description: 'Delete blocks from one index to another, inclusive.',
    inputSchema: { type: 'object', properties: { ...docArg, from: indexArg(), to: indexArg() }, required: ['doc', 'from'] },
    run: (a) => ({ deleted: edit.deleteBlocks(get(a).doc, num(a['from'], 'from'), a['to'] === undefined ? undefined : num(a['to'], 'to')) }),
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a paragraph, or to the given text inside it.',
    inputSchema: { type: 'object', properties: { ...docArg, index: indexArg(), text: { type: 'string' }, on: { type: 'string', description: 'Text inside the paragraph the comment points to.' }, author: { type: 'string' } }, required: ['doc', 'index', 'text'] },
    run: (a) => ({ id: edit.addComment(get(a).doc, num(a['index'], 'index'), str(a['text'], 'text'), (a['author'] as string) || 'Assistant', a['on'] as string | undefined) }),
  },
  {
    name: 'list_comments',
    description: 'List the comments, who wrote them and the text they point to.',
    inputSchema: { type: 'object', properties: { ...docArg }, required: ['doc'] },
    run: (a) => edit.listComments(get(a).doc),
  },
  {
    name: 'resolve_changes',
    description: 'Accept or reject every tracked change in the main text.',
    inputSchema: { type: 'object', properties: { ...docArg, accept: { type: 'boolean' } }, required: ['doc', 'accept'] },
    run: (a) => ({ resolved: edit.resolveAll(get(a).doc, !!a['accept']) }),
  },
  {
    name: 'list_styles',
    description: 'List the paragraph and character styles of the document.',
    inputSchema: { type: 'object', properties: { ...docArg }, required: ['doc'] },
    run: (a) => edit.listStyles(get(a).doc),
  },
  {
    name: 'save_document',
    description: `Save the document. The format comes from the file extension (${FORMATS.join(', ')}). A password only applies to .docx.`,
    inputSchema: { type: 'object', properties: { ...docArg, path: { type: 'string', description: 'Leave out to save over the file it was opened from.' }, password: { type: 'string' } }, required: ['doc'] },
    run: async (a) => {
      const hit = get(a);
      const path = (a['path'] as string | undefined) ?? hit.path;
      if (!path) throw new edit.EditError('This document has no file yet. Give a path.');
      const format = await writeDocFile(hit.doc, path, { password: a['password'] as string | undefined });
      if (format === 'docx') hit.path = path;
      return { saved: path, format };
    },
  },
  {
    name: 'close_document',
    description: 'Forget an open document without saving.',
    inputSchema: { type: 'object', properties: { ...docArg }, required: ['doc'] },
    run: (a) => ({ closed: open.delete(String(a['doc'])) }),
  },
];

interface Request { jsonrpc: '2.0'; id?: number | string; method: string; params?: Record<string, unknown> }

export const handle = async (req: Request, version: string): Promise<unknown> => {
  switch (req.method) {
    case 'initialize':
      return { protocolVersion: (req.params?.['protocolVersion'] as string) ?? PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'clerdodraft', version }, instructions: 'Open or create a document, call get_outline to see block indexes, edit with the other tools, then save_document.' };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case 'tools/call': {
      const name = String(req.params?.['name'] ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
      try {
        const out = await tool.run((req.params?.['arguments'] as Record<string, unknown>) ?? {});
        return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${req.method}`), { code: -32601 });
  }
};

export const serve = (version: string): void => {
  const rl = createInterface({ input: process.stdin });
  const send = (m: unknown) => process.stdout.write(`${JSON.stringify(m)}\n`);
  let queue: Promise<unknown> = Promise.resolve();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let req: Request;
    try { req = JSON.parse(line) as Request; } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    if (req.id === undefined) return; // notifications need no answer
    // Calls run one after another, in the order they arrive.
    queue = queue.then(() => handle(req, version)).then(
      (result) => send({ jsonrpc: '2.0', id: req.id, result }),
      (e: Error & { code?: number }) => send({ jsonrpc: '2.0', id: req.id, error: { code: e.code ?? -32603, message: e.message } }),
    );
  });
};
