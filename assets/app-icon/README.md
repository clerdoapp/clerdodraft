# ClerdoDraft app icon

A stack of three pages, the front one with a folded corner and lines of text, on a deep blue tile.

**Palette:**

| Colour | Hex | Used for |
|---|---|---|
| Blue | `#1b46ad` → `#0f2c82` | the tile |
| Light blue | `#a9d5f3` | the back page, folds and text lines |
| Bright blue | `#2c50c6` → `#3f6fe6` | the middle page and the title line |
| Paper | `#eef8fe` | the front page |

**Tile:** `viewBox="0 0 512 512"`, full bleed with rounded corners. The macOS files add the
transparent margin macOS expects (tile = 824/1024 of the canvas); Windows and Linux use the tile
edge to edge.

**Files:**

| File | Used by |
|---|---|
| `clerdodraft.svg` | the source; every other file is made from it |
| `clerdodraft-1024.png` | the desktop builds and the web app |
| `clerdodraft-macos-512.png`, `clerdodraft.icns` | macOS |
| `clerdodraft.ico` | Windows |
| `hicolor/` | Linux icon theme sizes, named `app.clerdo.clerdodraft` |

**Provenance:** the ClerdoDraft icon artwork supplied by Clerdo, redrawn as a vector so every size
stays sharp.
