import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignJustify, Coffee, Focus, Moon, Square, Sun, Volume2, X } from 'lucide-react';
import { paraText, walkParagraphs } from '../core/tree';
import { headingLevel } from '../core/styles';
import type { EditorStore } from '../editor/store';
import { canSpeak, speakBlocks, stopSpeaking } from '../features/speech';

type Paper = 'light' | 'sepia' | 'dark';

export const ReaderOverlay = ({ store }: { store: EditorStore }) => {
  const paras = useMemo(() => [...walkParagraphs(store.doc.blocks)].map((p) => ({ id: p.id, text: paraText(p), level: headingLevel(store.doc, p) })).filter((p) => p.text.trim()), [store.doc]);
  const [size, setSize] = useState(22);
  const [leading, setLeading] = useState(1.8);
  const [spacing, setSpacing] = useState(0);
  const [paper, setPaper] = useState<Paper>('light');
  const [focusLines, setFocusLines] = useState(0);
  const [lit, setLit] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const close = () => { stopSpeaking(); store.setView({ reader: false }); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown') { e.preventDefault(); setLit((l) => Math.min(l + 1, paras.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setLit((l) => Math.max(l - 1, 0)); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // Reading stops only when the reader closes, not each time the screen updates.
  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => { body.current?.children[lit]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [lit]);

  const speak = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    if (!canSpeak()) { store.notify('Reading aloud is not available here.'); return; }
    setSpeaking(true);
    speakBlocks(paras.map((p) => p.text), {
      from: lit,
      onBlock: (i) => setLit(i),
      onDone: (ok) => { setSpeaking(false); if (!ok) store.notify("This text couldn't be read aloud. Check that the system has a voice for its language."); },
    });
  };

  return (
    <div className={`reader ${paper}`} role="dialog" aria-label="Focus reader">
      <header>
        <label>Size<input type="range" min={14} max={44} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
        <label>Lines<input type="range" min={1.3} max={3} step={0.1} value={leading} onChange={(e) => setLeading(+e.target.value)} /></label>
        <label>Letters<input type="range" min={0} max={4} step={0.5} value={spacing} onChange={(e) => setSpacing(+e.target.value)} /></label>
        <div className="seg">{([['light', 'Light', Sun], ['sepia', 'Sepia', Coffee], ['dark', 'Dark', Moon]] as const).map(([p, l, I]) => <button key={p} className={`pick${paper === p ? ' on' : ''}`} aria-pressed={paper === p} onClick={() => setPaper(p)}><I size={16} strokeWidth={1.9} aria-hidden="true" />{l}</button>)}</div>
        <div className="seg">{([['All', 0, AlignJustify], ['Focus', 1, Focus]] as const).map(([l, n, I]) => <button key={l} className={`pick${focusLines === n ? ' on' : ''}`} aria-pressed={focusLines === n} onClick={() => setFocusLines(n)}><I size={16} strokeWidth={1.9} aria-hidden="true" />{l}</button>)}</div>
        <button className="tile" onClick={speak}>{speaking ? <Square size={18} strokeWidth={1.9} aria-hidden="true" /> : <Volume2 size={18} strokeWidth={1.9} aria-hidden="true" />}<span>{speaking ? 'Stop' : 'Read aloud'}</span></button>
        <button className="tile" onClick={close}><X size={18} strokeWidth={1.9} aria-hidden="true" /><span>Close</span></button>
      </header>
      <div className="readbody" ref={body} style={{ fontSize: size, lineHeight: leading, letterSpacing: spacing }}>
        {paras.map((p, i) => {
          const Tag = p.level ? 'h2' : 'p';
          return <Tag key={p.id} dir="auto" className={focusLines && i !== lit ? 'dim' : ''} onClick={() => setLit(i)}>{p.text}</Tag>;
        })}
      </div>
    </div>
  );
};
