import { para } from '../core/model';
import { deleteSelection, setParaProps, insertText, mapRunsInSelection } from '../core/ops';
import { findPara, rawParaText } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { ensureList } from './coreCommands';

const KEY = 'clerdodraft.typing';

export interface TypingOptions {
  quotes: boolean;
  capitals: boolean;
  lists: boolean;
  links: boolean;
  replace: boolean;
}

const defaults: TypingOptions = { quotes: true, capitals: true, lists: true, links: true, replace: true };

const load = (): TypingOptions => {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TypingOptions>) }; } catch { return defaults; }
};

export const typing: { options: TypingOptions } = { options: load() };

export const saveTyping = (o: TypingOptions): void => {
  typing.options = o;
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* kept for this session */ }
};

export const FIXES: Record<string, string> = {
  teh: 'the', adn: 'and', recieve: 'receive', recieved: 'received', seperate: 'separate', definately: 'definitely', occured: 'occurred', untill: 'until', wich: 'which', thier: 'their', becuase: 'because', beleive: 'believe', tommorow: 'tomorrow', goverment: 'government', accomodate: 'accommodate', dont: "don't", cant: "can't", wont: "won't", im: "I'm", ive: "I've", i: 'I',
};

const SYMBOLS: [RegExp, string][] = [[/\(c\)$/i, '©'], [/\(r\)$/i, '®'], [/\(tm\)$/i, '™'], [/--$/, '—'], [/\.\.\.$/, '…'], [/->$/, '→'], [/<-$/, '←']];

// Replaces the text just before the caret; a following undo restores what was typed.
const swap = (s: EditorStore, len: number, text: string): void => {
  const pos = s.sel.focus;
  s.onTyped = null;
  s.commit(insertText(s.doc, { anchor: { ...pos, offset: pos.offset - len }, focus: pos }, text, undefined, s.ctx), { group: true });
  s.onTyped = handler(s);
};

const handler = (s: EditorStore) => (typed: string): void => {
  if (typed.length !== 1) return;
  const o = typing.options;
  const pos = s.sel.focus;
  const p = findPara(s.doc, pos);
  if (!p) return;
  const text = rawParaText(p);
  const before = text.slice(0, pos.offset);

  if (o.quotes && (typed === '"' || typed === "'")) {
    const prev = before[before.length - 2] ?? ' ';
    const open = /[\s([{—–]/.test(prev);
    swap(s, 1, typed === '"' ? (open ? '“' : '”') : (open ? '‘' : '’'));
    return;
  }

  if (o.replace) {
    for (const [re, rep] of SYMBOLS) {
      const m = re.exec(before);
      if (m) { swap(s, m[0].length, rep); return; }
    }
  }

  if (typed !== ' ' && !/[.,;:!?]/.test(typed)) return;

  if (o.lists && typed === ' ' && !p.props.numbering) {
    const bullet = /^[-*]\s$/.test(before);
    const num = /^1[.)]\s$/.test(before);
    if (bullet || num) {
      const removed = deleteSelection(s.doc, { anchor: { ...pos, offset: 0 }, focus: pos });
      const { doc, numId } = ensureList(removed.doc, bullet ? 'bullet' : 'number');
      s.commit({ doc: setParaProps(doc, removed.sel, { numbering: { numId, level: 0 } }), sel: removed.sel });
      return;
    }
  }

  const word = /(\S+)[\s.,;:!?]$/.exec(before)?.[1] ?? '';
  if (!word) return;
  const wordEnd = pos.offset - 1;
  const wordStart = wordEnd - word.length;

  if (o.links && typed === ' ' && /^(https?:\/\/|www\.)\S+\.\S+$/i.test(word)) {
    const href = word.startsWith('www.') ? `https://${word}` : word;
    const at = { ...pos, offset: wordStart };
    s.commit(mapRunsInSelection(s.doc, { anchor: at, focus: { ...pos, offset: wordEnd } }, (r) => ({ ...r, link: { href }, props: { ...r.props, charStyle: 'Hyperlink' } })));
    return;
  }

  if (o.replace) {
    const fix = FIXES[word.toLowerCase()];
    if (fix && (word === word.toLowerCase() || fix[0] !== fix[0]!.toLowerCase())) {
      const out = /^\p{Lu}/u.test(word) ? fix[0]!.toUpperCase() + fix.slice(1) : fix;
      const pos2 = s.sel.focus;
      s.onTyped = null;
      s.commit(insertText(s.doc, { anchor: { ...pos2, offset: wordStart }, focus: { ...pos2, offset: wordEnd } }, out, undefined, s.ctx), { group: true });
      s.onTyped = handler(s);
      const end = { ...s.sel.focus, offset: wordStart + out.length + 1 };
      s.setSel({ anchor: end, focus: end });
      return;
    }
  }

  if (o.capitals && /^\p{Ll}/u.test(word)) {
    const head = before.slice(0, wordStart);
    if (/(^|[.!?]\s+)$/.test(head) && !/(?:\b(?:e\.g|i\.e|etc|vs)\.)\s+$/i.test(head) && !/[./@]/.test(word)) {
      const pos2 = s.sel.focus;
      s.onTyped = null;
      s.commit(insertText(s.doc, { anchor: { ...pos2, offset: wordStart }, focus: { ...pos2, offset: wordStart + 1 } }, word[0]!.toUpperCase(), undefined, s.ctx), { group: true });
      s.onTyped = handler(s);
      const after = s.sel.focus;
      s.setSel({ anchor: { ...after, offset: pos2.offset }, focus: { ...after, offset: pos2.offset } });
    }
  }
};

export const registerAutoType = (s: EditorStore): void => {
  s.onTyped = handler(s);
};

void para;
