<p align="center"><img src="assets/clerdodraft-icon.png" width="128" alt="ClerdoDraft icon"></p>

<h1 align="center">ClerdoDraft</h1>

<p align="center"><strong>A free, open-source word processor by Clerdo.</strong><br>
Write, review and lay out real documents, with your files staying on your own device.<br>Windows, macOS, Linux, iPad and the web.</p>

<p align="center">
<a href="https://clerdo.app">Website</a> ·
<a href="https://github.com/clerdoapp/clerdodraft/releases/latest">Download</a> ·
<a href="https://clerdoapp.github.io/clerdodraft/">Open in your browser</a> ·
<a href="LICENSE-MIT">MIT</a> / <a href="LICENSE-APACHE">Apache-2.0</a>
</p>

![ClerdoDraft editing a report](docs/images/editor.png)

## What it does

- **Write:** more than 400 fonts plus every font on your computer, styles, lists, tabs, indents, large first letters, text art with glow, reflection and gradients, right-to-left paragraphs, autocorrect and smart typing.
- **Lay out:** true page layout with sections, columns, headers, footers, footnotes, facing pages, watermarks, page borders, line numbers, automatic hyphens and document themes.
- **Add:** tables with formulas, pictures with crop and adjustments, 20 chart kinds, 52 diagram layouts, about 150 shapes, 2,300 icons, embedded files of any kind, text boxes, drawn equations, pen drawings, online video and audio links, screenshots, fill-in fields, symbols and emoji.
- **Cite:** contents, captions, cross-references, an index, a table of authorities, sources and bibliographies in APA, MLA, Chicago, Harvard and IEEE.
- **Review:** tracked changes including formatting, comments with replies, reactions and filters, document compare, version history, restricted editing, digital signatures, spelling in seven languages and grammar, a built-in word book with meanings and similar words, read aloud and dictation.
- **Mail:** merge from spreadsheets, contacts or data files with rules and a live preview, envelopes and label sheets.
- **Together:** work on one document live, device to device, with no server, or share a document as a link.
- **Read:** page, web, draft and reading views, a focus reader, split view, dark mode and an outline.
- **Files:** opens and saves `.docx`, including password-protected files, and keeps content it doesn't understand instead of dropping it. Also opens `.doc`, `.odt`, `.rtf`, `.pdf`, `.md`, `.html` and `.txt`, and exports `.odt`, `.rtf`, `.pdf`, `.html`, `.md` and `.txt`.
- **Start fast:** 41 templates for letters, résumés, business, school and more.
- **Automation:** a command-line tool converts, merges, compares and signs documents, and an agent server (MCP) lets AI assistants open, edit and save them the way a person does.
- **Languages:** the interface is translated into 19 languages, including Arabic, Persian and Urdu right to left.
- **Private:** no account, no server, no tracking. Spelling and the word book work offline.

The full list, with what is finished and what is basic, is in [docs/FEATURES.md](docs/FEATURES.md).

| Dark mode and word book | Themes | Focus reader |
|---|---|---|
| ![Dark mode with the word book open](docs/images/dark.png) | ![Page panel with document themes](docs/images/page-panel.png) | ![Focus reader on warm paper](docs/images/reader.png) |

| Charts and diagrams | 19 interface languages | Arabic, right to left |
|---|---|---|
| ![Charts and diagrams from the feature tour](docs/images/tour.png) | ![Choosing the interface language](docs/images/languages.png) | ![An Arabic letter with the Arabic interface](docs/images/arabic.png) |

![ClerdoDraft on iPad](docs/images/ipad.png)

## Download

Get the latest build from the [Releases page](https://github.com/clerdoapp/clerdodraft/releases/latest):

| System | File |
|---|---|
| Windows | `.msi` installer, or the portable `.exe` / `.zip` |
| macOS | `.dmg` (Apple Silicon and Intel) |
| Linux | `.AppImage` (any distro), `.deb` (Ubuntu, Debian, Mint), `.rpm` (Fedora, openSUSE) or `.tar.gz` |
| iPad and web | Open [clerdoapp.github.io/clerdodraft](https://clerdoapp.github.io/clerdodraft/) in Safari, then **Share > Add to Home Screen** |

The builds aren't code-signed yet:

- **Windows:** in the SmartScreen warning, click **More info**, then **Run anyway**.
- **macOS:** right-click the app, choose **Open**, then **Open** again.
- **Linux AppImage:** make it executable first (`chmod +x`).

## Command line and agents

Every release includes `clerdodraft-cli-<version>.mjs`, which runs on Node.js 20 or newer:

```sh
node clerdodraft-cli.mjs convert report.doc report.docx
node clerdodraft-cli.mjs merge examples/invitation.docx examples/guests.csv invitations.docx
node clerdodraft-cli.mjs mcp     # agent server for AI assistants
```

[docs/cli.md](docs/cli.md) lists every command, and [docs/mcp.md](docs/mcp.md) the 20 agent tools. Sample documents to try are in [examples](examples).

## Status

ClerdoDraft is in **alpha**. Everyday writing, review and layout work well; it hasn't yet been tested widely on real Windows, macOS and iPad hardware. A few things are limited by the world outside the app:

- font files from other companies can't be included, so their names are drawn with matching open fonts;
- translation of text needs language models built into the device;
- working together connects devices directly, which some office networks block.

[ROADMAP.md](ROADMAP.md) and [docs/gaps.md](docs/gaps.md) track what's next.

## Build from source

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm ci
npm run dev        # web app during development
npm test           # unit and file-format tests
npm run e2e        # browser tests (needs Playwright)
npm run dist       # desktop installers for this system
npm run cli        # command-line tool and agent server, into dist-cli/
npm run examples   # rebuild the sample documents in examples/
```

Installers are built by GitHub Actions: push a tag such as `v0.5.0` that matches `package.json`, and [release.yml](.github/workflows/release.yml) builds every platform and publishes a release. Every push to `main` publishes the web app. **Check for updates** in the app follows the releases of the repository a build was made from.

More: [docs/development.md](docs/development.md) · [docs/architecture.md](docs/architecture.md) · [docs/file-formats.md](docs/file-formats.md) · [docs/releasing.md](docs/releasing.md)

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/clerdoapp/clerdodraft/issues), and pull requests too. Two rules:

- Nothing may be copied from other companies' software, files, text, icons or artwork.
- No GPL or AGPL code.

[CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) have the full contributor rules.

## License

ClerdoDraft is licensed under either the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option. Third-party material and its licences are listed in [NOTICE](NOTICE) and [ASSETS.md](ASSETS.md).
