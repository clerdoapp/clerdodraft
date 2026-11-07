# Command line

`clerdodraft` converts, inspects and edits documents without opening the app. It is one file that
runs on Node.js 20 or newer, attached to every release as `clerdodraft-cli-<version>.mjs`.

```sh
node clerdodraft-cli-0.6.0.mjs --help
```

On macOS and Linux you can make it a command:

```sh
chmod +x clerdodraft-cli-0.6.0.mjs
sudo mv clerdodraft-cli-0.6.0.mjs /usr/local/bin/clerdodraft
```

From a clone, `npm run cli` builds it into `dist-cli/clerdodraft.mjs`.

## Commands

| Command | What it does |
|---|---|
| `convert <in> <out>` | Converts between formats. The output extension picks the format: `.docx`, `.odt`, `.rtf`, `.html`, `.md` or `.txt`. Input can also be `.doc` or `.pdf`. |
| `info <file>` | Words, characters, paragraphs, tables, headings, pictures, comments, tracked changes, footnotes, title, author and fonts. Add `--json` for JSON. |
| `text <file>` | Prints the text. |
| `outline <file>` | Prints every block with its index, kind (heading, paragraph, list item, table) and the start of its text. |
| `new <out> [--template <id>]` | Makes a new document, empty or from a template. |
| `templates` | Lists the 41 templates. |
| `merge <doc> <list> <out>` | Mail merge with a list in `.xlsx`, `.ods`, `.csv`, `.tsv`, `.json` or `.vcf`. `--each` makes one file per record, in the folder `<out>`. |
| `compare <old> <new> <out>` | Saves the differences as tracked changes. `--author <name>` names them. |
| `replace <in> <find> <with> <out>` | Replaces text, keeping its formatting. `--all`, `--match-case`, and `--track <name>` to record it as a tracked change. |
| `accept <in> <out>` | Accepts every tracked change; `--reject` rejects them instead. |
| `sign <in> <out> --certificate <file.pfx>` | Signs a `.docx` file. `--certificate-password` and `--purpose` are optional. |
| `new-certificate <out.pfx> --name <name>` | Makes a personal signing certificate (`--email`, `--certificate-password`). |
| `verify <file>` | Checks the digital signatures. Exits with 0 when every signature is valid. |
| `mcp` | Runs the agent server; see [mcp.md](mcp.md). |

`--password <p>` opens a password-protected `.docx`. `--save-password <p>` saves one.

## Examples

```sh
clerdodraft convert report.doc report.docx
clerdodraft convert notes.md notes.docx
clerdodraft info thesis.docx --json
clerdodraft merge examples/invitation.docx examples/guests.csv invitations --each
clerdodraft replace contract.docx "2025" "2026" contract-v2.docx --all --track "Legal team"
clerdodraft new letter.docx --template formal
```

Exit codes: 0 on success, 1 on an error (the message says why), 2 when `verify` finds a signature
that isn't valid.
