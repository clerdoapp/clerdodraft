# Contributor rules

These apply to people and to automated agents working in this repository.

## Legal
- Write everything from public specifications (ECMA-376, ISO 26300, the RTF and PDF specifications) and your own design.
- Copy nothing from other companies' software, documents, help text, icons, templates or fonts.
- Add no GPL or AGPL code. New dependencies must be MIT, BSD, ISC, Apache-2.0 or similar, and go in `NOTICE` and `ASSETS.md`.
- The app and this repository don't name other word processors or their makers. Use neutral words such as "other apps".

## Interface
- ClerdoDraft has its own layout: a rail, a tool panel, and side panes. Don't add a tabbed strip of tools.
- Interface text is plain and short. Say what a control does.

## Code
- TypeScript in strict mode. Keep the layers in [docs/architecture.md](docs/architecture.md).
- The document model is immutable. Change it through `src/core/ops.ts`, and commit with `store.commit`.
- Add comments only when the reason isn't clear from the code.
- Every file reader treats its input as untrusted: no `eval`, no remote fetches, and only `https:`, `mailto:` and `#` links.
- Keep unknown `.docx` content on save.

## Before you open a pull request
```bash
npm run typecheck
npm test
npm run build
npm run e2e
```
New file-format work needs a save-and-reopen test in `tests/`.
