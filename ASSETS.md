# Third-party assets

| What | Where | Licence |
|---|---|---|
| Lucide icons, interface and the icon library | npm `lucide-react`, `lucide` | ISC |
| 212 font families, listed with their licences in `src/core/font-catalog.json` | npm `@fontsource/*` | SIL OFL 1.1, Apache-2.0 or Ubuntu Font Licence |
| Hanken Grotesk (interface) | npm `@fontsource/hanken-grotesk` | SIL OFL 1.1 |
| English dictionaries | npm `dictionary-en`, `dictionary-en-gb` | MIT and BSD-style |
| Hyphenation patterns, 21 languages | npm `hyphen` | ISC |
| French, Spanish, Portuguese, Dutch and Russian dictionaries | npm `dictionary-fr`, `-es`, `-pt`, `-nl`, `-ru` | MPL-2.0, MPL-1.1 option, MPL-2.0 option, BSD-3-Clause option, BSD-3-Clause |
| Arabic dictionary (Ayaspell) | `src/features/proof/dict/ar` | MPL option of its tri-licence |
| Signing | npm `node-forge` | BSD-3-Clause option |
| Moby Thesaurus word lists | `src/features/proof/wordbook.txt` | Public domain |
| WordNet 3.0 definitions | `src/features/proof/wordbook.txt` | WordNet licence, see `NOTICE` |
| PDF text reader | npm `pdfjs-dist` | Apache-2.0 |

ClerdoDraft's icon and name are Clerdo's own and are not covered by the code licences.

To rebuild the font list after changing font packages: `node scripts/build-fonts.mjs`.

To rebuild the word book: `node scripts/build-wordbook.mjs <moby words.txt> <wordnet dict folder>`.
