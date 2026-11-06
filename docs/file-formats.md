# File formats

| Format | Open | Save | Notes |
|---|---|---|---|
| `.docx`, `.docm`, `.dotx` | Yes | `.docx` | Main format. Unknown content is kept |
| `.docx` with a password | Yes | Yes | AES-256 with SHA-512 |
| Signed `.docx` | Yes | Yes | Signatures are checked on open. Saving changes removes them; sign again after editing |
| `.doc` | Yes | No | Text, tables, pictures (in the text and floating), character and paragraph formatting, headings |
| `.odt` | Yes | Yes | Text, styles, lists, tables, pictures |
| `.rtf` | Yes | Yes | Text, formatting, tables, pictures |
| `.pdf` | Yes | Yes | Opens text and pictures. Saves through Print |
| `.html` | Yes | Yes | Scripts and remote content are ignored |
| `.md` | Yes | Yes | Headings, lists, tables, links |
| `.txt` | Yes | Yes | |

Pictures in EMF and WMF format, in any of these files, are drawn on the page and saved unchanged.

Mail merge lists: `.xlsx`, `.ods`, `.csv`, `.tsv`, `.json` and `.vcf`.

Saving a document opened from another format asks for a new `.docx` file, so the original isn't overwritten.
