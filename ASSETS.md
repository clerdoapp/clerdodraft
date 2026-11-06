# Third-party assets

| What | Where | Licence |
|---|---|---|
| Lucide icons | npm `lucide-react` | ISC |
| Carlito, Caladea, Arimo, Tinos, Cousine, Hanken Grotesk, Noto Naskh Arabic fonts | npm `@fontsource/*` | SIL OFL 1.1 |
| English dictionaries | npm `dictionary-en`, `dictionary-en-gb` | MIT and BSD-style |
| Hyphenation patterns | npm `hyphen` | ISC |
| Moby Thesaurus word lists | `src/features/proof/wordbook.txt` | Public domain |
| WordNet 3.0 definitions | `src/features/proof/wordbook.txt` | WordNet licence, see `NOTICE` |
| PDF text reader | npm `pdfjs-dist` | Apache-2.0 |

ClerdoDraft's icon and name are Clerdo's own and are not covered by the code licences.

To rebuild the word book: `node scripts/build-wordbook.mjs <moby words.txt> <wordnet dict folder>`.
