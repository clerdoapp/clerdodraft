# Architecture

ClerdoDraft is a TypeScript app built with React and Vite. The desktop builds wrap the same code in Electron. It draws its own pages and doesn't use the browser's editing engine.

```
src/core      Document model and edits. No browser code.
src/docx      .docx reader and writer, with its own XML parser.
src/formats   Other file formats and password protection.
src/layout    Line breaking and pagination.
src/editor    Store, input handling, commands.
src/features  Commands grouped by feature.
src/ui        React components.
electron      Desktop window and file access.
```

Each layer only depends on the ones above it in this list.

## Document model
A document is an immutable tree of paragraphs and tables, and a paragraph is a list of runs. Offsets count UTF-16 units. An object in the text, such as a picture or field, takes one character. Unchanged parts of the tree are shared between versions, so undo keeps earlier documents, and layout can cache by paragraph identity.

Positions are `{ story, para, offset }`. A story is the body, or a header, footer, note, comment or text box.

## Layout
`layoutParagraph` breaks a paragraph into lines using measured text, and `paginate.ts` places lines into columns and pages. It handles floats, tables, notes and headers. Results are cached per paragraph, so typing in a 600-page document stays fast. Only pages near the screen are drawn.

## Editing
Lines are drawn as absolutely positioned elements. A hidden text area takes keyboard and language input. The caret, selection and spelling marks come from the drawn text's real positions, so mixed-direction text behaves correctly.

## Commands
Every action is a command in a registry, with an id, label and optional keys. The rail, context menu and command search all use the registry.

## Files
The `.docx` reader keeps anything it doesn't model, as raw XML, and the writer puts it back. Other readers build a document through `src/formats/build.ts` and open as a new document, so Save never overwrites the original in another format.

## Offline
A service worker generated at build time stores every file. Spelling runs in a worker. The word book and PDF reader load only when first needed.
