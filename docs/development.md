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

`npm run e2e` needs Playwright. To include the optional steps, set `SAMPLE_DOCX`, `SAMPLE_PDF` and `SAMPLE_LOCKED` to file paths. `SAMPLE_LOCKED` must use the password `pw`.

Some file-format tests also check files with `soffice` or `msoffcrypto-tool` when those are installed, and skip that part otherwise.

## Releasing
1. Set `version` in `package.json` and `package-lock.json`, and add to `CHANGELOG.md`.
2. Commit to `main` and push. The web app publishes from `main`.
3. Tag and push: `git tag v0.4.0 && git push origin v0.4.0`.

The tag starts `release.yml`, which builds Windows, macOS and Linux and publishes the release.

GitHub retires old build machines. If a platform's job fails right away, check its `runs-on` label first.
