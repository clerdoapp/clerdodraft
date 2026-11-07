# Development

You need Node.js 22 or newer.

| Command | What it does |
|---|---|
| `npm ci` | Install dependencies |
| `npm run dev` | Web app with live reload |
| `npm run typecheck` | Type check |
| `npm test` | Unit and file-format tests |
| `npm run build` | Build the web app into `dist` |
| `npm run e2e` | Browser tests, after a build |
| `npm run dist` | Desktop installers for this system, into `release` |
| `npm run cli` | Command-line tool and agent server, into `dist-cli/clerdodraft.mjs` |
| `npm run examples` | Rebuild the sample documents in `examples/` |
| `node scripts/contributors.mjs` | Refresh the contributor counts for the About window |

`npm run e2e` needs Playwright. To include the optional steps, set `SAMPLE_DOCX`, `SAMPLE_PDF` and `SAMPLE_LOCKED` to file paths. `SAMPLE_LOCKED` must use the password `pw`.

Some file-format tests also check files with `soffice` or `msoffcrypto-tool` when those are installed, and skip that part otherwise.

## Releasing

See [releasing.md](releasing.md).
