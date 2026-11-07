# Interface languages

The interface is available in 19 languages. **View › Interface language** switches between them;
the first time, the app follows the system language when it has it.

| Code | Language | | Code | Language |
|---|---|---|---|---|
| `en` | English | | `ja` | 日本語 |
| `ar` | العربية | | `ko` | 한국어 |
| `de` | Deutsch | | `nl` | Nederlands |
| `es` | Español | | `pl` | Polski |
| `fa` | فارسی | | `pt` | Português |
| `fr` | Français | | `ru` | Русский |
| `hi` | हिन्दी | | `tr` | Türkçe |
| `id` | Bahasa Indonesia | | `uk` | Українська |
| `it` | Italiano | | `ur` | اردو |
| | | | `zh` | 简体中文 |

Arabic, Persian and Urdu turn the whole interface right to left. The document keeps its own
direction.

## How it works

- Each language is a table in `src/ui/i18n/<code>.ts`, keyed by the English text the app shows.
  Only the chosen table is downloaded.
- `src/ui/i18n/index.ts` lists the languages and translates the interface as it appears, without
  touching the page itself, text the person types, or font names.
- `tests/i18n.test.ts` checks that every language has every string and keeps the parts that must not
  change, such as file extensions and the product name.

## Adding or fixing a translation

1. To fix a string, edit its value in that language's file.
2. To add a language, copy an existing file to `src/ui/i18n/<code>.ts`, translate every value, and
   add a line to `LANGUAGES` in `src/ui/i18n/index.ts` with the language's own name and `rtl: true`
   if it is written right to left.
3. When you add interface text in English, add it to `src/ui/i18n/ar.ts` and every other language
   file. `npm test` lists what's missing.

Spelling and hyphenation follow the language of the text, not the interface; see
[FEATURES.md](FEATURES.md).
