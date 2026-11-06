// Builds src/features/proof/wordbook.txt from two open word lists:
//   node scripts/build-wordbook.mjs <moby words.txt> <wordnet dict folder>
// Each output line is: word <tab> definitions joined by | <tab> synonyms joined by ,
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mobyFile, dictDir] = process.argv.slice(2);
if (!mobyFile || !dictDir) throw new Error('usage: build-wordbook.mjs <moby> <dict>');
const HEADWORDS = 12000;
const MAX_SYN = 18;
const MAX_DEFS = 3;
const POS = { noun: 'n', verb: 'v', adj: 'adj', adv: 'adv' };
const plain = /^[a-z][a-z'-]*$/;
const BLOCKED = /^(nigger|nigga|negro|faggot|fag|dyke|kike|spic|chink|gook|wop|coon|retard|tranny|cunt|whore|slut)s?$/;

const moby = new Map();
const uses = new Map();
for (const line of readFileSync(mobyFile, 'utf8').split('\n')) {
  const [head, ...syn] = line.split(',');
  if (!head || !plain.test(head) || BLOCKED.test(head)) continue;
  const words = syn.filter((w) => plain.test(w) && !BLOCKED.test(w));
  moby.set(head, words);
  for (const w of words) uses.set(w, (uses.get(w) ?? 0) + 1);
}

const senses = new Map();
for (const [file, tag] of Object.entries(POS)) {
  const data = new Map();
  for (const line of readFileSync(join(dictDir, `data.${file}`), 'latin1').split('\n')) {
    if (line.startsWith(' ') || !line) continue;
    const [left, gloss = ''] = line.split(' | ');
    const f = left.split(' ');
    const count = parseInt(f[3], 16);
    const lemmas = [];
    for (let i = 0; i < count; i++) lemmas.push(f[4 + i * 2].replace(/\(.*\)$/, '').toLowerCase());
    data.set(f[0], { lemmas, gloss: gloss.split(';')[0].replace(/^"|"$/g, '').trim() });
  }
  for (const line of readFileSync(join(dictDir, `index.${file}`), 'latin1').split('\n')) {
    if (line.startsWith(' ') || !line) continue;
    const f = line.trim().split(/\s+/);
    const word = f[0];
    if (!plain.test(word)) continue;
    const ptr = Number(f[3]);
    const ids = f.slice(6 + ptr);
    const list = senses.get(word) ?? [];
    for (const id of ids.slice(0, 3)) {
      const d = data.get(id);
      if (d) list.push({ tag, ...d });
    }
    senses.set(word, list);
  }
}

const heads = [...moby.keys()].filter((w) => senses.has(w) || (uses.get(w) ?? 0) > 3)
  .sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0)).slice(0, HEADWORDS).sort();

const lines = heads.map((w) => {
  const s = senses.get(w) ?? [];
  const defs = s.slice(0, MAX_DEFS).map((x) => `${x.tag}: ${x.gloss}`).filter((x) => !/[\t|]/.test(x));
  const near = s.flatMap((x) => x.lemmas).filter((x) => x !== w && plain.test(x) && !BLOCKED.test(x));
  const wide = [...(moby.get(w) ?? [])].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0));
  const syn = [...new Set([...near, ...wide])].slice(0, MAX_SYN);
  return `${w}\t${defs.join('|')}\t${syn.join(',')}`;
});
writeFileSync('src/features/proof/wordbook.txt', `${lines.join('\n')}\n`);
console.log(lines.length, 'words');
