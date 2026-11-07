# Agent server

`clerdodraft mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over
standard input and output, so AI agents and assistants can open, read, edit and save documents the
way a person does in the app. It uses the same file code as the app, so what an agent saves opens
the same way everywhere.

## Connecting a client

Most clients take a command to start. For example, in a client's MCP settings file:

```json
{
  "mcpServers": {
    "clerdodraft": {
      "command": "node",
      "args": ["/path/to/clerdodraft-cli-0.6.0.mjs", "mcp"]
    }
  }
}
```

## Tools

Documents are addressed by the id `open_document` or `new_document` returns. Blocks of the main
text are addressed by index, which `get_outline` lists.

| Tool | What it does |
|---|---|
| `open_document` | Opens `.docx`, `.doc`, `.odt`, `.rtf`, `.pdf`, `.md`, `.html` or `.txt` (with `password` for protected files) |
| `new_document` | Starts an empty document or one from a template |
| `list_templates` | Lists the templates |
| `get_outline` | Every block with its index, kind, style and the start of its text |
| `read_document` | The full text of a range of blocks |
| `document_info` | Counts, fonts and properties |
| `find_text` | Finds text, also inside tables |
| `replace_text` | Replaces text and keeps its formatting; `track_author` records a tracked change |
| `insert_markdown` | Inserts Markdown as real headings, lists, tables and formatting |
| `insert_paragraphs` | Inserts paragraphs with a style and alignment |
| `insert_table` | Inserts a table from rows of cell text |
| `update_paragraph` | Changes one paragraph's text, style or alignment |
| `format_text` | Bold, italic, underline, strike, color, highlight, size or font for a block or text in it |
| `delete_blocks` | Deletes a range of blocks |
| `add_comment` | Adds a comment to a paragraph or text in it |
| `list_comments` | Lists comments and the text they point to |
| `resolve_changes` | Accepts or rejects every tracked change |
| `list_styles` | Lists paragraph and character styles |
| `save_document` | Saves as `.docx`, `.odt`, `.rtf`, `.html`, `.md` or `.txt`, with an optional password for `.docx` |
| `close_document` | Forgets an open document |

Errors come back as tool results with `isError`, written so the agent can correct itself, for
example "There is no block 9. The document has 6 blocks (0 to 5)."

## A typical session

1. `new_document` with `{"template": "report"}`
2. `get_outline` to see where things are
3. `insert_markdown` with the new sections
4. `replace_text` with `track_author` so a person can review the edits
5. `save_document` with `{"path": "report.docx"}`

Calls run one at a time, in the order they arrive.
