# ClerdoDraft

**A free, open-source word processor by Clerdo.**
It opens and saves `.docx` and keeps your documents on your own device. Windows, macOS, Linux and the web.

## Download

Get the latest build from the Releases page:

| System | File |
|---|---|
| Windows | `.msi` installer, or the portable `.exe` / `.zip` |
| macOS | `.dmg` (Apple Silicon and Intel) |
| Linux | `.AppImage` (any distro), `.deb` (Ubuntu, Debian, Mint), `.rpm` (Fedora, openSUSE) or `.tar.gz` |
| iPad and web | Open the project's GitHub Pages site in Safari, then **Share > Add to Home Screen** |

The builds aren't code-signed yet:

- **Windows:** in the SmartScreen warning, click **More info**, then **Run anyway**.
- **macOS:** right-click the app, choose **Open**, then **Open** again.
- **Linux AppImage:** make it executable first (`chmod +x`).

## Build from source

```bash
npm ci
npm run dev        # web app during development
npm test           # unit and file-format tests
npm run dist       # desktop installers for this system
```

`docs/FEATURES.md` lists what is built. Code is organised as `src/core` (document model and edits), `src/docx` (file format), `src/layout` (page layout), `src/editor` (input and commands), `src/features`, `src/ui`.

Licensed under MIT or Apache-2.0, at your option. See `NOTICE` for bundled material.

## Releasing

Installers are built by GitHub Actions. Push a tag that matches `version` in `package.json`, such as `v0.1.0`: `.github/workflows/release.yml` builds every platform and publishes a release, and `.github/workflows/pages.yml` publishes the web app.
