import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { AR, AR_SHAPES } from '../src/ui/i18n/ar';

// Every interface language has every string, and keeps the parts that must not change.
const english = Object.keys({ ...AR, ...AR_SHAPES });
const files = readdirSync('src/ui/i18n').filter((f) => /^[a-z]{2}\.ts$/.test(f) && f !== 'ar.ts');

describe('interface languages', () => {
  for (const f of files) {
    it(`${f} is complete`, async () => {
      const table = (await import(`../src/ui/i18n/${f}`)).default as Record<string, string>;
      const missing = english.filter((k) => !table[k]?.trim());
      expect(missing, `missing in ${f}`).toEqual([]);
      const extra = Object.keys(table).filter((k) => !english.includes(k));
      expect(extra, `unknown keys in ${f}`).toEqual([]);
      for (const k of english) {
        for (const keep of k.match(/ClerdoDraft|https?:\/\/\S+|\.[a-z]{2,5}\b|\{[^}]+\}|%\d|\bSUM\(ABOVE\)/g) ?? []) {
          if (keep.startsWith('.') && !/\.(docx|doc|odt|rtf|pdf|xlsx|ods|csv|tsv|json|vcf|md|txt|html|pfx|p12|toml)\b/.test(keep)) continue;
          expect(table[k], `${f}: "${k}" must keep ${keep}`).toContain(keep);
        }
      }
    });
  }
});
