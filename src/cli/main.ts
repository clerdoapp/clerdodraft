import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { blankDoc } from '../core/defaults';
import { writeDocx } from '../docx';
import { compareWith, mergeDocument } from '../features/mailReview';
import { readMailSource } from '../features/mailSources';
import { TEMPLATES, buildTemplate } from '../features/templateLibrary';
import { toText } from '../formats/plain';
import * as edit from './edit';
import { FileError, readDocFile, writeDocFile } from './io';
import { serve } from './mcp';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

const HELP = `ClerdoDraft ${VERSION}, command line

Usage: clerdodraft <command> [options]

Commands:
  convert <in> <out>             Convert between formats; the output extension picks the format
                                 (.docx .odt .rtf .html .md .txt). Opens .doc and .pdf too.
  info <file>                    Words, paragraphs, tables, pictures, comments, changes, fonts
  text <file>                    Print the text
  outline <file>                 Print every block with its index, kind and style
  new <out> [--template <id>]    Make a new document, empty or from a template
  templates                      List the templates
  merge <doc> <list> <out>       Mail merge with a list (.xlsx .ods .csv .tsv .json .vcf);
                                 --each makes one file per record in the folder <out>
  compare <old> <new> <out>      Save the differences as tracked changes (--author <name>)
  replace <in> <find> <with> <out>  Replace text, keeping formatting (--all, --match-case, --track <name>)
  accept <in> <out>              Accept every tracked change (reject with --reject)
  sign <in> <out> --certificate <file.pfx> [--certificate-password <p>] [--purpose <text>]
                                 Sign a .docx file
  new-certificate <out.pfx> --name <name> [--email <address>] [--certificate-password <p>]
                                 Make a personal signing certificate
  verify <file>                  Check the digital signatures of a .docx file
  mcp                            Run the agent server (Model Context Protocol, over stdio)

Options:
  --password <p>                 Open a password-protected .docx
  --save-password <p>            Save a .docx with a password
  --json                         Print info and outline as JSON
  -v, --version                  Print the version
  -h, --help                     Print this help
`;

const parse = (argv: string[]) => {
  const pos: string[] = [];
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h') opts['help'] = true;
    else if (a === '-v') opts['version'] = true;
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
      const takes = ['password', 'save-password', 'template', 'author', 'track', 'certificate', 'certificate-password', 'purpose', 'name', 'email'].includes(k);
      opts[k] = v ?? (takes ? argv[++i] ?? '' : true);
    } else pos.push(a);
  }
  return { pos, opts };
};

const need = (pos: string[], n: number, usage: string): void => { if (pos.length < n) throw new FileError(`Usage: clerdodraft ${usage}`); };

export const main = async (argv: string[]): Promise<number> => {
  const { pos, opts } = parse(argv);
  const [cmd, ...rest] = pos;
  const password = typeof opts['password'] === 'string' ? opts['password'] : undefined;
  const savePassword = typeof opts['save-password'] === 'string' ? opts['save-password'] : undefined;
  const json = !!opts['json'];
  const out = (s: string) => process.stdout.write(s.endsWith('\n') ? s : `${s}\n`);
  if (opts['version']) { out(VERSION); return 0; }
  if (!cmd || opts['help'] || cmd === 'help') { out(HELP); return cmd || opts['help'] ? 0 : 1; }
  switch (cmd) {
    case 'convert': {
      need(rest, 2, 'convert <in> <out>');
      const doc = await readDocFile(rest[0]!, password);
      const f = await writeDocFile(doc, rest[1]!, { password: savePassword });
      out(`Saved ${rest[1]} (${f}).`);
      return 0;
    }
    case 'info': {
      need(rest, 1, 'info <file>');
      const i = edit.info(await readDocFile(rest[0]!, password));
      if (json) out(JSON.stringify(i, null, 2));
      else out(Object.entries(i).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`).padEnd(16)}${Array.isArray(v) ? v.join(', ') : v}`).join('\n'));
      return 0;
    }
    case 'text': {
      need(rest, 1, 'text <file>');
      out(toText(await readDocFile(rest[0]!, password)));
      return 0;
    }
    case 'outline': {
      need(rest, 1, 'outline <file>');
      const o = edit.outline(await readDocFile(rest[0]!, password));
      out(json ? JSON.stringify(o, null, 2) : o.map((b) => `${String(b.index).padStart(4)}  ${b.kind.padEnd(12)} ${b.text}`).join('\n'));
      return 0;
    }
    case 'templates':
      out(TEMPLATES.map((t) => `${t.id.padEnd(22)} ${t.group.padEnd(10)} ${t.name}`).join('\n'));
      return 0;
    case 'new': {
      need(rest, 1, 'new <out> [--template <id>]');
      const id = typeof opts['template'] === 'string' ? opts['template'] : undefined;
      const doc = id ? buildTemplate(id) : blankDoc();
      if (!doc) throw new FileError(`There is no template "${id}". Run: clerdodraft templates`);
      await writeDocFile(doc, rest[0]!, { password: savePassword });
      out(`Saved ${rest[0]}.`);
      return 0;
    }
    case 'merge': {
      need(rest, 3, 'merge <doc> <list> <out> [--each]');
      const doc = await readDocFile(rest[0]!, password);
      const data = readMailSource(new Uint8Array(await readFile(rest[1]!)), rest[1]!);
      if (!data.rows.length) throw new FileError(`${rest[1]} has no records.`);
      if (opts['each']) {
        await mkdir(rest[2]!, { recursive: true });
        const base = basename(rest[0]!, extname(rest[0]!));
        for (let i = 0; i < data.rows.length; i++) await writeFile(join(rest[2]!, `${base}-${String(i + 1).padStart(3, '0')}.docx`), writeDocx(mergeDocument(doc, data, [data.rows[i]!])));
        out(`Saved ${data.rows.length} documents in ${rest[2]}.`);
      } else {
        await writeDocFile(mergeDocument(doc, data), rest[2]!);
        out(`Merged ${data.rows.length} records into ${rest[2]}.`);
      }
      return 0;
    }
    case 'compare': {
      need(rest, 3, 'compare <old> <new> <out>');
      const [a, b] = await Promise.all([readDocFile(rest[0]!, password), readDocFile(rest[1]!, password)]);
      await writeDocFile(compareWith(a, b, typeof opts['author'] === 'string' ? opts['author'] : 'Compare'), rest[2]!);
      out(`Saved the differences as tracked changes in ${rest[2]}.`);
      return 0;
    }
    case 'replace': {
      need(rest, 4, 'replace <in> <find> <with> <out>');
      const doc = await readDocFile(rest[0]!, password);
      const n = edit.replace(doc, rest[1]!, rest[2]!, { all: !!opts['all'], matchCase: !!opts['match-case'], trackAuthor: typeof opts['track'] === 'string' ? opts['track'] : undefined });
      await writeDocFile(doc, rest[3]!, { password: savePassword });
      out(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}; saved ${rest[3]}.`);
      return 0;
    }
    case 'accept': {
      need(rest, 2, 'accept <in> <out> [--reject]');
      const doc = await readDocFile(rest[0]!, password);
      const n = edit.resolveAll(doc, !opts['reject']);
      await writeDocFile(doc, rest[1]!, { password: savePassword });
      out(`${opts['reject'] ? 'Rejected' : 'Accepted'} ${n} changes; saved ${rest[1]}.`);
      return 0;
    }
    case 'sign': {
      need(rest, 2, 'sign <in> <out> --certificate <file.pfx>');
      if (typeof opts['certificate'] !== 'string') throw new FileError('Give the certificate with --certificate <file.pfx>.');
      const { loadCertificate, signPackage } = await import('../formats/sign');
      const signer = loadCertificate(new Uint8Array(await readFile(opts['certificate'])), typeof opts['certificate-password'] === 'string' ? opts['certificate-password'] : '');
      const bytes = writeDocx(await readDocFile(rest[0]!, password));
      await writeFile(rest[1]!, signPackage(bytes, signer, typeof opts['purpose'] === 'string' ? opts['purpose'] : ''));
      out(`Signed and saved ${rest[1]}.`);
      return 0;
    }
    case 'new-certificate': {
      need(rest, 1, 'new-certificate <out.pfx> --name <name>');
      if (typeof opts['name'] !== 'string' || !opts['name']) throw new FileError('Give your name with --name.');
      const { makeCertificate, exportSigner } = await import('../formats/sign');
      const { signer } = makeCertificate(opts['name'], typeof opts['email'] === 'string' ? opts['email'] : '');
      await writeFile(rest[0]!, exportSigner(signer, typeof opts['certificate-password'] === 'string' ? opts['certificate-password'] : ''));
      out(`Saved ${rest[0]}. Keep it private: anyone with it can sign as you.`);
      return 0;
    }
    case 'verify': {
      need(rest, 1, 'verify <file>');
      const { verifyPackage } = await import('../formats/sign');
      const sigs = verifyPackage(new Uint8Array(await readFile(rest[0]!)));
      if (!sigs.length) { out('This document isn\'t signed.'); return 1; }
      for (const s of sigs) out(`${s.valid && s.intact ? 'Valid' : 'NOT valid'}: ${s.signer}${s.purpose ? ` (${s.purpose})` : ''}${s.time ? `, ${s.time}` : ''}${s.intact ? '' : ' — the document changed after signing'}`);
      return sigs.every((s) => s.valid && s.intact) ? 0 : 2;
    }
    case 'mcp':
      serve(VERSION);
      return -1;
    default:
      throw new FileError(`Unknown command "${cmd}". Run: clerdodraft --help`);
  }
};
