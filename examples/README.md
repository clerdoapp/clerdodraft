# Examples

Sample documents made by [`scripts/examples.ts`](../scripts/examples.ts) with the command-line
tool's own code. Open any of them in ClerdoDraft, or in another word processor.

| File | Shows |
|---|---|
| [`feature-tour.docx`](feature-tour.docx) | Text effects, charts, diagrams, shapes, an equation, a table, lists, right-to-left text, a tracked change and a comment |
| [`quarterly-report.docx`](quarterly-report.docx) | A report with a line chart |
| [`research-paper.docx`](research-paper.docx) | A paper with headings and references |
| [`resume.docx`](resume.docx) | A modern résumé |
| [`newsletter.docx`](newsletter.docx) | Columns and a masthead |
| [`brochure.docx`](brochure.docx) | A folded brochure layout |
| [`invoice.docx`](invoice.docx) | A business table with totals |
| [`arabic-letter.docx`](arabic-letter.docx) | A formal letter in Arabic, right to left |
| [`invitation.docx`](invitation.docx) + [`guests.csv`](guests.csv) | Mail merge: fields filled from a list |

Try the mail merge from the command line:

```sh
clerdodraft merge examples/invitation.docx examples/guests.csv invitations.docx
```

Rebuild every file with `npm run examples`.
