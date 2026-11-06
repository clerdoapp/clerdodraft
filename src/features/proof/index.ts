import type { Id, Paragraph, Pos } from '../../core/model';
import { insertText } from '../../core/ops';
import { effectivePara, effectiveRun } from '../../core/styles';
import { walkParagraphs } from '../../core/tree';
import type { EditorStore } from '../../editor/store';
import { checkGrammar, spellWords } from './grammar';
import SpellWorker from './worker?worker&inline';

export interface Issue {
  kind: 'spell' | 'grammar';
  para: Id;
  from: number;
  to: number;
  text: string;
  message: string;
  fix?: string;
}

type Lang = 'en-US' | 'en-GB';

const WORDS_KEY = 'clerdodraft.words';
const OFF_KEY = 'clerdodraft.proofOff';

const load = (k: string): string[] => {
  try { return JSON.parse(localStorage.getItem(k) ?? '[]') as string[]; } catch { return []; }
};

const CHUNK = 1500;

export class Proofer {
  enabled = true;
  private store: EditorStore;
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (v: { wrong?: string[]; suggestions?: string[] }) => void>();
  private results = new WeakMap<object, WeakMap<Paragraph, Issue[]>>();
  private known = new Map<string, boolean>(); // `${lang}|${word}` -> correct
  personal = new Set(load(WORDS_KEY));
  ignored = new Set<string>();
  private ignoredSpots = new Set<string>();
  private timer = 0;
  private running = false;
  private again = false;
  private lastDoc: unknown = null;

  constructor(store: EditorStore) {
    this.store = store;
    try { this.enabled = localStorage.getItem(OFF_KEY) !== '1'; } catch { /* default on */ }
    store.subscribe(() => {
      if (store.doc !== this.lastDoc) {
        this.lastDoc = store.doc;
        this.schedule();
      }
    });
    this.schedule();
  }

  private call(op: 'check' | 'suggest', lang: Lang, words: string[]): Promise<{ wrong?: string[]; suggestions?: string[] }> {
    if (!this.worker) {
      this.worker = new SpellWorker();
      this.worker.onmessage = (e: MessageEvent<{ id: number; wrong?: string[]; suggestions?: string[] }>) => {
        this.pending.get(e.data.id)?.(e.data);
        this.pending.delete(e.data.id);
      };
    }
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ id, op, lang, words });
    });
  }

  schedule(): void {
    window.clearTimeout(this.timer);
    if (this.enabled) this.timer = window.setTimeout(() => void this.run(), 350);
  }

  private langOf(p: Paragraph): Lang {
    const eff = effectivePara(this.store.doc, p.props);
    const l = effectiveRun(this.store.doc, eff, {}).lang ?? 'en-US';
    return l.toLowerCase() === 'en-gb' ? 'en-GB' : 'en-US';
  }

  private masked(p: Paragraph): string {
    const doc = this.store.doc;
    const eff = effectivePara(doc, p.props);
    return p.runs.map((r) => {
      const lang = r.props.lang;
      const skip = r.del || r.atom || r.props.hidden || r.link || (lang && !/^en/i.test(lang)) || effectiveRun(doc, eff, r.props).font?.toLowerCase().includes('courier');
      return skip ? ' '.repeat(r.text.length) : r.text;
    }).join('');
  }

  private bucket(): WeakMap<Paragraph, Issue[]> {
    const key = this.store.doc.styles;
    let b = this.results.get(key);
    if (!b) this.results.set(key, (b = new WeakMap()));
    return b;
  }

  private build(p: Paragraph, lang: Lang): Issue[] {
    const text = this.masked(p);
    const out: Issue[] = [];
    const spot = (from: number, word: string) => `${word}@${from}`;
    for (const w of spellWords(text)) {
      if (this.personal.has(w.word.toLowerCase()) || this.ignored.has(w.word.toLowerCase())) continue;
      if (this.known.get(`${lang}|${w.word}`) === false) out.push({ kind: 'spell', para: p.id, from: w.from, to: w.to, text: text.slice(w.from, w.to), message: 'Not in the dictionary.' });
    }
    for (const f of checkGrammar(text)) {
      if (this.ignored.has(`g:${text.slice(f.from, f.to).toLowerCase()}`) || this.ignoredSpots.has(spot(f.from, p.id))) continue;
      if (out.some((o) => f.from < o.to && o.from < f.to)) continue;
      out.push({ kind: 'grammar', para: p.id, from: f.from, to: f.to, text: text.slice(f.from, f.to), message: f.message, fix: f.fix });
    }
    return out.sort((a, b) => a.from - b.from);
  }

  private async run(): Promise<void> {
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      const doc = this.store.doc;
      const bucket = this.bucket();
      const todo = [...walkParagraphs(doc.blocks)].filter((p) => !bucket.has(p));
      const need = new Map<Lang, Set<string>>();
      for (const p of todo) {
        const lang = this.langOf(p);
        for (const w of spellWords(this.masked(p))) {
          if (!this.known.has(`${lang}|${w.word}`)) {
            let s = need.get(lang);
            if (!s) need.set(lang, (s = new Set()));
            s.add(w.word);
          }
        }
      }
      for (const [lang, set] of need) {
        const list = [...set];
        for (let i = 0; i < list.length; i += CHUNK) {
          const part = list.slice(i, i + CHUNK);
          const r = await this.call('check', lang, part);
          const wrong = new Set(r.wrong);
          for (const w of part) this.known.set(`${lang}|${w}`, !wrong.has(w));
        }
      }
      for (const p of todo) bucket.set(p, this.build(p, this.langOf(p)));
      if (todo.length) this.store.emit();
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(); }
    }
  }

  issuesIn(id: Id, p?: Paragraph): Issue[] {
    if (!this.enabled || !p) return [];
    void id;
    return this.bucket().get(p) ?? [];
  }

  all(): Issue[] {
    if (!this.enabled) return [];
    const b = this.bucket();
    return [...walkParagraphs(this.store.doc.blocks)].flatMap((p) => b.get(p) ?? []);
  }

  at(pos: Pos, p?: Paragraph): Issue | undefined {
    return p ? this.issuesIn(pos.para, p).find((i) => pos.offset >= i.from && pos.offset <= i.to) : undefined;
  }

  async suggestions(i: Issue, lang: Lang = 'en-US'): Promise<string[]> {
    if (i.kind === 'grammar') return i.fix !== undefined ? [i.fix] : [];
    return (await this.call('suggest', lang, [i.text.replace(/’/g, "'")])).suggestions ?? [];
  }

  private rebuild(): void {
    this.results = new WeakMap();
    this.schedule();
    this.store.emit();
  }

  apply(i: Issue, text: string): void {
    const s = this.store;
    const pos = { story: 'body' as const, para: i.para, offset: i.from };
    s.commit(insertText(s.doc, { anchor: pos, focus: { ...pos, offset: i.to } }, text, undefined, s.ctx));
  }

  ignore(i: Issue): void {
    if (i.kind === 'spell') this.ignored.add(i.text.toLowerCase());
    else this.ignoredSpots.add(`${i.para}@${i.from}`);
    this.rebuild();
  }

  ignoreAll(i: Issue): void {
    this.ignored.add(i.kind === 'spell' ? i.text.toLowerCase() : `g:${i.text.toLowerCase()}`);
    this.rebuild();
  }

  addWord(i: Issue): void {
    this.personal.add(i.text.toLowerCase());
    try { localStorage.setItem(WORDS_KEY, JSON.stringify([...this.personal])); } catch { /* kept for this session */ }
    this.rebuild();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try { localStorage.setItem(OFF_KEY, on ? '0' : '1'); } catch { /* kept for this session */ }
    this.rebuild();
  }
}
