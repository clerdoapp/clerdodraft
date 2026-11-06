# File formats

| Format | Open | Save | Notes |
|---|---|---|---|
| `.docx`, `.docm`, `.dotx` | Yes | `.docx` | Main format. Unknown content is kept |
| `.docx` with a password | Yes | Yes | AES-256 with SHA-512 |
| `.doc` | Yes | No | Text and tables only |
| `.odt` | Yes | Yes | Text, styles, lists, tables, pictures |
| `.rtf` | Yes | Yes | Text, formatting, tables, pictures |
| `.pdf` | Yes | Yes | Opens as text only. Saves through Print |
| `.html` | Yes | Yes | Scripts and remote content are ignored |
| `.md` | Yes | Yes | Headings, lists, tables, links |
| `.txt` | Yes | Yes | |

Saving a document opened from another format asks for a new `.docx` file, so the original isn't overwritten.
